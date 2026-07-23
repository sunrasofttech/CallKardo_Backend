const url = require('url');
const { CallSession, Agent, Voice, CallLog, Campaign, Customer, VobizAccount, User } = require('../models');
const QueueService = require('../services/queueService');
const VoicePipeline = require('../services/voicePipeline');
const VobizService = require('../services/vobizService');
const { decrypt } = require('../utils/crypto');

const encodeTable = [
    0,0,1,1,2,2,2,2,3,3,3,3,3,3,3,3,
    4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,
    5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,
    5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,
    6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
    6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
    6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
    6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
    7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
    7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
    7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
    7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
    7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
    7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
    7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
    7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7];

const decodeTable = [0,132,396,924,1980,4092,8316,16764];
const BIAS = 0x84;
const CLIP = 32635;

function encodeMuLawSample(sample) {
  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  sample = sample + BIAS;
  if (sample > CLIP) sample = CLIP;
  let exponent = encodeTable[(sample>>7) & 0xFF];
  let mantissa = (sample >> (exponent+3)) & 0x0F;
  return (sign | (exponent << 4) | mantissa) ^ 0xFF;
}

function decodeMuLawSample(muLawSample) {
  muLawSample = muLawSample ^ 0xFF;
  let sign = (muLawSample & 0x80);
  let exponent = (muLawSample >> 4) & 0x07;
  let mantissa = muLawSample & 0x0F;
  let sample = decodeTable[exponent] + (mantissa << (exponent+3));
  return (sign !== 0) ? -sample : sample;
}

function decodeMuLaw(muLawBuffer) {
  const pcm = Buffer.alloc(muLawBuffer.length * 2);
  for (let i = 0; i < muLawBuffer.length; i++) {
    pcm.writeInt16LE(decodeMuLawSample(muLawBuffer[i]), i * 2);
  }
  return pcm;
}

function encodeMuLaw(pcmBuffer) {
  const muLaw = Buffer.alloc(pcmBuffer.length / 2);
  for (let i = 0; i < muLaw.length; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    muLaw[i] = encodeMuLawSample(sample);
  }
  return muLaw;
}

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

