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

    // Configure STT Sarvam
    const stt = new SarvamSTT({
      language: activeAgent?.language || 'en-IN',
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

    // Listen to session close to compile and enqueue report
    session.on('close', async () => {
      console.log('[LiveKit Agent] Session closed. Handling final report compilation...');
      try {
        const endTime = new Date();
        const startTime = dbSession?.startTime || new Date();
        const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

        const chatMessages = session.chatCtx.items.filter(item => item.type === 'message');
        const formattedTranscript = chatMessages
          .map(msg => {
            const roleName = msg.role === 'assistant' ? 'Agent' : 'Customer';
            const text = msg.textContent || '';
            return `${roleName}: ${text}`;
          })
          .filter(line => line.trim().length > 0)
          .join('\n');

        console.log(`[LiveKit Agent] Compiled transcript:\n${formattedTranscript}`);

        // Update database CallSession
        if (callSessionId) {
          const freshSession = await CallSession.findByPk(callSessionId);
          if (freshSession) {
            freshSession.status = 'completed';
            freshSession.endTime = endTime;
            await freshSession.save();
          }
        }

        // Enqueue report for automated Gemini analysis and campaign updates
        const userId = dbSession?.userId || vobizNumber?.userId;
        const campaignId = dbSession?.campaignId || null;
        const vobizNumberId = dbSession?.vobizNumberId || vobizNumber?.id;
        const customerId = dbSession?.customerId || null;

        if (userId && vobizNumberId && callSessionId) {
          const completionEvent = {
            callSessionId,
            userId,
            campaignId,
            vobizNumberId,
            customerId,
            transcript: formattedTranscript,
            duration,
            recordingUrl: null,
          };

          await QueueService.enqueueReport(completionEvent).catch(() => {});
          console.log(`[LiveKit Agent] Successfully enqueued report to Redis for session: ${callSessionId}`);

          // Immediate analysis fallback to guarantee CallReport creation
          const { processCallAnalysis } = require('../workers/aiWorker');
          processCallAnalysis(completionEvent).catch(aiErr => console.error('[LiveKit Agent] Immediate AI analysis error:', aiErr.message));
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
