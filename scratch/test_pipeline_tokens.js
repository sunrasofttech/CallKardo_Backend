const VoicePipeline = require('../src/services/voicePipeline');
const { Customer } = require('../src/models');

async function testPipeline() {
  const customer = await Customer.findByPk('9ba2498a-f550-41b8-b9e3-f8e6e6d8ff40');
  
  // create dummy pipeline
  const pipeline = new VoicePipeline({
    callSessionId: 'dummy-session-id',
    customer: customer ? customer.toJSON() : {},
    agent: { name: 'Test Agent' },
    merchant: { email: 'merchant@example.com' }
  });

  pipeline._log = (level, msg) => console.log(`[${level.toUpperCase()}] ${msg}`);
  
  // override execute action to just log
  pipeline._executeAction = async (actionName, payload) => {
    console.log(`--> _executeAction called with action: ${actionName}, payload: ${payload}`);
  };

  const text1 = "Sure, I have sent the join link. {{action:send_join_link}}";
  console.log('Testing text 1:', text1);
  const result1 = pipeline._processActionTriggers(text1);
  console.log('Result 1:', result1);

  const text2 = "Sure, here is the meeting link. {{action:send_meeting_link}}";
  console.log('\nTesting text 2 (hallucinated token):', text2);
  const result2 = pipeline._processActionTriggers(text2);
  console.log('Result 2:', result2);
}

testPipeline();