class VobizSocketHandler {
  /**
   * Handle incoming WebSocket connection from VoBiz
   * @param {WebSocket} ws 
   * @param {IncomingMessage} req 
   */
  async handleConnection(ws, req) {
    const parameters = url.parse(req.url, true).query;
    const token = parameters.token;

    // Default media format (updated when the 'start' frame is received)
    ws.mediaFormat = { encoding: 'audio/x-mulaw', sampleRate: 8000 };
    ws.customerChunks = [];
    ws.agentChunks = [];
    ws.transcriptChunks = [];
    ws.callStartTime = Date.now();

    // Synchronously buffer early messages to prevent race conditions
    const earlyBuffer = [];
    const onBufferMessage = (data) => {
      earlyBuffer.push(data);
    };
    ws.on('message', onBufferMessage);

    if (!token) {
      console.error('WS Connection rejected: Missing token');
      ws.removeListener('message', onBufferMessage);
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
          {
            model: Customer,
            as: 'customer',
          },
          {
            model: User,
            as: 'user',
          },
        ],
      });

      if (!session) {
        console.error(`WS Connection rejected: Invalid token "${token}"`);
        ws.removeListener('message', onBufferMessage);
        ws.close(4002, 'Unauthorized: Invalid session token');
        return;
      }

      if (session.status === 'completed' || session.status === 'failed') {
        ws.removeListener('message', onBufferMessage);
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

      // Auto-resolve customer context if missing on session
      let customer = session.customer;
      if (!customer) {
        try {
          const { Op } = require('sequelize');
          const cleanFrom = (session.fromNumber || '').replace(/^\+91/, '').replace(/\D/g, '');
          const cleanTo = (session.toNumber || '').replace(/^\+91/, '').replace(/\D/g, '');

          const searchConditions = [];
          if (session.fromNumber) searchConditions.push({ mobile: session.fromNumber });
          if (session.toNumber) searchConditions.push({ mobile: session.toNumber });
          if (cleanFrom) searchConditions.push({ mobile: { [Op.like]: `%${cleanFrom}` } });
          if (cleanTo) searchConditions.push({ mobile: { [Op.like]: `%${cleanTo}` } });

          if (searchConditions.length > 0) {
            customer = await Customer.findOne({
              where: { [Op.or]: searchConditions },
            });
          }

          if (!customer && session.userId) {
            customer = await Customer.findOne({
              where: { userId: session.userId },
              order: [['updatedAt', 'DESC']],
            });
          }

          if (customer) {
            console.log(`[VoBiz Call] Auto-resolved Customer context: ${customer.name} (${customer.mobile || 'No mobile'})`);
            // Persist resolved customerId back to session DB record so report picks it up
            if (!session.customerId) {
              session.customerId = customer.id;
              await session.save();
              console.log(`[VoBiz Call] Updated session ${session.id} with customerId: ${customer.id}`);
            }
          }
        } catch (custErr) {
          console.warn(`[VoBiz Call] Customer lookup failed: ${custErr.message}`);
        }
      }

      // Keep transcript and audio for CallLog/QueueService when call ends
      const transcriptChunks = ws.transcriptChunks;
      const customerChunks = ws.customerChunks;
      const agentChunks = ws.agentChunks;
      const callStartTime = ws.callStartTime;

      // 2. Instantiate generic Voice Pipeline
      const pipeline = new VoicePipeline({
        agent: session.agent,
        customer: customer,
        merchant: session.user,
        direction: session.direction,
        onAudioOutput: (pcmBuffer, targetRate) => {
          if (ws.readyState === ws.OPEN) {
            const format = ws.mediaFormat || { encoding: 'audio/x-mulaw', sampleRate: 8000 };
            let payloadBuffer;
            let outputContentType;

            const encodingStr = (format.encoding || 'audio/x-mulaw').toLowerCase();
            const isMuLaw = encodingStr.includes('mulaw') || encodingStr.includes('ulaw') || encodingStr.includes('pcmu');

            if (isMuLaw) {
              // Downsample from targetRate to negotiated sample rate (usually 8kHz)
              const resampled = resamplePCM(pcmBuffer, targetRate || 16000, format.sampleRate || 8000);
              // Encode to mu-law
              payloadBuffer = encodeMuLaw(resampled);
              outputContentType = 'audio/x-mulaw';
            } else {
              // Resample from targetRate to negotiated sample rate (L16)
              payloadBuffer = resamplePCM(pcmBuffer, targetRate || 16000, format.sampleRate || 16000);
              outputContentType = 'audio/x-l16';
            }

            const playAudioEvent = JSON.stringify({
              event: 'playAudio',
              media: {
                contentType: outputContentType,
                sampleRate: format.sampleRate || 8000,
                payload: payloadBuffer.toString('base64'),
              },
            });
            ws.send(playAudioEvent);
            
            // Calculate sequential offset for agent audio to prevent overwrite collisions from API buffering
            const now = Date.now();
            const elapsedBytes = (now - callStartTime) * 32;
            
            // If the agent has been silent for more than 500ms, synchronize offset to real-time
            if (!ws.lastAgentWriteTime || (now - ws.lastAgentWriteTime) > 500) {
              ws.nextAgentWriteOffset = elapsedBytes;
            }
            
            const offset = ws.nextAgentWriteOffset;
            agentChunks.push({ offset, buffer: pcmBuffer });
            
            ws.nextAgentWriteOffset = offset + pcmBuffer.length;
            ws.lastAgentWriteTime = now;
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
        onSilenceTimeout: async () => {
          console.log(`[VoBiz Call] Ending call session ${session.id} — silence timeout or user hangup.`);

          // 1. Call VoBiz REST API to hang up the call (terminates both legs, generates CDR)
          if (session.vobizCallUuid) {
            try {
              const defaults = require('../config/defaults');
              const vobizAccount = await VobizAccount.findOne({ where: { userId: session.userId } });
              let authId = defaults.vobiz.parentAuthId;
              let authToken = defaults.vobiz.parentAuthToken;

              if (vobizAccount && vobizAccount.apiKey && vobizAccount.apiSecret) {
                let decryptedId = vobizAccount.apiKey;
                let decryptedToken = vobizAccount.apiSecret;
                try {
                  const crypto = require('../utils/crypto');
                  decryptedId = crypto.decrypt(decryptedId) || decryptedId;
                  decryptedToken = crypto.decrypt(decryptedToken) || decryptedToken;
                } catch (_) {}

                // Use sub-account keys if they look valid and are not placeholders
                if (decryptedId && !decryptedId.includes('your_') && !decryptedId.includes('mock') && decryptedId !== 'YOUR_AUTH_ID') {
                  authId = decryptedId;
                  authToken = decryptedToken;
                }
              }

              console.log(`[VoBiz Call] Triggering hangup for call ${session.vobizCallUuid} with Auth ID: ${authId}`);
              const res = await VobizService.hangupCall({ authId, authToken, callUuid: session.vobizCallUuid });

              // Fallback: If sub-account keys failed with 401 (unauthorized), retry with parent keys
              if (!res.success && authId !== defaults.vobiz.parentAuthId) {
                console.log(`[VoBiz Call] Sub-account hangup failed. Retrying with parent credentials...`);
                await VobizService.hangupCall({
                  authId: defaults.vobiz.parentAuthId,
                  authToken: defaults.vobiz.parentAuthToken,
                  callUuid: session.vobizCallUuid
                });
              }
            } catch (err) {
              console.warn(`[VoBiz Call] Failed to resolve VoBiz credentials for hangup: ${err.message}`);
            }
          }

          // 2. Send WebSocket stop event as backup signal to VoBiz
          try {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ event: 'stop', stop: { reason: 'call-ended' } }));
            }
          } catch (sendErr) {
            console.warn(`[VoBiz Call] Failed to send stop event: ${sendErr.message}`);
          }

          // 3. Close the WebSocket — triggers _cleanupSession to save transcript + recording
          if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
            ws.close(1000, 'Call ended');
          }
        },
      });

      // Store references on the WebSocket object for cleanup
      ws.session = session;
      ws.pipeline = pipeline;
      ws.transcriptChunks = transcriptChunks;
      ws.customerChunks = customerChunks;
      ws.agentChunks = agentChunks;
      ws.callStartTime = callStartTime;

      // 3. Define the main frame handler
      const handleFrame = async (message) => {
        try {
          const frame = JSON.parse(message.toString());

          if (frame.event === 'start') {
            const format = frame.start?.mediaFormat || {};
            const encoding = format.encoding || 'audio/x-mulaw';
            const sampleRate = format.sampleRate || 8000;
            ws.mediaFormat = { encoding, sampleRate };

            const startMsg = `[VoBiz Stream] Call started. StreamId: ${frame.start?.streamId}, negotiatedFormat: ${encoding} at ${sampleRate}Hz`;
            console.log(startMsg);
            try {
              await CallLog.create({
                callSessionId: session.id,
                logLevel: 'info',
                message: startMsg,
              });
            } catch (dbErr) {
              // ignore
            }
            return;
          }

          if (frame.event === 'stop') {
            console.log(`[VoBiz Stream] Call stopped by VoBiz.`);
            if (ws.pipeline) {
              await ws.pipeline.flushPendingInput();
            }
            return;
          }

          if (frame.event === 'media' && frame.media?.payload) {
            if (!ws.receivedFirstMedia) {
              ws.receivedFirstMedia = true;
              console.log('[VoBiz Stream] Received first media event');
              try {
                await CallLog.create({
                  callSessionId: session.id,
                  logLevel: 'info',
                  message: `[VoBiz Stream] Received first media event. Payload size: ${frame.media.payload.length} chars`,
                });
              } catch (_) {}
            }
            const base64Payload = frame.media.payload;
            const inputBuffer = Buffer.from(base64Payload, 'base64');
            
            let pcm16k;
            const format = ws.mediaFormat || { encoding: 'audio/x-mulaw', sampleRate: 8000 };
            const encodingStr = (format.encoding || 'audio/x-mulaw').toLowerCase();
            const isMuLaw = encodingStr.includes('mulaw') || encodingStr.includes('ulaw') || encodingStr.includes('pcmu');

            if (isMuLaw) {
              // Decode 8kHz mu-law to 8kHz Linear PCM
              const pcm8k = decodeMuLaw(inputBuffer);
              // Resample 8kHz PCM to 16kHz PCM
              pcm16k = resamplePCM(pcm8k, format.sampleRate || 8000, 16000);
            } else {
              // It is already raw PCM (L16), resample to 16kHz PCM
              pcm16k = resamplePCM(inputBuffer, format.sampleRate || 16000, 16000);
            }

            // Save customer chunk with offset (16kHz 16-bit mono = 32000 bytes/sec)
            const offset = (Date.now() - callStartTime) * 32;
            customerChunks.push({ offset, buffer: pcm16k });
            pipeline.handleAudioInput(pcm16k);
          }
        } catch (msgErr) {
          console.error('Error handling VoBiz stream frame:', msgErr);
          try {
            await CallLog.create({
              callSessionId: session.id,
              logLevel: 'error',
              message: `Error handling VoBiz stream frame: ${msgErr.message}`,
            });
          } catch (dbErr) {
            // ignore
          }
        }
      };

      // Remove the buffer listener and register the active handler
      ws.removeListener('message', onBufferMessage);
      
      // Process buffered messages in order
      for (const msg of earlyBuffer) {
        await handleFrame(msg);
      }

      ws.on('message', handleFrame);

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
      // Remove temporary buffer listener in case of error
      ws.removeListener('message', onBufferMessage);
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
      if (!freshSession) return;

      if (freshSession.status !== 'completed' && freshSession.status !== 'failed') {
        freshSession.status = 'completed';
        freshSession.endTime = new Date();
        await freshSession.save();
      }

      const endTime = freshSession.endTime || new Date();
      const startTime = freshSession.startTime || freshSession.createdAt;
      const duration = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));

      console.log(`[VoBiz Call Ended] Call Session ${session.id} (${freshSession.direction}) finished. Duration: ${duration} seconds.`);

      await CallLog.create({
        callSessionId: session.id,
        logLevel: 'info',
        message: `Call session finished (${freshSession.direction}). WebSocket closed.`,
      }).catch(() => {});

      // Decrement concurrency tracker via ZSET deregistration
      if (freshSession.campaignId) {
        await QueueService.deregisterActiveCall(freshSession.campaignId, session.id).catch(() => {});
      }

      // Standardize transcript as a formatted text
      const formattedTranscript = (transcriptChunks || [])
        .map((c) => `${c.role === 'customer' ? 'Customer' : 'Agent'}: ${c.text}`)
        .join('\n');

      console.log(`[VoBiz Call] Transcript for session ${session.id}: ${formattedTranscript.length} chars, ${(transcriptChunks || []).length} chunks`);
      if (formattedTranscript.length > 0) {
        console.log(`[VoBiz Call] Transcript preview: ${formattedTranscript.substring(0, 200)}...`);
      }

      // Compile conversation recording
      let fileName = null;
      if ((ws.customerChunks && ws.customerChunks.length > 0) || (ws.agentChunks && ws.agentChunks.length > 0)) {
        try {
          const fs = require('fs');
          const path = require('path');
          const uploadsDir = path.join(process.cwd(), 'uploads');
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          fileName = `recording-${session.id}.wav`;
          const filePath = path.join(uploadsDir, fileName);
          
          // Calculate total duration in bytes (16kHz, 16-bit, mono PCM = 32000 bytes/sec)
          const totalDurationBytes = Math.max(1, (Date.now() - (ws.callStartTime || Date.now())) * 32);
          
          const customerTimeline = Buffer.alloc(totalDurationBytes);
          const agentTimeline = Buffer.alloc(totalDurationBytes);
          
          // Write customer chunks to their offsets
          if (ws.customerChunks) {
            for (const chunk of ws.customerChunks) {
              if (chunk.offset < totalDurationBytes) {
                const copyLen = Math.min(chunk.buffer.length, totalDurationBytes - chunk.offset);
                chunk.buffer.copy(customerTimeline, chunk.offset, 0, copyLen);
              }
            }
          }
          // Write agent chunks to their offsets
          if (ws.agentChunks) {
            for (const chunk of ws.agentChunks) {
              if (chunk.offset < totalDurationBytes) {
                const copyLen = Math.min(chunk.buffer.length, totalDurationBytes - chunk.offset);
                chunk.buffer.copy(agentTimeline, chunk.offset, 0, copyLen);
              }
            }
          }
          
          // Mix customer and agent timelines sample-by-sample
          const mixedBuffer = Buffer.alloc(totalDurationBytes);
          const sampleCount = Math.floor(totalDurationBytes / 2);
          for (let i = 0; i < sampleCount; i++) {
            const s1 = customerTimeline.readInt16LE(i * 2);
            const s2 = agentTimeline.readInt16LE(i * 2);
            // Mix and clamp to signed 16-bit integer range
            const mixed = Math.max(-32768, Math.min(32767, s1 + s2));
            mixedBuffer.writeInt16LE(mixed, i * 2);
          }
          
          // Generate standard 16kHz, 16-bit, mono WAV header
          const header = Buffer.alloc(44);
          header.write('RIFF', 0);
          header.writeUInt32LE(36 + mixedBuffer.length, 4);
          header.write('WAVE', 8);
          header.write('fmt ', 12);
          header.writeUInt32LE(16, 16);
          header.writeUInt16LE(1, 20); // PCM
          header.writeUInt16LE(1, 22); // 1 Channel (Mono)
          header.writeUInt32LE(16000, 24); // 16kHz sample rate
          header.writeUInt32LE((16000 * 16 * 1) / 8, 28); // byte rate
          header.writeUInt16LE((16 * 1) / 8, 32); // block align
          header.writeUInt16LE(16, 34); // bits per sample
          header.write('data', 36);
          header.writeUInt32LE(mixedBuffer.length, 40);
          
          const wavBuffer = Buffer.concat([header, mixedBuffer]);
          fs.writeFileSync(filePath, wavBuffer);
          console.log(`Saved mixed call recording to ${filePath}`);
        } catch (recordErr) {
          console.error('Failed to save call recording:', recordErr);
        }
      }

      // Re-fetch session to get any customerId that was resolved during the call
      const latestSession = await CallSession.findByPk(session.id);

      // Reliable report queuing & immediate creation
      const completionEvent = {
        callSessionId: session.id,
        userId: latestSession?.userId || freshSession.userId || session.userId,
        campaignId: latestSession?.campaignId || freshSession.campaignId || session.campaignId || null,
        vobizNumberId: latestSession?.vobizNumberId || freshSession.vobizNumberId || session.vobizNumberId,
        customerId: latestSession?.customerId || freshSession.customerId || session.customerId,
        transcript: formattedTranscript,
        duration: Math.max(0, duration),
        recordingUrl: fileName ? `/uploads/${fileName}` : null,
      };

      console.log(`[VoBiz Call] Enqueuing report for session ${session.id}:`, {
        userId: completionEvent.userId,
        customerId: completionEvent.customerId,
        campaignId: completionEvent.campaignId,
        transcriptLen: formattedTranscript.length,
        duration: completionEvent.duration,
        direction: freshSession.direction,
      });

      // Enqueue report for worker processing (Reliable Queue)
      await QueueService.enqueueReport(completionEvent).catch((qErr) => {
        console.error('[VoBiz Call] Failed to enqueue report to Redis:', qErr.message);
      });

      // Immediate analysis fallback to guarantee CallReport creation
      const { processCallAnalysis } = require('../workers/aiWorker');
      processCallAnalysis(completionEvent).catch(aiErr => console.error('[VoBiz Call] Immediate AI analysis error:', aiErr.message));

      // Clear memory references to prevent socket memory leaks
      ws.customerChunks = null;
      ws.agentChunks = null;
      ws.transcriptChunks = null;
    } catch (cleanError) {
      console.error('Error during call session cleanup:', cleanError);
    }
  }
}

module.exports = new VobizSocketHandler();
