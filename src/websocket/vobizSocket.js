const url = require('url');
const { CallSession, Agent, Voice, CallLog, Campaign } = require('../models');
const { GeminiLiveSession } = require('../services/geminiLiveService');
const SarvamService = require('../services/sarvamService');
const QueueService = require('../services/queueService');
const { redisClient } = require('../config/redis');
const defaults = require('../config/defaults');

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

      // 2. Instantiate Gemini Live Session
      const geminiSession = new GeminiLiveSession({
        systemPrompt: session.agent.systemPrompt,
        model: defaults.gemini.liveModel,
        onResponseText: async (text) => {
          try {
            console.log(`[Gemini Response]: ${text}`);
            transcriptChunks.push({ role: 'agent', text });

            await CallLog.create({
              callSessionId: session.id,
              logLevel: 'info',
              message: `Agent responded: ${text}`,
            });

            // Synthesize Response text -> Voice Audio
            const voiceName = session.agent.voice.voiceId;
            const language = session.agent.language;
            const audioBuffer = await SarvamService.synthesizeText(text, voiceName, language);

            // Stream audio chunk back to VoBiz WS
            if (ws.readyState === ws.OPEN) {
              ws.send(audioBuffer);
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

      // 3. Handle incoming customer audio stream (Binary frames)
      ws.on('message', async (message, isBinary) => {
        try {
          if (isBinary) {
            // Process audio bytes via Sarvam STT
            // Note: In real-world low latency, you'd buffer or stream chunks. 
            // Here we transcribe the received chunk.
            const transcript = await SarvamService.transcribeAudioChunk(
              message,
              session.agent.language
            );

            if (transcript && transcript.trim()) {
              console.log(`[Customer Speech]: ${transcript}`);
              transcriptChunks.push({ role: 'customer', text: transcript });

              await CallLog.create({
                callSessionId: session.id,
                logLevel: 'info',
                message: `Customer spoke: ${transcript}`,
              });

              // Feed text transcript to Gemini Live session
              geminiSession.sendUserTurn(transcript);
            }
          } else {
            // Handle control/text frames from VoBiz if any
            const txtMsg = message.toString();
            console.log(`Received non-binary text frame from VoBiz: ${txtMsg}`);
          }
        } catch (msgErr) {
          console.error('Error handling customer stream frame:', msgErr);
        }
      });

      // 4. Handle Disconnects & Session Cleanup
      ws.on('close', async (code, reason) => {
        console.log(`VoBiz WebSocket connection closed for session ${session.id}. Code: ${code}`);
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

        // Decrement concurrency tracker
        if (session.campaignId) {
          await QueueService.decrementActiveCalls(session.campaignId);
        }

        // Standardize transcript as a formatted text
        const formattedTranscript = transcriptChunks
          .map((c) => `${c.role === 'customer' ? 'Customer' : 'Agent'}: ${c.text}`)
          .join('\n');

        // Publish event to Redis for AI Worker to analyze call logs
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
        };

        // Publish message
        await redisClient.publish('call_completed', JSON.stringify(completionEvent));
      }
    } catch (cleanError) {
      console.error('Error during call session cleanup:', cleanError);
    }
  }
}

module.exports = new VobizSocketHandler();
