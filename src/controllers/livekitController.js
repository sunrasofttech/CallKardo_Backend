const { WebhookReceiver, AccessToken } = require('livekit-server-sdk');
const defaults = require('../config/defaults');
const { CallSession, CallLog, VobizNumber, Customer, Agent } = require('../models');
const { Op } = require('sequelize');

// Initialize WebhookReceiver
let receiver;
try {
  if (defaults.livekit.apiKey && defaults.livekit.apiSecret) {
    receiver = new WebhookReceiver(defaults.livekit.apiKey, defaults.livekit.apiSecret);
  }
} catch (e) {
  console.warn('[LiveKit Webhook] Failed to initialize WebhookReceiver. API Key/Secret might be missing:', e.message);
}

class LivekitController {
  async handleWebhook(req, res, next) {
    try {
      const authHeader = req.get('Authorization');
      if (!authHeader) {
        return res.status(401).json({ success: false, message: 'Missing Authorization header' });
      }

      // Check if body is raw buffer (e.g. from express.raw)
      const bodyStr = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : JSON.stringify(req.body);

      let event;
      if (receiver) {
        try {
          event = receiver.receive(bodyStr, authHeader);
        } catch (verifyErr) {
          console.error('[LiveKit Webhook] Signature verification failed:', verifyErr.message);
          return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
        }
      } else {
        // Fallback/bypass if receiver is not configured (e.g. for development)
        console.warn('[LiveKit Webhook] Bypassing signature verification (LiveKit credentials missing)');
        try {
          event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        } catch (parseErr) {
          // If it's a buffer, parse string
          event = JSON.parse(bodyStr);
        }
      }

      console.log(`[LiveKit Webhook] Event: ${event.event}, Room: ${event.room?.name}`);

      const roomName = event.room?.name || '';
      const eventName = event.event;

      // Extract callSessionId if it's named 'sip_call_UUID' or 'call_UUID'
      let callSessionId = null;
      if (roomName.startsWith('sip_call_')) {
        callSessionId = roomName.substring('sip_call_'.length);
      } else if (roomName.startsWith('call_')) {
        callSessionId = roomName.substring('call_'.length);
      }

      // 1. Process Event Room Started
      if (eventName === 'room_started') {
        if (callSessionId) {
          const session = await CallSession.findByPk(callSessionId);
          if (session) {
            session.status = 'connected';
            await session.save();

            await CallLog.create({
              callSessionId: session.id,
              logLevel: 'info',
              message: `LiveKit Room started: ${roomName}. Call status set to connected.`,
            });
          }
        }
      }

      // 2. Process Event Participant Joined (especially for Inbound SIP routing mapping)
      if (eventName === 'participant_joined') {
        const participant = event.participant;
        const attributes = participant?.attributes || {};
        
        // If it's a SIP caller, create CallSession dynamically if not already created
        const isSip = participant?.identity?.startsWith('sip:') || attributes['sip.phoneNumber'];
        
        if (isSip) {
          const fromNum = attributes['sip.phoneNumber'] || participant.identity.replace('sip:', '');
          const toNum = attributes['sip.trunkPhoneNumber'] || '';

          console.log(`[LiveKit Webhook] SIP Caller Joined: From ${fromNum} to ${toNum}`);

          // If session doesn't exist yet, we create it dynamically for inbound routing
          let session;
          if (callSessionId) {
            session = await CallSession.findByPk(callSessionId);
          }

          if (!session) {
            // Find VobizNumber to get the agent
            const cleanToNum = toNum.startsWith('+') ? toNum.substring(1) : toNum;
            const searchNumbers = [toNum, cleanToNum, `+${cleanToNum}`];

            const vobizNumber = await VobizNumber.findOne({
              where: {
                number: { [Op.in]: searchNumbers },
                status: 'active',
              },
              include: [{ model: Agent, as: 'agent' }],
            });

            if (vobizNumber) {
              // Find or create customer
              let customer = await Customer.findOne({
                where: { userId: vobizNumber.userId, mobile: fromNum },
              });

              if (!customer) {
                customer = await Customer.create({
                  userId: vobizNumber.userId,
                  mobile: fromNum,
                  name: 'Inbound SIP Caller',
                });
              }

              // Create dynamic inbound CallSession
              session = await CallSession.create({
                userId: vobizNumber.userId,
                agentId: vobizNumber.agentId,
                vobizNumberId: vobizNumber.id,
                customerId: customer.id,
                wsSessionToken: roomName,
                vobizCallUuid: attributes['sip.callID'] || null,
                status: 'connected',
                direction: 'inbound',
              });

              await CallLog.create({
                callSessionId: session.id,
                logLevel: 'info',
                message: `Inbound SIP call mapped. Room: ${roomName}. Routed to Agent: ${vobizNumber.agent?.name}`,
              });
            } else {
              console.warn(`[LiveKit Webhook] No active agent configured for dialed number: ${toNum}`);
            }
          } else {
            // Update session status to connected and save CallUUID
            session.status = 'connected';
            if (attributes['sip.callID']) {
              session.vobizCallUuid = attributes['sip.callID'];
            }
            await session.save();
          }
        }
      }

      // 3. Process Event Room Finished
      if (eventName === 'room_finished') {
        if (callSessionId) {
          const session = await CallSession.findByPk(callSessionId);
          if (session) {
            session.status = 'completed';
            if (!session.endTime) session.endTime = new Date();
            await session.save();

            await CallLog.create({
              callSessionId: session.id,
              logLevel: 'info',
              message: `LiveKit Room finished: ${roomName}. Call status set to completed.`,
            }).catch(() => {});

            // Trigger processCallAnalysis to guarantee CallReport creation
            const duration = session.startTime
              ? Math.max(0, Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000))
              : 0;

            const fs = require('fs');
            const path = require('path');
            const recFile = `recording-${session.id}.wav`;
            const recPath = path.join(process.cwd(), 'uploads', recFile);
            const recordingUrl = fs.existsSync(recPath) ? `/uploads/${recFile}` : null;

            const completionEvent = {
              callSessionId: session.id,
              userId: session.userId,
              campaignId: session.campaignId,
              vobizNumberId: session.vobizNumberId,
              customerId: session.customerId,
              transcript: '',
              duration,
              recordingUrl,
            };

            const { processCallAnalysis } = require('../workers/aiWorker');
            processCallAnalysis(completionEvent).catch(aiErr =>
              console.error('[LiveKit Webhook] Error creating CallReport:', aiErr.message)
            );
          }
        }
      }

      // 4. Default: Handle everything else (track published, etc)
      res.status(200).send('OK');
    } catch (err) {
      console.error('[LiveKit Webhook] Error processing webhook:', err);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }

