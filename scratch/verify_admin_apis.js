const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

async function run() {
  console.log('--- STARTING ADMIN API VERIFICATION ---');

  let token = '';
  try {
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123',
      role: 'super_admin'
    });
    token = loginRes.data.data.accessToken;
    console.log('1. Auth login successfully. Token retrieved.');
  } catch (error) {
    console.error('1. Auth login failed:', error.response?.data || error.message);
    process.exit(1);
  }

  const authHeader = {
    headers: { Authorization: `Bearer ${token}` }
  };

  let merchantId = '';
  let callSessionId = '';
  let callReportId = '';
  let planId = '184e6f43-a869-4545-bb98-abf8d06134e8'; // Gold plan ID from db dump

  // 1. Get all businesses (searching, filter, sorting)
  try {
    console.log('\n--- 2. GET ALL BUSINESSES (SEARCH, FILTER, SORT) ---');
    
    // Search
    const searchRes = await axios.get(`${BASE_URL}/admin/merchants?search=Tech`, authHeader);
    console.log('Search response count:', searchRes.data.data.merchants.length);
    if (searchRes.data.data.merchants.length > 0) {
      merchantId = searchRes.data.data.merchants[0].id;
      console.log('First merchant matched search:', searchRes.data.data.merchants[0].businessName);
    }

    // Filter by category
    if (searchRes.data.data.merchants.length > 0 && searchRes.data.data.merchants[0].categoryId) {
      const catId = searchRes.data.data.merchants[0].categoryId;
      const filterRes = await axios.get(`${BASE_URL}/admin/merchants?categoryId=${catId}`, authHeader);
      console.log(`Filter by category ID (${catId}) response count:`, filterRes.data.data.merchants.length);
    }

    // Sort
    const sortRes = await axios.get(`${BASE_URL}/admin/merchants?sortBy=businessName&sortOrder=ASC&limit=3`, authHeader);
    console.log('Sorted response businesses:');
    sortRes.data.data.merchants.forEach(m => console.log(`- ${m.businessName} (Created: ${m.createdAt})`));
  } catch (error) {
    console.error('2. Get all businesses failed:', error.response?.data || error.message);
  }

  // Fallback merchant ID if search was empty
  if (!merchantId) {
    merchantId = 'e5b9785c-60c3-47d8-abe1-ff2e6517469b'; // Default Merchant Business ID
  }

  // 2. Get details by Id
  try {
    console.log(`\n--- 3. GET BUSINESS DETAILS BY ID (${merchantId}) ---`);
    const detailsRes = await axios.get(`${BASE_URL}/admin/merchants/${merchantId}`, authHeader);
    console.log('Details retrieved:');
    console.log(`- Business Name: ${detailsRes.data.data.businessName}`);
    console.log(`- Email: ${detailsRes.data.data.email}`);
    console.log(`- Subscription Active Plan: ${detailsRes.data.data.subscription?.activePlan}`);
  } catch (error) {
    console.error('3. Get business details failed:', error.response?.data || error.message);
  }

  // 3. Edit business profile
  try {
    console.log(`\n--- 4. EDIT BUSINESS PROFILE (${merchantId}) ---`);
    // Let's first fetch details to keep original category and URL
    const detailsRes = await axios.get(`${BASE_URL}/admin/merchants/${merchantId}`, authHeader);
    const originalName = detailsRes.data.data.businessName;
    const testName = 'Updated Tech Corporation';

    const editRes = await axios.put(`${BASE_URL}/admin/merchants/${merchantId}`, {
      businessName: testName,
      businessUrl: detailsRes.data.data.businessUrl || 'https://techcorp.example.com',
      kycStatus: detailsRes.data.data.kycStatus
    }, authHeader);
    console.log('Update response businessName:', editRes.data.data.businessName);

    // Revert back to original
    await axios.put(`${BASE_URL}/admin/merchants/${merchantId}`, {
      businessName: originalName
    }, authHeader);
    console.log('Reverted businessName back to:', originalName);
  } catch (error) {
    console.error('4. Edit business profile failed:', error.response?.data || error.message);
  }

  // 4. View business call records
  try {
    console.log(`\n--- 5. GET BUSINESS CALL RECORDS (${merchantId}) ---`);
    const callRecRes = await axios.get(`${BASE_URL}/admin/merchants/${merchantId}/call-records?limit=3`, authHeader);
    console.log('Call records count:', callRecRes.data.data.reports.length);
    if (callRecRes.data.data.reports.length > 0) {
      callSessionId = callRecRes.data.data.reports[0].callSessionId || callRecRes.data.data.reports[0].id;
      callReportId = callRecRes.data.data.reports[0].id;
      console.log(`First call record details: SessionID: ${callSessionId} | Outcome: ${callRecRes.data.data.reports[0].outcome}`);
    }
  } catch (error) {
    console.error('5. Get business call records failed:', error.response?.data || error.message);
  }

  // Fallback IDs if empty
  if (!callSessionId) callSessionId = 'ae4f012d-8555-4e63-a016-d33e68ff1f00';
  if (!callReportId) callReportId = '15a9882d-927e-4ffa-b003-52e941e98b9f';

  // 5. Get details by id of call record
  try {
    console.log(`\n--- 6. GET DETAILS BY ID OF CALL RECORD (${callSessionId}) ---`);
    const sessionDetailsRes = await axios.get(`${BASE_URL}/admin/call-records/${callSessionId}`, authHeader);
    console.log('Call Session Details:');
    console.log(`- Status: ${sessionDetailsRes.data.data.status}`);
    console.log(`- Direction: ${sessionDetailsRes.data.data.direction}`);
    console.log(`- Logs count: ${sessionDetailsRes.data.data.logs?.length || 0}`);

    console.log(`\n--- 7. GET DETAILS BY ID OF CALL REPORT (${callReportId}) ---`);
    const reportDetailsRes = await axios.get(`${BASE_URL}/admin/reports/${callReportId}`, authHeader);
    console.log('Call Report Details:');
    console.log(`- Outcome: ${reportDetailsRes.data.data.outcome || reportDetailsRes.data.data.report?.outcome}`);
  } catch (error) {
    console.error('6/7. Get call record details failed:', error.response?.data || error.message);
  }

  // 6. Manage business subscription plan
  try {
    console.log(`\n--- 8. MANAGE BUSINESS SUBSCRIPTION PLAN (Upgrade/Downgrade) ---`);
    const upgradeRes = await axios.put(`${BASE_URL}/admin/merchants/${merchantId}/subscription`, {
      planId: planId, // Gold plan
      durationMonths: 3,
      customCallLimit: 1500
    }, authHeader);
    console.log('Subscription upgrade response:');
    console.log(`- Active Plan: ${upgradeRes.data.data.activePlan}`);
    console.log(`- Calls Remaining: ${upgradeRes.data.data.callsRemaining}`);
    console.log(`- Expiry Date: ${upgradeRes.data.data.expiryDate}`);

    // Let's modify subscription directly
    console.log(`\n--- 9. UPDATE SUBSCRIPTION DETAILS DIRECTLY ---`);
    const directUpdateRes = await axios.put(`${BASE_URL}/admin/subscriptions/${upgradeRes.data.data.id}`, {
      callsRemaining: 2000,
      status: 'active'
    }, authHeader);
    console.log(`Direct update callsRemaining response: ${directUpdateRes.data.data.callsRemaining}`);

    // Cancel subscription
    console.log(`\n--- 10. CANCEL SUBSCRIPTION ---`);
    const cancelRes = await axios.post(`${BASE_URL}/admin/subscriptions/${upgradeRes.data.data.id}/cancel`, {}, authHeader);
    console.log(`Subscription cancelled status: ${cancelRes.data.data.status}`);
  } catch (error) {
    console.error('8/9/10. Subscription management failed:', error.response?.data || error.message);
  }

  // 7. Global call records
  try {
    console.log('\n--- 11. GET ALL GLOBAL CALL RECORDS ---');
    const globalRes = await axios.get(`${BASE_URL}/admin/reports?limit=3`, authHeader);
    console.log('Global call records response count:', globalRes.data.data.reports.length);
  } catch (error) {
    console.error('11. Get all global call records failed:', error.response?.data || error.message);
  }

  // 8. Get details by id of global call record session
  try {
    console.log(`\n--- 12. GET DETAILS BY ID OF GLOBAL CALL RECORD SESSION (${callSessionId}) ---`);
    const globalSessionRes = await axios.get(`${BASE_URL}/admin/reports/session/${callSessionId}`, authHeader);
    console.log('Global Session status response:', globalSessionRes.data.data.status);
  } catch (error) {
    console.error('12. Get details of global call record session failed:', error.response?.data || error.message);
  }

  console.log('\n--- VERIFICATION COMPLETED ---');
}

run();
