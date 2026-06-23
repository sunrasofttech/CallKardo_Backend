const url = require('url');
const { CallSession, Agent, Voice, CallLog, Campaign } = require('../models');
const QueueService = require('../services/queueService');
const VoicePipeline = require('../services/voicePipeline');

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

      console.log(`[VoBiz Call Connected] WebSocket connection established for Session: ${session.id}`);

      // Update session status to connected
      session.status = 'connected';
      session.startTime = new Date();
      await session.save();

      await CallLog.create({
        callSessionId: session.id,
        logLevel: 'info',
        message: 'VoBiz WebSocket connected and call established',
      });

      // Keep transcript and audio for CallLog/QueueService when call ends
      const transcriptChunks = [];
      const audioChunks = [];

      // 2. Instantiate generic Voice Pipeline
      const pipeline = new VoicePipeline({
        agent: session.agent,
        onAudioOutput: (pcmBuffer, targetRate) => {
          if (ws.readyState === ws.OPEN) {
            const playAudioEvent = JSON.stringify({
              event: 'playAudio',
              media: {
                contentType: 'audio/x-l16',
                sampleRate: targetRate,
                payload: pcmBuffer.toString('base64'),
              },
            });
            ws.send(playAudioEvent);
            audioChunks.push(pcmBuffer);
          }
        },
        onClearAudio: () => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ event: 'clearAudio' }));
          }
        },
        onAgentTranscription: (text) => {
          console.log(`[VoBiz Conversation] Agent: ${text}`);
          transcriptChunks.push({ role: 'agent', text });
        },
        onCustomerTranscription: (text) => {
          console.log(`[VoBiz Conversation] Customer: ${text}`);
          transcriptChunks.push({ role: 'customer', text });
        },
        onLog: async (level, message) => {
          await CallLog.create({
            callSessionId: session.id,
            logLevel: level,
            message: message,
          });
        },
      });

      // Store references on the WebSocket object for cleanup
      ws.session = session;
      ws.pipeline = pipeline;
      ws.transcriptChunks = transcriptChunks;
      ws.audioChunks = audioChunks;

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
            if (ws.pipeline) {
              if (ws.pipeline.silenceTimer) {
                clearTimeout(ws.pipeline.silenceTimer);
                ws.pipeline.silenceTimer = null;
              }
              await ws.pipeline.flushAudioBuffer();
            }
            return;
          }

          if (frame.event === 'media' && frame.media?.payload) {
            const audioBuffer = Buffer.from(frame.media.payload, 'base64');
            audioChunks.push(audioBuffer);
            pipeline.handleAudioInput(audioBuffer);
          }
        } catch (msgErr) {
          console.error('Error handling VoBiz stream frame:', msgErr);
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

  async _cleanupSession(ws) {
    const { session, pipeline, transcriptChunks } = ws;
    if (!session) return;

    try {
      if (pipeline) {
        await pipeline.close();
      }

      const freshSession = await CallSession.findByPk(session.id);
      if (freshSession && freshSession.status === 'connected') {
        freshSession.status = 'completed';
        freshSession.endTime = new Date();
        await freshSession.save();

        const duration = Math.round(
          (freshSession.endTime.getTime() - freshSession.startTime.getTime()) / 1000
        );
        console.log(`[VoBiz Call Ended] Call Session ${session.id} finished. Duration: ${duration} seconds.`);

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
