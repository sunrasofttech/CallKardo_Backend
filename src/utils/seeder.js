const { Voice, Category, Plan, User, Admin, Subscription, Agent } = require('../models');
const bcrypt = require('bcryptjs');

const bulbulVoices = [
  { name: 'Shubh', voiceId: 'shubh', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, यह मेरी आवाज़ का एक पूर्वावलोकन है। आशा है कि आपको यह पसंद आएगा!' },
  { name: 'Aditya', voiceId: 'aditya', gender: 'male', language: 'en-IN', sampleText: 'Hello! This is a preview of my voice. I hope you find it suitable for your agent.' },
  { name: 'Ritu', voiceId: 'ritu', gender: 'female', language: 'ta-IN', sampleText: 'வணக்கம், இது எனது குரலின் முன்னோட்டம். இது உங்களுக்கு பிடிக்கும் என்று நம்புகிறேன்!' },
  { name: 'Priya', voiceId: 'priya', gender: 'female', language: 'te-IN', sampleText: 'నమస్కారం, ఇది నా వాయిస్ ప్రివ్యూ. ఇది మీకు నచ్చుతుందని ఆశిస్తున్నాను!' },
  { name: 'Neha', voiceId: 'neha', gender: 'female', language: 'bn-IN', sampleText: 'নমস্কার, এটি আমার কণ্ঠস্বরের একটি প্রিভিউ। আশা করি আপনার এটি ভালো লাগবে!' },
  { name: 'Rahul', voiceId: 'rahul', gender: 'male', language: 'gu-IN', sampleText: 'નમસ્તે, આ મારા અવાજનું પૂર્વાવલોકન છે. આશા છે કે તમને તે ગમશે!' },
  { name: 'Pooja', voiceId: 'pooja', gender: 'female', language: 'kn-IN', sampleText: 'ನಮಸ್ಕಾರ, ಇದು ನನ್ನ ಧ್ವನಿಯ ಮುನ್ನೋಟವಾಗಿದೆ. ಇದು ನಿಮಗೆ ಇಷ್ಟವಾಗುತ್ತದೆ ಎಂದು ಭಾವಿಸುತ್ತೇನೆ!' },
  { name: 'Rohan', voiceId: 'rohan', gender: 'male', language: 'ml-IN', sampleText: 'നമസ്കാരം, ഇത് എന്റെ ശബ്ദത്തിന്റെ പ്രിവ്യൂ ആണ്. നിങ്ങൾക്ക് ഇത് ഇഷ്ടപ്പെടുമെന്ന് പ്രതീക്ഷിക്കുന്നു!' },
  { name: 'Simran', voiceId: 'simran', gender: 'female', language: 'mr-IN', sampleText: 'नमस्कार, हा माझ्या आवाजाचा एक पूर्वदृश्य आहे. आशा आहे की तुम्हाला हे आवडेल!' },
  { name: 'Kavya', voiceId: 'kavya', gender: 'female', language: 'pa-IN', sampleText: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਇਹ ਮੇਰੀ ਆਵਾਜ਼ ਦਾ ਇੱਕ ਪੂਰਵਦਰਸ਼ਨ ਹੈ। ਉਮੀਦ ਹੈ ਕਿ ਤੁਹਾਨੂੰ ਇਹ ਪਸੰਦ ਆਵੇਗਾ!' },
  { name: 'Amit', voiceId: 'amit', gender: 'male', language: 'od-IN', sampleText: 'ନମସ୍କାର, ଏହା ମୋର ସ୍ୱରର ଏକ ପୂର୍ବାବଲୋକନ ଅଟେ | ଆଶା କରେ ଆପଣଙ୍କୁ ଏହା ପସନ୍ଦ ଆସିବ!' },
  { name: 'Dev', voiceId: 'dev', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं देव हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Ishita', voiceId: 'ishita', gender: 'female', language: 'hi-IN', sampleText: 'नमस्ते, मैं इशिता हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Shreya', voiceId: 'shreya', gender: 'female', language: 'hi-IN', sampleText: 'नमस्ते, मैं श्रेया हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Ratan', voiceId: 'ratan', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं रतन हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Varun', voiceId: 'varun', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं वरुण हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Manan', voiceId: 'manan', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं मनन हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Sumit', voiceId: 'sumit', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं सुमित हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Roopa', voiceId: 'roopa', gender: 'female', language: 'hi-IN', sampleText: 'नमस्ते, मैं रूपा हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Kabir', voiceId: 'kabir', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं कबीर हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Aayan', voiceId: 'aayan', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं अयान हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Ashutosh', voiceId: 'ashutosh', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं आशुतोष हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Advait', voiceId: 'advait', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं अद्वैत हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Anand', voiceId: 'anand', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं आनंद हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Tanya', voiceId: 'tanya', gender: 'female', language: 'hi-IN', sampleText: 'नमस्ते, मैं तान्या हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Tarun', voiceId: 'tarun', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं तरुण हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Sunny', voiceId: 'sunny', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं सनी हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Mani', voiceId: 'mani', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं मनी हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Gokul', voiceId: 'gokul', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं गोकुल हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Vijay', voiceId: 'vijay', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं विजय हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Shruti', voiceId: 'shruti', gender: 'female', language: 'hi-IN', sampleText: 'नमस्ते, मैं श्रुति हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Suhani', voiceId: 'suhani', gender: 'female', language: 'hi-IN', sampleText: 'नमस्ते, मैं सुहानी हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Mohit', voiceId: 'mohit', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं मोहित हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Kavitha', voiceId: 'kavitha', gender: 'female', language: 'hi-IN', sampleText: 'नमस्ते, मैं कविता हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Rehan', voiceId: 'rehan', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं रेहान हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Soham', voiceId: 'soham', gender: 'male', language: 'hi-IN', sampleText: 'नमस्ते, मैं सोहम हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Rupali', voiceId: 'rupali', gender: 'female', language: 'hi-IN', sampleText: 'नमस्ते, मैं रूपाली हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।' },
  { name: 'Amelia', voiceId: 'amelia', gender: 'female', language: 'en-IN', sampleText: 'Hello! This is a preview of my voice. I am Amelia, your friendly assistant.' },
  { name: 'Sophia', voiceId: 'sophia', gender: 'female', language: 'en-IN', sampleText: 'Hello! This is a preview of my voice. I am Sophia, ready to assist you today.' },
].map(v => ({
  ...v,
  provider: 'sarvam',
  isCustom: false,
}));


async function seedVoices() {
  // 1. Seed voices
  console.log('Seeding bulbul:v3 voices into the database...');
  for (const voice of bulbulVoices) {
    await Voice.findOrCreate({
      where: { voiceId: voice.voiceId },
      defaults: voice
    });
  }
  console.log('Seeding bulbul:v3 voices finished.');

  // 2. Seed default Categories
  console.log('Seeding default categories...');
  const shubhVoice = await Voice.findOne({ where: { voiceId: 'shubh' } });
  const adityaVoice = await Voice.findOne({ where: { voiceId: 'aditya' } });

  const categoriesToSeed = [
    {
      name: 'Customer Support',
      defaultPrompt: 'You are a helpful customer service assistant.',
      defaultVoiceId: shubhVoice ? shubhVoice.id : null,
      defaultLanguage: 'en-IN',
    },
    {
      name: 'Sales & Marketing',
      defaultPrompt: 'You are an enthusiastic sales agent representing our product. Pitch the product and try to schedule a demo.',
      defaultVoiceId: adityaVoice ? adityaVoice.id : null,
      defaultLanguage: 'en-IN',
    },
    {
      name: 'Appointment Booking',
      defaultPrompt: 'You are a receptionist scheduling appointments. Ask the caller for their preferred date and time, and confirm availability.',
      defaultVoiceId: shubhVoice ? shubhVoice.id : null,
      defaultLanguage: 'en-IN',
    },
    {
      name: 'Feedback Collection',
      defaultPrompt: 'You are a feedback collector. Ask the caller about their recent experience with our service and rate it from 1 to 5.',
      defaultVoiceId: adityaVoice ? adityaVoice.id : null,
      defaultLanguage: 'en-IN',
    }
  ];

  const categories = {};
  for (const cat of categoriesToSeed) {
    const [record] = await Category.findOrCreate({
      where: { name: cat.name },
      defaults: cat
    });
    categories[cat.name] = record;
  }
  console.log('Categories seeded.');

  // 3. Seed default Plans
  console.log('Seeding default plans...');
  const plansToSeed = [
    { name: 'Starter', price: 0.00, callLimit: 5, maxConcurrentCalls: 1 },
    { name: 'Basic', price: 19.00, callLimit: 500, maxConcurrentCalls: 2 },
    { name: 'Pro', price: 49.00, callLimit: 2000, maxConcurrentCalls: 5 },
    { name: 'Enterprise', price: 199.00, callLimit: 10000, maxConcurrentCalls: 10 },
  ];

  const plans = {};
  for (const plan of plansToSeed) {
    const [record] = await Plan.findOrCreate({
      where: { name: plan.name },
      defaults: plan
    });
    plans[plan.name] = record;
  }
  console.log('Default plans seeded.');

  // 4. Seed Super Admin (admin@example.com / admin123)
  console.log('Seeding Super Admin...');
  const adminEmail = 'admin@example.com';
  const existingAdmin = await Admin.findOne({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const salt = await bcrypt.genSalt(10);
    const adminPasswordHash = await bcrypt.hash('admin123', salt);
    await Admin.create({
      email: adminEmail,
      mobile: '+919876543210',
      passwordHash: adminPasswordHash,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'super_admin',
      isVerified: true,
    });
    console.log('Super Admin seeded successfully.');
  } else {
    console.log('Super Admin already exists.');
  }

  // 5. Seed Merchant (merchant@example.com / merchant123)
  console.log('Seeding Merchant...');
  const merchantEmail = 'merchant@example.com';
  const existingMerchant = await User.findOne({ where: { email: merchantEmail } });
  let merchantUser = existingMerchant;
  if (!existingMerchant) {
    const salt = await bcrypt.genSalt(10);
    const merchantPasswordHash = await bcrypt.hash('merchant123', salt);
    merchantUser = await User.create({
      email: merchantEmail,
      mobile: '+919876543211',
      passwordHash: merchantPasswordHash,
      businessName: 'Default Merchant Business',
      categoryId: categories['Customer Support'] ? categories['Customer Support'].id : null,
      role: 'merchant',
      isVerified: true,
    });
    console.log('Merchant user seeded successfully.');

    // Attach Active Subscription
    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setFullYear(now.getFullYear() + 1); // 1 year expiry for default merchant

    const starterPlanRecord = plans['Starter'];
    if (starterPlanRecord) {
      await Subscription.create({
        userId: merchantUser.id,
        planId: starterPlanRecord.id,
        activePlan: starterPlanRecord.name,
        startDate: now,
        expiryDate,
        callsUsed: 0,
        callsRemaining: starterPlanRecord.callLimit,
        status: 'active',
      });
      console.log('Merchant active subscription seeded successfully.');
    }
  } else {
    console.log('Merchant user already exists.');
  }

  // 6. Seed Default Category Agents
  console.log('Seeding default category agents...');
  const supportCat = categories['Customer Support'];
  const salesCat = categories['Sales & Marketing'];
  const bookingCat = categories['Appointment Booking'];
  const feedbackCat = categories['Feedback Collection'];

  const supportVoice = await Voice.findOne({ where: { voiceId: 'shubh' } });
  const salesVoice = await Voice.findOne({ where: { voiceId: 'aditya' } });

  const defaultAgentsToSeed = [
    {
      id: 'g0000000-0000-0000-0000-000000000001',
      userId: merchantUser ? merchantUser.id : null,
      name: 'Default Support Agent',
      description: 'Pre-configured test agent for Customer Support',
      systemPrompt: 'You are a helpful customer service assistant.',
      firstMessage: 'Hello! How can I help you today?',
      language: 'en-IN',
      voiceId: supportVoice ? supportVoice.id : null,
      categoryId: supportCat ? supportCat.id : null,
      isCustom: false,
      approvalStatus: 'approved',
    },
    {
      id: 'g0000000-0000-0000-0000-000000000002',
      userId: merchantUser ? merchantUser.id : null,
      name: 'Default Sales Agent',
      description: 'Pre-configured test agent for Sales & Marketing',
      systemPrompt: 'You are an enthusiastic sales agent representing our product. Pitch the product and try to schedule a demo.',
      firstMessage: "Hello! Interested in boosting your sales with AI? Let's discuss.",
      language: 'en-IN',
      voiceId: salesVoice ? salesVoice.id : null,
      categoryId: salesCat ? salesCat.id : null,
      isCustom: false,
      approvalStatus: 'approved',
    },
    {
      id: 'g0000000-0000-0000-0000-000000000003',
      userId: merchantUser ? merchantUser.id : null,
      name: 'Default Booking Agent',
      description: 'Pre-configured test agent for Appointment Booking',
      systemPrompt: 'You are a receptionist scheduling appointments. Ask the caller for their preferred date and time, and confirm availability.',
      firstMessage: 'Hello! I can help you schedule your next appointment. What date and time works for you?',
      language: 'en-IN',
      voiceId: supportVoice ? supportVoice.id : null,
      categoryId: bookingCat ? bookingCat.id : null,
      isCustom: false,
      approvalStatus: 'approved',
    },
    {
      id: 'g0000000-0000-0000-0000-000000000004',
      userId: merchantUser ? merchantUser.id : null,
      name: 'Default Feedback Agent',
      description: 'Pre-configured test agent for Feedback Collection',
      systemPrompt: 'You are a feedback collector. Ask the caller about their recent experience with our service and rate it from 1 to 5.',
      firstMessage: "Hello! I'd love to collect your quick feedback on our service. Can you rate us from 1 to 5?",
      language: 'en-IN',
      voiceId: salesVoice ? salesVoice.id : null,
      categoryId: feedbackCat ? feedbackCat.id : null,
      isCustom: false,
      approvalStatus: 'approved',
    },
  ];

  for (const agentData of defaultAgentsToSeed) {
    if (agentData.userId && agentData.voiceId && agentData.categoryId) {
      const existingAgent = await Agent.findByPk(agentData.id);
      if (!existingAgent) {
        await Agent.create(agentData);
      }
    }
  }
  console.log('Default category agents seeded successfully.');
}

module.exports = { seedVoices, bulbulVoices };
