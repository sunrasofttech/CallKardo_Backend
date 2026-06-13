const { Voice } = require('../models');

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
].map(v => ({
  ...v,
  provider: 'sarvam',
  isCustom: false,
}));


async function seedVoices() {
  console.log('Seeding bulbul:v3 voices into the database...');
  for (const voice of bulbulVoices) {
    const [record, created] = await Voice.findOrCreate({
      where: { voiceId: voice.voiceId },
      defaults: voice
    });
  }
  console.log('Seeding bulbul:v3 voices finished.');
}

module.exports = { seedVoices, bulbulVoices };
