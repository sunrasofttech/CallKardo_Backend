const url = require('url');
const { CallSession, Agent, Voice, CallLog, Campaign } = require('../models');
const { GeminiLiveSession } = require('../services/geminiLiveService');
const SarvamService = require('../services/sarvamService');
const QueueService = require('../services/queueService');
const { redisClient } = require('../config/redis');
const defaults = require('../config/defaults');

/**
 * Downsample 16-bit mono PCM from inputRate to outputRate using linear interpolation.
 * VoBiz telephony only supports 8000/16000/24000Hz but Sarvam TTS outputs at 22050Hz.
 */
function resamplePCM(inputBuffer, inputRate, outputRate) {
  if (inputRate === outputRate) return inputBuffer;
  const inputSamples = Math.floor(inputBuffer.length / 2);
  const outputSamples = Math.floor(inputSamples * outputRate / inputRate);
  const outputBuffer = Buffer.alloc(outputSamples * 2);
  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i * inputRate / outputRate;
    const srcFloor = Math.floor(srcPos);
    const srcCeil = Math.min(srcFloor + 1, inputSamples - 1);
    const frac = srcPos - srcFloor;
    const s1 = inputBuffer.readInt16LE(srcFloor * 2);
    const s2 = inputBuffer.readInt16LE(srcCeil * 2);
    const sample = Math.round(s1 + frac * (s2 - s1));
    outputBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }
  return outputBuffer;
}

/**
 * Strip markdown formatting from Gemini text before TTS synthesis.
 */
function stripMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')  // bold
    .replace(/\*(.*?)\*/g, '$1')       // italic
    .replace(/`([^`]*)`/g, '$1')       // inline code
    .replace(/#{1,6}\s/g, '')          // headings
    .replace(/^\s*[-*+]\s+/gm, '')    // bullet points
    .replace(/^\s*\d+\.\s+/gm, '')   // numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/\n{3,}/g, '\n\n')       // excess newlines
    .trim();
}

class VobizSocketHandler {
  /**
   * Handle incoming WebSocket connection from VoBiz
   * @param {WebSocket} ws 
   * @param {IncomingMessage} req 
   */
  async handleConnection(ws, req) {
    const parameters = url.parse(req.url, true).query;
    const token = parameters.token;

    if (!token) {
      console.error('WS Connection rejected: Missing token');
      ws.close(4001, 'Unauthorized: Missing session token');
      return;
    }

    try {
      // 1. Authenticate connection against Call Session
      const session = await CallSession.findOne({
        where: { wsSessionToken: token },
        include: [
          {
            model: Agent,
            as: 'agent',
            include: [{ model: Voice, as: 'voice' }],
          },
        ],
      });

      if (!session) {
        console.error(`WS Connection rejected: Invalid token "${token}"`);
        ws.close(4002, 'Unauthorized: Invalid session token');
        return;
      }

      if (session.status === 'completed' || session.status === 'failed') {
        ws.close(4003, 'Session already terminated');
        return;
      }

      console.log(`VoBiz Connection established for Call Session: ${session.id}`);

      // Update session status to connected
      session.status = 'connected';
      session.startTime = new Date();
      await session.save();

      await CallLog.create({
        callSessionId: session.id,
        logLevel: 'info',
        message: 'VoBiz WebSocket connected and call established',
      });

      // Keep running transcript memory in memory
      const transcriptChunks = [];
      const audioChunks = [];

      // 2. Instantiate Gemini Live Session
      const geminiSession = new GeminiLiveSession({
        systemPrompt: session.agent.systemPrompt,
        model: defaults.gemini.liveModel,
        onResponseText: async (text) => {
          try {
            console.log(`[Gemini Response]: ${text}`);
            transcriptChunks.push({ role: 'agent', text });

            // Track agent speaking state
            ws.isAgentSpeaking = true;
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            const durationMs = Math.max(1500, wordCount * 450); // ~450ms per word, min 1.5s
            if (ws.speakingTimeout) {
              clearTimeout(ws.speakingTimeout);
            }
            ws.speakingTimeout = setTimeout(() => {
              ws.isAgentSpeaking = false;
            }, durationMs);

            await CallLog.create({
              callSessionId: session.id,
              logLevel: 'info',
              message: `Agent responded: ${text}`,
            });

            // Strip markdown before TTS (Gemini sometimes returns bold/bullets)
            const cleanText = stripMarkdown(text);
            if (!cleanText) {
              console.warn('[TTS] Skipping empty/markdown-only response');
              return;
            }

            // Synthesize Response text -> Voice Audio
            const voiceName = session.agent.voice?.voiceId || defaults.sarvam.defaultVoiceId;
            const language = session.agent.language || defaults.sarvam.defaultLanguageCode;
            console.log(`[TTS] Synthesizing: "${cleanText.substring(0, 60)}..." voice=${voiceName}`);

            const audioBuffer = await SarvamService.synthesizeText(cleanText, voiceName, language, {
              pace: session.agent.pace,
              temperature: session.agent.temperature,
            });

            // Send audio back to VoBiz as JSON playAudio event
            // Sarvam outputs WAV at 22050Hz — resample to 8000Hz for telephony
            if (ws.readyState === ws.OPEN && audioBuffer.length > 44) {
              const srcRate = audioBuffer.readUInt32LE(24); // sample rate from WAV header
              const rawPcm = audioBuffer.slice(44);         // strip WAV header
              const TARGET_RATE = 16000;                    // Match incoming L16 16kHz for best quality
              const resampledPcm = resamplePCM(rawPcm, srcRate, TARGET_RATE);
              console.log(`[TTS] ${rawPcm.length}B @${srcRate}Hz → ${resampledPcm.length}B @${TARGET_RATE}Hz`);

              const playAudioEvent = JSON.stringify({
                event: 'playAudio',
                media: {
                  contentType: 'audio/x-l16',
                  sampleRate: TARGET_RATE,
                  payload: resampledPcm.toString('base64'),
                },
              });
              ws.send(playAudioEvent);
              audioChunks.push(resampledPcm);
            } else if (audioBuffer.length <= 44) {
              console.warn('[TTS] Audio buffer too small — TTS likely failed');
            }
          } catch (ttsErr) {
            console.error('Failed to synthesize agent speech:', ttsErr);
            await CallLog.create({
              callSessionId: session.id,
              logLevel: 'error',
              message: `TTS synthesis failure: ${ttsErr.message}`,
            });
          }
        },
        onError: async (err) => {
          console.error(`Gemini session error for call ${session.id}:`, err);
          await CallLog.create({
            callSessionId: session.id,
            logLevel: 'error',
            message: `Gemini Live connection error: ${err.message}`,
          });
        },
        onClose: () => {
          console.log(`Gemini session closed for call ${session.id}`);
        },
      });

      // Connect to Google Gemini
      geminiSession.connect();

      // Store references on the WebSocket object for cleanup
      ws.session = session;
      ws.geminiSession = geminiSession;
      ws.transcriptChunks = transcriptChunks;
      ws.audioChunks = audioChunks;

      // Audio input buffer for debounced STT
      // VoBiz sends many tiny 10ms chunks — we accumulate and only transcribe
      // after 500ms of silence (end-of-utterance detection)
      let audioInputBuffer = [];
      let silenceTimer = null;
      const SILENCE_TIMEOUT_MS = 300; // ms of silence before transcribing (lower = faster response)
      const MIN_BUFFER_BYTES = 1600;  // ~50ms of audio at 16kHz L16 minimum

      const flushAudioBuffer = async () => {
        if (audioInputBuffer.length === 0) return;
        const combinedBuffer = Buffer.concat(audioInputBuffer);
        audioInputBuffer = [];

        if (combinedBuffer.length < MIN_BUFFER_BYTES) {
          console.log(`[STT] Buffer too small (${combinedBuffer.length} bytes), skipping.`);
          return;
        }

        try {
          const transcript = await SarvamService.transcribeAudioChunk(
            combinedBuffer,
            session.agent.language
          );

          if (transcript && transcript.trim()) {
            if (!session.agent.allowInterruption && ws.isAgentSpeaking) {
              console.log(`[Interruption Blocked] Customer spoke: "${transcript}" but agent is speaking.`);
              return;
            }
            if (ws.isAgentSpeaking) {
              ws.isAgentSpeaking = false;
              if (ws.speakingTimeout) clearTimeout(ws.speakingTimeout);
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ event: 'clearAudio' }));
              }
            }
            console.log(`[Customer Speech]: ${transcript}`);
            transcriptChunks.push({ role: 'customer', text: transcript });
            await CallLog.create({
              callSessionId: session.id,
              logLevel: 'info',
              message: `Customer spoke: ${transcript}`,
            });
            geminiSession.sendUserTurn(transcript);
          }
        } catch (sttErr) {
          console.error('[STT] Transcription error:', sttErr.message);
        }
      };

      // 3. Handle incoming customer audio stream
      // VoBiz sends JSON frames with events: 'start', 'media', 'stop'
      ws.on('message', async (message) => {
        try {
          const frame = JSON.parse(message.toString());

          if (frame.event === 'start') {
            console.log(`[VoBiz Stream] Call started. StreamId: ${frame.start?.streamId}`);
            return;
          }

          if (frame.event === 'stop') {
            console.log(`[VoBiz Stream] Call stopped by VoBiz.`);
            if (silenceTimer) clearTimeout(silenceTimer);
            await flushAudioBuffer();
            return;
          }

          if (frame.event === 'media' && frame.media?.payload) {
            // Accumulate chunk into buffer
            const audioBuffer = Buffer.from(frame.media.payload, 'base64');
            audioInputBuffer.push(audioBuffer);
            audioChunks.push(audioBuffer);

            // Reset debounce timer — flush after 500ms of silence
            if (silenceTimer) clearTimeout(silenceTimer);
            silenceTimer = setTimeout(flushAudioBuffer, SILENCE_TIMEOUT_MS);
          }
        } catch (msgErr) {
          console.error('Error handling VoBiz stream frame:', msgErr);
        }
      });

      // 4. Handle Disconnects & Session Cleanup
      ws.on('close', async (code, reason) => {
        console.log(`VoBiz WebSocket connection closed for session ${session.id}. Code: ${code}`);
        if (silenceTimer) clearTimeout(silenceTimer);
        await flushAudioBuffer(); // flush any remaining audio before cleanup
        await this._cleanupSession(ws);
      });

      ws.on('error', async (error) => {
        console.error(`WebSocket error in session ${session.id}:`, error);
        await CallLog.create({
          callSessionId: session.id,
          logLevel: 'error',
          message: `WebSocket session error: ${error.message}`,
        });
      });

    } catch (err) {
      console.error('WebSocket connection setup crash:', err);
      ws.close(1011, 'Internal connection error');
    }
  }

  /**
   * Finalize call records, save logs, decrement concurrency counters, and wake up AI worker
   */
  async _cleanupSession(ws) {
    const { session, geminiSession, transcriptChunks } = ws;
    if (!session) return;

    try {
      // Clear speaking timeout
      if (ws.speakingTimeout) {
        clearTimeout(ws.speakingTimeout);
      }

      // Disconnect Gemini
      if (geminiSession) {
        geminiSession.close();
      }

      const freshSession = await CallSession.findByPk(session.id);
      if (freshSession && freshSession.status === 'connected') {
        freshSession.status = 'completed';
        freshSession.endTime = new Date();
        await freshSession.save();

        await CallLog.create({
          callSessionId: session.id,
          logLevel: 'info',
          message: 'Call session finished. WebSocket closed.',
        });

        // Decrement concurrency tracker via ZSET deregistration
        if (session.campaignId) {
          await QueueService.deregisterActiveCall(session.campaignId, session.id);
        }

        // Standardize transcript as a formatted text
        const formattedTranscript = transcriptChunks
          .map((c) => `${c.role === 'customer' ? 'Customer' : 'Agent'}: ${c.text}`)
          .join('\n');

        // Compile conversation recording
        let fileName = null;
        if (ws.audioChunks && ws.audioChunks.length > 0) {
          try {
            const fs = require('fs');
            const path = require('path');
            const uploadsDir = path.join(__dirname, '../../uploads');
            if (!fs.existsSync(uploadsDir)) {
              fs.mkdirSync(uploadsDir, { recursive: true });
            }
            fileName = `recording-${session.id}.wav`;
            const filePath = path.join(uploadsDir, fileName);
            const recordingBuffer = Buffer.concat(ws.audioChunks);
            fs.writeFileSync(filePath, recordingBuffer);
            console.log(`Saved call recording to ${filePath}`);
          } catch (recordErr) {
            console.error('Failed to save call recording:', recordErr);
          }
        }

        // Reliable report queuing
        const completionEvent = {
          callSessionId: session.id,
          userId: session.userId,
          campaignId: session.campaignId,
          vobizNumberId: session.vobizNumberId,
          customerId: session.customerId,
          transcript: formattedTranscript,
          duration: Math.round(
            (freshSession.endTime.getTime() - freshSession.startTime.getTime()) / 1000
          ),
          recordingUrl: fileName ? `/uploads/${fileName}` : null,
        };

        // Enqueue report for worker processing (Reliable Queue)
        await QueueService.enqueueReport(completionEvent);

        // Clear memory references to prevent socket memory leaks
        ws.audioChunks = null;
        ws.transcriptChunks = null;
      }
    } catch (cleanError) {
      console.error('Error during call session cleanup:', cleanError);
    }
  }
}

module.exports = new VobizSocketHandler();