  // Generate WebRTC token for browser clients
  async getWebToken(req, res) {
    try {
      const { agentId } = req.query;
      
      if (!agentId) {
        return res.status(400).json({ success: false, message: 'agentId is required' });
      }

      // Validate Agent
      const agent = await Agent.findByPk(agentId);
      if (!agent) {
        return res.status(404).json({ success: false, message: 'Agent not found' });
      }

      // Find or create a Web Tester Customer for this user
      const [customer] = await Customer.findOrCreate({
        where: { userId: agent.userId, mobile: 'Web Tester' },
        defaults: { name: 'Web Tester' },
      });

      // Find or create a dummy VobizNumber for Web Tests
      const [vobizNumber] = await VobizNumber.findOrCreate({
        where: { userId: agent.userId, number: 'Web-Test-Number' },
        defaults: { agentId: agent.id },
      });

      // Create a CallSession in the DB first to get a valid UUID
      const callSession = await CallSession.create({
        userId: agent.userId,
        agentId: agent.id,
        customerId: customer.id,
        vobizNumberId: vobizNumber.id,
        direction: 'inbound', // Treating web tests as inbound calls
        status: 'initiated',
        startTime: new Date(),
        wsSessionToken: 'pending',
      });

      // Name the room exactly like a SIP call so the LiveKit Server auto-dispatches the Agent worker
      const roomName = `sip_call_${callSession.id}`;
      const participantName = `web_tester_${Date.now()}`;

      // Update the session token
      callSession.wsSessionToken = roomName;
      await callSession.save();

      console.log(`[WebTester] Created CallSession ${callSession.id} for Agent ${agent.id}. Room: ${roomName}`);

      // Explicitly dispatch the LiveKit agent to this room to ensure it joins
      const { AgentDispatchClient } = require('livekit-server-sdk');
      try {
        const agentDispatch = new AgentDispatchClient(defaults.livekit.url, defaults.livekit.apiKey, defaults.livekit.apiSecret);
        await agentDispatch.createDispatch(roomName, '');
        console.log(`[WebTester] Explicitly dispatched agent to room ${roomName}`);
      } catch (dispatchErr) {
        console.warn(`[WebTester] Agent dispatch failed (it may auto-join):`, dispatchErr.message);
      }

      // Generate LiveKit Access Token
      if (!defaults.livekit.apiKey || !defaults.livekit.apiSecret) {
        throw new Error('LiveKit API Key or Secret is missing in server configuration');
      }

      const at = new AccessToken(defaults.livekit.apiKey, defaults.livekit.apiSecret, {
        identity: participantName,
        name: 'Web Tester',
      });
      
      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
      });

      const token = await at.toJwt();

      // Determine correct WS URL from HTTP URL (e.g. https://domain.com -> wss://domain.com)
      let livekitUrl = defaults.livekit.url;
      if (livekitUrl.startsWith('http://')) livekitUrl = livekitUrl.replace('http://', 'ws://');
      if (livekitUrl.startsWith('https://')) livekitUrl = livekitUrl.replace('https://', 'wss://');

      // If the backend is using localhost/127.0.0.1, it works for server-to-server, 
      // but web browsers need the public hostname to connect from the outside.
      if (livekitUrl.includes('127.0.0.1') || livekitUrl.includes('localhost')) {
        const hostname = req.hostname; // e.g., api.callkardo.com
        livekitUrl = `wss://${hostname}`;
      }

      res.json({
        success: true,
        token: token,
        roomName: roomName,
        livekitUrl: livekitUrl,
      });

    } catch (err) {
      console.error('[LiveKit Token] Error generating web token:', err);
      res.status(500).json({ success: false, message: 'Error generating token: ' + err.message });
    }
  }
}

module.exports = new LivekitController();
