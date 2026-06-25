const VoiceController = require('../src/controllers/voiceController');
const { Voice } = require('../src/models');
const fs = require('fs');
const path = require('path');

async function testControllerPreview() {
  // Find a google voice record in DB
  const voice = await Voice.findOne({ where: { provider: 'google', voiceId: 'Puck' } });
  if (!voice) {
    console.error('Google voice Puck not found in DB');
    process.exit(1);
  }

  const req = {
    user: { id: 'some-user-id' }, // Mock user
    body: {
      voiceId: voice.id
    }
  };

  let sentData = null;
  let headers = {};

  const res = {
    status: function(code) {
      console.log('Response Status:', code);
      return this;
    },
    setHeader: function(name, val) {
      headers[name] = val;
      return this;
    },
    send: function(data) {
      sentData = data;
      return this;
    },
    json: function(obj) {
      console.log('Response JSON:', obj);
      return this;
    }
  };

  const next = (err) => {
    console.error('Next called with error:', err);
  };

  try {
    console.log('Invoking VoiceController.preview...');
    await VoiceController.preview(req, res, next);

    if (sentData) {
      console.log('--- Success ---');
      console.log('Response Content-Type:', headers['Content-Type']);
      console.log('Response Data length:', sentData.length);
      
      const testFilePath = path.join(__dirname, 'test_controller_preview_out.wav');
      fs.writeFileSync(testFilePath, sentData);
      console.log(`Saved output to ${testFilePath}`);
    } else {
      console.log('No data sent back');
    }
  } catch (err) {
    console.error('Controller invocation failed:', err);
  }

  process.exit(0);
}

testControllerPreview();
