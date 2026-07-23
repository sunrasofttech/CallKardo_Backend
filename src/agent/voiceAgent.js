const { defineAgent, voice } = require('@livekit/agents');
const openai = require('@livekit/agents-plugin-openai');
const defaults = require('../config/defaults');
const { VobizNumber, Agent: DBAgent, Voice, CallSession } = require('../models');
const { Op } = require('sequelize');
const QueueService = require('../services/queueService');
const { SarvamSTT, SarvamTTS } = require('../services/livekitSarvamPlugin');

const voiceAgent = defineAgent({
  entry: async (ctx) => {
    console.log('[LiveKit Agent] Connecting to the room...');
    await ctx.connect();

    // Wait for the caller to join the room
    console.log('[LiveKit Agent] Waiting for participant to connect...');
    const participant = await ctx.waitForParticipant();
    console.log(`[LiveKit Agent] Participant connected: ${participant.identity}`);

    // Default configuration fallback
    let systemPrompt = "You are a helpful, natural, friendly voice assistant. Keep responses short and conversational.";
    let greeting = "Hello, how can I help you today?";
    let voiceId = defaults.sarvam.defaultVoiceId || 'amrit'; // Sarvam default speaker
    let activeAgent = null;
    let dbSession = null;
    let vobizNumber = null;

    // Detect dialed number from SIP participant attributes
    const attributes = participant.attributes || {};
    const toNum = attributes['sip.trunkPhoneNumber'] || '';
    const fromNum = attributes['sip.phoneNumber'] || participant.identity.replace('sip:', '');

    if (toNum) {
      console.log(`[LiveKit Agent] Dialed number: ${toNum}`);
      try {
        const cleanToNum = toNum.startsWith('+') ? toNum.substring(1) : toNum;
        const searchNumbers = [toNum, cleanToNum, `+${cleanToNum}`];

        vobizNumber = await VobizNumber.findOne({
          where: { number: searchNumbers, status: 'active' },
          include: [{ model: DBAgent, as: 'agent', include: [{ model: Voice, as: 'voice' }] }]
        });

        if (vobizNumber && vobizNumber.agent) {
          activeAgent = vobizNumber.agent;
          systemPrompt = activeAgent.systemPrompt;
          greeting = activeAgent.firstMessage || greeting;
          if (activeAgent.voice?.voiceId) {
            voiceId = activeAgent.voice.voiceId;
          }
          console.log(`[LiveKit Agent] Successfully loaded agent configuration: ${activeAgent.name}`);
        } else {
          console.warn(`[LiveKit Agent] No active agent config found for number: ${toNum}`);
        }
      } catch (dbErr) {
        console.error('[LiveKit Agent] Database agent lookup failed:', dbErr.message);
      }
    }

    const roomName = ctx.room.name;
    let callSessionId = null;
    if (roomName.startsWith('sip_call_')) {
      callSessionId = roomName.substring('sip_call_'.length);
    } else if (roomName.startsWith('call_')) {
      callSessionId = roomName.substring('call_'.length);
    }

    try {
      const searchConditions = [];
      if (callSessionId) {
        // Handle UUID primary key match
        searchConditions.push({ id: callSessionId });
      }
      // Handle wsSessionToken match (for dynamically mapped rooms)
      searchConditions.push({ wsSessionToken: roomName });

      // Handle vobizCallUuid match from SIP trunk attributes
      const sipCallId = attributes['sip.callID'] || attributes['sip.callid'] || '';
      if (sipCallId) {
        searchConditions.push({ vobizCallUuid: sipCallId });
      }

      dbSession = await CallSession.findOne({
        where: {
          [Op.or]: searchConditions
        }
      });

      if (dbSession) {
        console.log(`[LiveKit Agent] Linked to call session: ${dbSession.id}`);
        // Mark call as connected in the DB
        dbSession.status = 'connected';
        dbSession.startTime = new Date();
        await dbSession.save();
      } else {
        console.warn(`[LiveKit Agent] No session found matching ID "${callSessionId}" or Token "${roomName}"`);
      }
    } catch (err) {
      console.error('[LiveKit Agent] CallSession database lookup failed:', err.message);
    }

    const customerChunks = [];
    const agentChunks = [];
    const callStartTime = Date.now();

    // Configure STT Sarvam
    const stt = new SarvamSTT({
      language: activeAgent?.language || 'en-IN',
      onAudioChunk: (pcmBuffer) => {
        const offset = (Date.now() - callStartTime) * 32;
        customerChunks.push({ offset, buffer: pcmBuffer });
      },
    });

    // Configure LLM dynamically
    let llm;
    if (activeAgent?.aiProvider === 'customv2') {
      // Sarvam LLM
      llm = new openai.LLM({
        apiKey: defaults.sarvam.apiKey,
        baseURL: `${defaults.sarvam.apiBaseUrl}/v1`,
        model: defaults.sarvam.chatModel || 'sarvam-2b',
        temperature: activeAgent?.temperature || 0.55,
      });
      console.log('[LiveKit Agent] LLM provider: Sarvam (customv2)');
    } else {
      // Default: Gemini (custom)
      llm = new openai.LLM({
        apiKey: defaults.gemini.apiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: defaults.gemini.liveModel || 'gemini-2.5-flash-lite',
        temperature: activeAgent?.temperature || 0.60,
      });
      console.log('[LiveKit Agent] LLM provider: Gemini (custom)');
    }

    // Configure TTS Sarvam
    const tts = new SarvamTTS({
      language: activeAgent?.language || 'en-IN',
      voiceId: voiceId,
      pace: activeAgent?.pace || 1.10,
      temperature: 0.75,
      onAudioChunk: (pcmBuffer) => {
        const offset = (Date.now() - callStartTime) * 32;
        agentChunks.push({ offset, buffer: pcmBuffer });
      },
    });

    // Create voice agent session with adaptive VAD & interruption settings
    const session = new voice.AgentSession({
      stt,
      llm,
      tts,
    });

    // Instantiate Agent config
    const agentInstance = new voice.Agent({
      instructions: systemPrompt,
      allowInterruptions: activeAgent?.allowInterruption !== false,
    });

    // Bind and start the session
    await session.start({
      agent: agentInstance,
      room: ctx.room,
    });

    console.log(`[LiveKit Agent] Session started in room: ${roomName}`);

    // Greet the customer
    if (greeting) {
      session.say(greeting);
    }

    const localTranscript = [];
    session.on('user_input_transcribed', (ev) => {
      if (ev.transcript && ev.transcript.trim()) {
        console.log(`[LiveKit Agent Transcript] User: ${ev.transcript}`);
        localTranscript.push(`Customer: ${ev.transcript.trim()}`);
      }
    });

    session.on('conversation_item_added', (ev) => {
      if (ev.item && ev.item.role !== 'system') {
        const role = (ev.item.role === 'assistant' || ev.item.role === 'agent') ? 'Agent' : 'Customer';
        let text = '';
        if (typeof ev.item.content === 'string') {
          text = ev.item.content;
        } else if (Array.isArray(ev.item.content)) {
          text = ev.item.content.map(c => typeof c === 'string' ? c : (c.text || c.textContent || '')).join(' ');
        }
        if (text.trim().length > 0) {
          const line = `${role}: ${text.trim()}`;
          if (localTranscript.length === 0 || localTranscript[localTranscript.length - 1] !== line) {
            console.log(`[LiveKit Agent Transcript] Item: ${line}`);
            localTranscript.push(line);
          }
        }
      }
    });

    // Listen to session close to compile and enqueue report
    session.on('close', async () => {
      console.log('[LiveKit Agent] Session closed. Handling final report compilation...');
      try {
        const endTime = new Date();
        const startTime = dbSession?.startTime || new Date();
        const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

        // Extract transcript from chat context with error handling
        let formattedTranscript = '';
        try {
          const rawMessages = session.chatCtx?.messages || session.chatCtx?.items || session.history || [];
          const extracted = (rawMessages || [])
            .filter(msg => msg && msg.role !== 'system')
            .map(msg => {
              const roleName = (msg.role === 'assistant' || msg.role === 'agent') ? 'Agent' : 'Customer';
              let text = '';
              if (typeof msg.content === 'string') {
                text = msg.content;
              } else if (Array.isArray(msg.content)) {
                text = msg.content.map(c => typeof c === 'string' ? c : (c.text || c.textContent || '')).join(' ');
              } else {
                text = msg.text || msg.textContent || msg.message || '';
              }
              return `${roleName}: ${text.trim()}`;
            })
            .filter(line => line.trim().length > 4); // Relaxed minimum length filter

          if (extracted.length > 0) {
            formattedTranscript = extracted.join('\n');
          }
        } catch (transcriptErr) {
          console.warn('[LiveKit Agent] Failed to extract transcript from chatCtx:', transcriptErr.message);
        }

        if (formattedTranscript.length === 0 && localTranscript.length > 0) {
          formattedTranscript = localTranscript.join('\n');
          console.log('[LiveKit Agent] Fell back to localTranscript.');
        }

        console.log(`[LiveKit Agent] Compiled transcript (${formattedTranscript.length} chars):`);
        if (formattedTranscript.length > 0) {
          console.log(`[LiveKit Agent] Transcript preview: ${formattedTranscript.substring(0, 200)}...`);
        }

        // Resolve session ID (prefer DB session, then from room name)
        const resolvedSessionId = dbSession?.id || callSessionId;

        // Compile audio recording if chunks present
        let recordingUrl = null;
        if (customerChunks.length > 0 || agentChunks.length > 0) {
          try {
            const fs = require('fs');
            const path = require('path');
            const uploadsDir = path.join(__dirname, '../../uploads');
            if (!fs.existsSync(uploadsDir)) {
              fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const fileName = `recording-${resolvedSessionId}.wav`;
            const filePath = path.join(uploadsDir, fileName);

            const totalDurationBytes = Math.max(32000, (Date.now() - callStartTime) * 32);
            const customerTimeline = Buffer.alloc(totalDurationBytes);
            const agentTimeline = Buffer.alloc(totalDurationBytes);

            for (const chunk of customerChunks) {
              if (chunk && chunk.buffer && chunk.offset >= 0 && chunk.offset < totalDurationBytes) {
                const copyLen = Math.min(chunk.buffer.length, totalDurationBytes - chunk.offset);
                chunk.buffer.copy(customerTimeline, chunk.offset, 0, copyLen);
              }
            }

            for (const chunk of agentChunks) {
              if (chunk && chunk.buffer && chunk.offset >= 0 && chunk.offset < totalDurationBytes) {
                const copyLen = Math.min(chunk.buffer.length, totalDurationBytes - chunk.offset);
                chunk.buffer.copy(agentTimeline, chunk.offset, 0, copyLen);
              }
            }

            const mixedBuffer = Buffer.alloc(totalDurationBytes);
            const sampleCount = Math.floor(totalDurationBytes / 2);
            for (let i = 0; i < sampleCount; i++) {
              const s1 = customerTimeline.readInt16LE(i * 2);
              const s2 = agentTimeline.readInt16LE(i * 2);
              const mixed = Math.max(-32768, Math.min(32767, s1 + s2));
              mixedBuffer.writeInt16LE(mixed, i * 2);
            }

            const header = Buffer.alloc(44);
            header.write('RIFF', 0);
            header.writeUInt32LE(36 + mixedBuffer.length, 4);
            header.write('WAVE', 8);
            header.write('fmt ', 12);
            header.writeUInt32LE(16, 16);
            header.writeUInt16LE(1, 20); // PCM
            header.writeUInt16LE(1, 22); // Mono
            header.writeUInt32LE(16000, 24); // 16kHz
            header.writeUInt32LE((16000 * 16 * 1) / 8, 28);
            header.writeUInt16LE((16 * 1) / 8, 32);
            header.writeUInt16LE(16, 34);
            header.write('data', 36);
            header.writeUInt32LE(mixedBuffer.length, 40);

            const wavBuffer = Buffer.concat([header, mixedBuffer]);
            fs.writeFileSync(filePath, wavBuffer);
            recordingUrl = `/uploads/${fileName}`;
            console.log(`[LiveKit Agent] Saved call recording file to disk: ${filePath} (${wavBuffer.length} bytes)`);
          } catch (recErr) {
            console.error('[LiveKit Agent] Failed to save recording to disk:', recErr.message);
          }
        }

        // Update database CallSession
        if (resolvedSessionId) {
          try {
            const freshSession = await CallSession.findByPk(resolvedSessionId);
            if (freshSession) {
              freshSession.status = 'completed';
              freshSession.endTime = endTime;
              await freshSession.save();
            }
          } catch (dbSaveErr) {
            console.error('[LiveKit Agent] Failed to update CallSession:', dbSaveErr.message);
          }
        }

        // Resolve all IDs for report — always attempt to create a report
        const userId = dbSession?.userId || vobizNumber?.userId;
        const campaignId = dbSession?.campaignId || null;
        const resolvedVobizNumberId = dbSession?.vobizNumberId || vobizNumber?.id || null;
        const customerId = dbSession?.customerId || null;

        if (resolvedSessionId && userId) {
          const completionEvent = {
            callSessionId: resolvedSessionId,
            userId,
            campaignId,
            vobizNumberId: resolvedVobizNumberId,
            customerId,
            transcript: formattedTranscript,
            duration,
            recordingUrl,
          };

          console.log(`[LiveKit Agent] Enqueuing report for session ${resolvedSessionId}:`, {
            userId,
            customerId,
            campaignId,
            vobizNumberId: resolvedVobizNumberId,
            transcriptLen: formattedTranscript.length,
            duration,
          });

          await QueueService.enqueueReport(completionEvent).catch((qErr) => {
            console.error('[LiveKit Agent] Failed to enqueue report:', qErr.message);
          });

          // Immediate analysis fallback to guarantee CallReport creation
          const { processCallAnalysis } = require('../workers/aiWorker');
          await processCallAnalysis(completionEvent).catch(aiErr =>
            console.error('[LiveKit Agent] Immediate AI analysis error:', aiErr.message)
          );
        } else {
          console.warn(`[LiveKit Agent] Cannot create report — missing resolvedSessionId (${resolvedSessionId}) or userId (${userId})`);
        }
      } catch (err) {
        console.error('[LiveKit Agent] Error compiling/saving final call report:', err.message);
      } finally {
        ctx.shutdown('Agent session ended');
      }
    });
  }
});

module.exports = voiceAgent;
module.exports.default = voiceAgent;
