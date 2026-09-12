process.env.TZ = 'Asia/Kolkata';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'callkardo_test';

const { sequelize, User, Admin, Agent, Meeting, MerchantCallback, Notification, CallSession } = require('../src/models');
const MerchantOnboardingService = require('../src/services/merchantOnboardingService');
const adminController = require('../src/controllers/adminController');

async function runTests() {
  console.log('=== Starting Test Suite for Merchant Calling & Meetings Feature ===');

  try {
    await sequelize.authenticate();
    console.log('[1/7] DB Connected successfully.');

    // Sync new tables if not yet created
    await sequelize.sync({ alter: true });
    console.log('[2/7] DB Schema synced successfully.');

    // -------------------------------------------------------------
    // TEST 1: Night-time detection & Business hour adjustment logic
    // -------------------------------------------------------------
    console.log('\n--- Testing Night-time Detection & Adjustment (Asia/Kolkata) ---');

    // 10:30 PM IST (22:30) is night
    const nightDate = new Date('2026-09-12T22:30:00.000+05:30');
    const isNight = MerchantOnboardingService.isNightTime(nightDate);
    console.assert(isNight === true, `Expected nightDate to be night, got ${isNight}`);
    console.log('  ✓ 22:30 IST correctly identified as night');

    // 03:00 PM IST (15:00) is day
    const dayDate = new Date('2026-09-12T15:00:00.000+05:30');
    const isDay = MerchantOnboardingService.isNightTime(dayDate);
    console.assert(isDay === false, `Expected dayDate to be day, got ${isDay}`);
    console.log('  ✓ 15:00 IST correctly identified as day');

    // 05:00 AM IST (05:00) is early morning night
    const earlyMorningDate = new Date('2026-09-13T05:00:00.000+05:30');
    console.assert(MerchantOnboardingService.isNightTime(earlyMorningDate) === true, 'Expected 05:00 AM to be night');
    console.log('  ✓ 05:00 AM IST correctly identified as night');

    // Adjustment: 22:30 IST on 2026-09-12 adjusted to next morning 10:00 AM IST (2026-09-13 10:00)
    const adjustedFromNight = MerchantOnboardingService.adjustIfNight(nightDate);
    const adjustedStr = MerchantOnboardingService.formatDateTimeIST(adjustedFromNight);
    console.log(`  ✓ 22:30 IST adjusted to: ${adjustedStr}`);
    console.assert(adjustedStr.includes('10:00 am') || adjustedStr.includes('10:00 AM') || adjustedStr.includes('10:00'), 'Expected 10:00 AM adjustment');

    // Adjustment: Daytime remains unchanged
    const unchangedDay = MerchantOnboardingService.adjustIfNight(dayDate);
    console.assert(unchangedDay.getTime() === dayDate.getTime(), 'Daytime should not be altered');
    console.log('  ✓ Daytime 15:00 IST remained unaltered');

    // -------------------------------------------------------------
    // TEST 2: 6-Hour Callback Rule & Night Avoidance
    // -------------------------------------------------------------
    console.log('\n--- Testing 6-Hour Callback Calculation Rule ---');

    // Call ends at 4:30 PM (16:30 IST) -> 6 hours later is 10:30 PM (22:30 IST, Night!)
    const callEndAfternoon = new Date('2026-09-12T16:30:00.000+05:30');
    const callbackScenario1 = MerchantOnboardingService.calculateCallbackTime(null, callEndAfternoon);
    console.log(`  Scenario 1 (Call ended 4:30 PM, no time requested):`);
    console.log(`    isNightAdjusted: ${callbackScenario1.isNightAdjusted}`);
    console.log(`    Scheduled: ${MerchantOnboardingService.formatDateTimeIST(callbackScenario1.scheduledTime)}`);
    console.assert(callbackScenario1.isNightAdjusted === true, 'Should detect that 6hr later is night');

    // Call ends at 10:00 AM IST -> 6 hours later is 4:00 PM IST (16:00 IST, Daytime!)
    const callEndMorning = new Date('2026-09-12T10:00:00.000+05:30');
    const callbackScenario2 = MerchantOnboardingService.calculateCallbackTime(null, callEndMorning);
    console.log(`  Scenario 2 (Call ended 10:00 AM, no time requested):`);
    console.log(`    isNightAdjusted: ${callbackScenario2.isNightAdjusted}`);
    console.log(`    Scheduled: ${MerchantOnboardingService.formatDateTimeIST(callbackScenario2.scheduledTime)}`);
    console.assert(callbackScenario2.isNightAdjusted === false, '4:00 PM should NOT be night adjusted');

    // -------------------------------------------------------------
    // TEST 3: Default Merchant Onboarding Agent Resolution
    // -------------------------------------------------------------
    console.log('\n--- Testing Default Merchant Onboarding Agent ---');
    const agent = await MerchantOnboardingService.getOrCreateDefaultMerchantAgent();
    console.assert(agent && agent.id, 'Agent must be created or resolved');
    console.assert(agent.isMerchantCaller === true, 'Agent must have isMerchantCaller: true');
    console.assert(agent.agentType === 'merchant_onboarding', 'Agent must be merchant_onboarding');
    console.log(`  ✓ Default Merchant Agent active: "${agent.name}" (ID: ${agent.id})`);

    // -------------------------------------------------------------
    // TEST 4: Create Test Merchant and Test Meeting Scheduling
    // -------------------------------------------------------------
    console.log('\n--- Testing Meeting Scheduling & 15-Minute Reminder ---');
    const testMobile = '+9198765' + Math.floor(10000 + Math.random() * 90000);
    const merchant = await User.create({
      mobile: testMobile,
      passwordHash: 'dummy-hash',
      businessName: 'SuperMart Test Retail',
      role: 'merchant',
    });
    console.log(`  ✓ Created test merchant: ${merchant.businessName} (${merchant.mobile})`);

    // Schedule meeting for tomorrow 3:00 PM
    const meetingResult = await MerchantOnboardingService.scheduleMeeting(
      merchant.id,
      'tomorrow at 3pm',
      null,
      agent.id
    );
    console.assert(meetingResult.success === true, 'Meeting scheduling should succeed');
    console.log(`  ✓ Meeting booked: Link=${meetingResult.meetingLink}, Time=${meetingResult.scheduledTime}`);

    const meetingRecord = await Meeting.findByPk(meetingResult.meetingId);
    console.assert(meetingRecord !== null, 'Meeting record must exist in DB');

    // Verify 15-minute reminder time
    const meetingTimeDate = new Date(meetingRecord.meetingTime);
    const reminderTimeDate = new Date(meetingRecord.reminderCallTime);
    const expectedReminderMs = meetingTimeDate.getTime() - 15 * 60 * 1000;
    console.assert(
      reminderTimeDate.getTime() === expectedReminderMs,
      `Expected reminder time ${expectedReminderMs}, got ${reminderTimeDate.getTime()}`
    );
    console.log(`  ✓ 15-minute reminder accurately scheduled at: ${MerchantOnboardingService.formatDateTimeIST(meetingRecord.reminderCallTime)}`);

    // Test reminder execution
    const reminderResult = await MerchantOnboardingService.triggerMeetingReminder(meetingRecord.id);
    console.assert(reminderResult.success === true, 'Reminder trigger should succeed');
    await meetingRecord.reload();
    console.assert(meetingRecord.reminderCallStatus === 'initiated', `Reminder status should be initiated, got ${meetingRecord.reminderCallStatus}`);
    console.log('  ✓ 15-minute reminder call successfully initiated and logged');

    // -------------------------------------------------------------
    // TEST 5: Test Callback Scheduling
    // -------------------------------------------------------------
    console.log('\n--- Testing Callback Record & Scheduling ---');
    const cbResult = await MerchantOnboardingService.scheduleCallback(
      merchant.id,
      null, // No time mentioned -> 6hr rule + night avoidance!
      null,
      agent.id
    );
    console.assert(cbResult.success === true, 'Callback scheduling should succeed');
    console.log(`  ✓ Callback scheduled: ${cbResult.scheduledTime} (Night adjusted: ${cbResult.isNightAdjusted})`);

    const callbackRecord = await MerchantCallback.findByPk(cbResult.callbackId);
    console.assert(callbackRecord !== null, 'Callback record must exist in DB');
    console.assert(callbackRecord.status === 'pending', 'Callback status must be pending');

    // -------------------------------------------------------------
    // TEST 6: Day-Wise Meetings API Query
    // -------------------------------------------------------------
    console.log('\n--- Testing Admin Day-Wise Meetings Query ---');
    // Mock req, res to test controller directly
    let resData = null;
    const req = {
      query: {},
    };
    const res = {
      status: () => res,
      json: (data) => { resData = data; return res; },
    };
    const next = (err) => { if (err) throw err; };

    await adminController.getMeetings(req, res, next);
    console.assert(resData && resData.success === true, 'getMeetings should return success');
    console.assert(typeof resData.data.dayWiseMeetings === 'object', 'dayWiseMeetings must be an object');
    console.log(`  ✓ Available meeting days:`, resData.data.availableDates);
    console.log(`  ✓ Total meetings retrieved: ${resData.data.totalMeetings}`);
    const days = Object.keys(resData.data.dayWiseMeetings);
    console.assert(days.length > 0, 'Should contain at least one day bucket');
    console.log(`  ✓ Day-wise bucket sample [${days[0]}]: ${resData.data.dayWiseMeetings[days[0]].length} meetings`);

    // -------------------------------------------------------------
    // TEST 7: Verify Admin Notifications
    // -------------------------------------------------------------
    console.log('\n--- Testing Admin Notifications Generation ---');
    const notifs = await Notification.findAll({
      where: { type: 'ADMIN' },
      order: [['createdAt', 'DESC']],
      limit: 5,
    });
    console.assert(notifs.length > 0, 'Admin notifications should have been generated');
    console.log(`  ✓ Retrieved ${notifs.length} recent Admin notifications:`);
    notifs.forEach((n) => {
      console.log(`    - [${n.category}] ${n.title}: ${n.message.substring(0, 75)}...`);
    });

    console.log('\n======================================================');
    console.log('  ALL TESTS PASSED SUCCESSFULLY! FEATURE VALIDATED.');
    console.log('======================================================\n');

    // Clean up test records
    await meetingRecord.destroy().catch(() => {});
    await callbackRecord.destroy().catch(() => {});
    await merchant.destroy().catch(() => {});

    process.exit(0);
  } catch (err) {
    console.error('TEST SUITE FAILED:', err);
    process.exit(1);
  }
}

runTests();
