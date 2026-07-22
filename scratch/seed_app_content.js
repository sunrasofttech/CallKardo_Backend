require('dotenv').config();
const { Setting } = require('../src/models');
const sequelize = require('../src/config/database');

const SEED_DATA = [
  {
    key: 'page_terms',
    value: {
      title: 'Terms & Conditions',
      content: 'Welcome to Kardo. By using our platform, you agree to comply with and be bound by our terms and conditions.',
      sections: [
        { id: 1, title: 'Acceptance of terms', details: 'By accessing or using Kardo, you agree to be bound by these terms.' },
        { id: 2, title: 'User accounts and responsibilities', details: 'Users are responsible for maintaining account confidentiality and all activity under their account.' },
        { id: 3, title: 'Acceptable use policy', details: 'Kardo must not be used for illegal activities, harassment, spamming, or fraudulent voice calling.' },
        { id: 4, title: 'Subscription and payment terms', details: 'Subscription fees are billed periodically based on your chosen plan.' },
        { id: 5, title: 'Cancellation and refunds', details: 'Subscriptions may be cancelled at any time. Refunds are governed by our billing policy.' },
        { id: 6, title: 'Intellectual property', details: 'All platform code, designs, models, and branding remain exclusive intellectual property of Kardo.' },
        { id: 7, title: 'Limitation of liability', details: 'Kardo is provided as-is without warranties of uninterrupted service.' },
        { id: 8, title: 'Account suspension or termination', details: 'We reserve the right to suspend accounts violating acceptable use policies.' },
        { id: 9, title: 'Contact information', details: 'For support or legal inquiries, reach out to support@callkardo.com.' }
      ],
      contactEmail: 'support@callkardo.com',
      updatedAt: new Date().toISOString()
    }
  },
  {
    key: 'page_privacy_policy',
    value: {
      title: 'Privacy Policy',
      content: 'Your privacy is paramount. Kardo collects and protects your data in accordance with modern privacy standards.',
      sections: [
        { id: 1, title: 'What information we collect', details: 'Name, phone number, email address, and contacts (only if permission is explicitly granted).' },
        { id: 2, title: 'Call recordings', details: 'Calls are recorded strictly with user consent for quality assurance, transcriptions, and AI agent processing.' },
        { id: 3, title: 'AI voice processing', details: 'Voice audio data is processed via secure encrypted streaming for real-time speech recognition and text-to-speech.' },
        { id: 4, title: 'Calendar & schedule data', details: 'Schedule data is accessed solely to manage automated reminders and meeting calls.' },
        { id: 5, title: 'Device permissions', details: 'App requires microphone, contacts, and notification permissions only when requested by user.' },
        { id: 6, title: 'How user data is stored and protected', details: 'Data is stored securely using industry-standard encryption protocols both in transit and at rest.' },
        { id: 7, title: 'Data sharing with third parties', details: 'We do not sell user data to third parties. Data is shared only with encrypted AI voice subprocessors necessary for service.' },
        { id: 8, title: 'User rights', details: 'Users have the right to request data export, modify details, or permanently delete their account at any time.' },
        { id: 9, title: 'Contact email', details: 'Privacy queries can be sent to support@callkardo.com.' }
      ],
      contactEmail: 'support@callkardo.com',
      updatedAt: new Date().toISOString()
    }
  },
  {
    key: 'page_about_us',
    value: {
      title: 'About Us',
      content: 'Kardo is an AI-powered communication platform designed to simplify personal and business conversations. Users can schedule meetings, manage contacts, create groups, and use AI-powered calling features with natural human-like voice interactions. Our goal is to make communication smarter, faster, and more productive while protecting user privacy and security.',
      updatedAt: new Date().toISOString()
    }
  },
  {
    key: 'page_features',
    value: {
      title: 'Features',
      items: [
        { icon: '🤖', title: 'AI-powered voice calling', description: 'Make automated, intelligent voice calls powered by AI agents.' },
        { icon: '📅', title: 'Schedule meetings and reminders', description: 'Set up automated calls and meeting reminders seamlessly.' },
        { icon: '📞', title: 'Make and receive calls', description: 'High quality voice calling capabilities.' },
        { icon: '👥', title: 'Create and manage groups', description: 'Organize contacts into custom groups and lists.' },
        { icon: '📇', title: 'Contact management', description: 'Manage and sync your business and personal contacts.' },
        { icon: '🎙️', title: 'Human-like AI voice', description: 'Natural sounding conversational AI voices in multiple languages.' },
        { icon: '🔊', title: 'Call recording', description: 'Record calls securely with full user consent.' },
        { icon: '🔔', title: 'Notifications and reminders', description: 'Instant alerts and scheduled reminder calls.' },
        { icon: '☁️', title: 'Secure cloud synchronization', description: 'Keep all your data synced across devices securely.' },
        { icon: '💳', title: 'Subscription plans', description: 'Flexible plans tailored to personal and enterprise needs.' }
      ],
      updatedAt: new Date().toISOString()
    }
  }
];

async function seedDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database. Seeding system content pages...');

    for (const item of SEED_DATA) {
      let record = await Setting.findOne({ where: { key: item.key } });
      if (record) {
        await record.update({ value: item.value });
        console.log(`[UPDATED] Key '${item.key}' in DB`);
      } else {
        await Setting.create({ key: item.key, value: item.value });
        console.log(`[INSERTED] Key '${item.key}' into DB`);
      }
    }

    console.log('\nAll App Content Pages successfully seeded into DB!');
  } catch (error) {
    console.error('Error seeding DB:', error);
  } finally {
    await sequelize.close();
  }
}

seedDatabase();
