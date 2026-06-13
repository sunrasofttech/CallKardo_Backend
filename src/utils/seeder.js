const { Voice } = require('../models');

const bulbulVoices = [
  { name: 'Shubh', voiceId: 'shubh', gender: 'male', language: 'hi-IN' },
  { name: 'Aditya', voiceId: 'aditya', gender: 'male', language: 'hi-IN' },
  { name: 'Ritu', voiceId: 'ritu', gender: 'female', language: 'hi-IN' },
  { name: 'Priya', voiceId: 'priya', gender: 'female', language: 'hi-IN' },
  { name: 'Neha', voiceId: 'neha', gender: 'female', language: 'hi-IN' },
  { name: 'Rahul', voiceId: 'rahul', gender: 'male', language: 'hi-IN' },
  { name: 'Pooja', voiceId: 'pooja', gender: 'female', language: 'hi-IN' },
  { name: 'Rohan', voiceId: 'rohan', gender: 'male', language: 'hi-IN' },
  { name: 'Simran', voiceId: 'simran', gender: 'female', language: 'hi-IN' },
  { name: 'Kavya', voiceId: 'kavya', gender: 'female', language: 'hi-IN' },
  { name: 'Amit', voiceId: 'amit', gender: 'male', language: 'hi-IN' },
  { name: 'Dev', voiceId: 'dev', gender: 'male', language: 'hi-IN' },
  { name: 'Ishita', voiceId: 'ishita', gender: 'female', language: 'hi-IN' },
  { name: 'Shreya', voiceId: 'shreya', gender: 'female', language: 'hi-IN' },
  { name: 'Ratan', voiceId: 'ratan', gender: 'male', language: 'hi-IN' },
  { name: 'Varun', voiceId: 'varun', gender: 'male', language: 'hi-IN' },
  { name: 'Manan', voiceId: 'manan', gender: 'male', language: 'hi-IN' },
  { name: 'Sumit', voiceId: 'sumit', gender: 'male', language: 'hi-IN' },
  { name: 'Roopa', voiceId: 'roopa', gender: 'female', language: 'hi-IN' },
  { name: 'Kabir', voiceId: 'kabir', gender: 'male', language: 'hi-IN' },
  { name: 'Aayan', voiceId: 'aayan', gender: 'male', language: 'hi-IN' },
  { name: 'Ashutosh', voiceId: 'ashutosh', gender: 'male', language: 'hi-IN' },
  { name: 'Advait', voiceId: 'advait', gender: 'male', language: 'hi-IN' },
  { name: 'Anand', voiceId: 'anand', gender: 'male', language: 'hi-IN' },
  { name: 'Tanya', voiceId: 'tanya', gender: 'female', language: 'hi-IN' },
  { name: 'Tarun', voiceId: 'tarun', gender: 'male', language: 'hi-IN' },
  { name: 'Sunny', voiceId: 'sunny', gender: 'male', language: 'hi-IN' },
  { name: 'Mani', voiceId: 'mani', gender: 'male', language: 'hi-IN' },
  { name: 'Gokul', voiceId: 'gokul', gender: 'male', language: 'hi-IN' },
  { name: 'Vijay', voiceId: 'vijay', gender: 'male', language: 'hi-IN' },
  { name: 'Shruti', voiceId: 'shruti', gender: 'female', language: 'hi-IN' },
  { name: 'Suhani', voiceId: 'suhani', gender: 'female', language: 'hi-IN' },
  { name: 'Mohit', voiceId: 'mohit', gender: 'male', language: 'hi-IN' },
  { name: 'Kavitha', voiceId: 'kavitha', gender: 'female', language: 'hi-IN' },
  { name: 'Rehan', voiceId: 'rehan', gender: 'male', language: 'hi-IN' },
  { name: 'Soham', voiceId: 'soham', gender: 'male', language: 'hi-IN' },
  { name: 'Rupali', voiceId: 'rupali', gender: 'female', language: 'hi-IN' },
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
