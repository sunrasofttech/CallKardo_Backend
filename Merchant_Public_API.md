# CallKardo Merchant Public API & Webhooks

Merchants can use the Public API to pull their report data or set up Webhooks to have the data pushed automatically to their own CRM.

## Authentication
To access the public API, you need an API key. 
1. **To get your API Key, you must contact your Account Admin directly.**
2. Pass the API Key in the `x-api-key` header of your HTTP requests.

Example:
```http
GET /api/v1/public/reports
x-api-key: ck_live_12345abcdef
```

## Public API Endpoints

### 1. Get Call Reports
Fetch a list of all call reports associated with your merchant account.

**Endpoint:** `GET /api/v1/public/reports`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of records per page (default: 50)
- `startDate` (optional): ISO 8601 Date String
- `endDate` (optional): ISO 8601 Date String
- `outcome` (optional): Filter by outcome (e.g., "Appointment Booked", "Callback Requested", "No Answer")

**Response Example:**
```json
{
  "success": true,
  "data": [
    {
      "id": "report-uuid",
      "userId": "merchant-uuid",
      "customerId": "customer-uuid",
      "campaignId": "campaign-uuid",
      "summary": "Customer wanted to book an appointment for tomorrow.",
      "duration": 45,
      "outcome": "Appointment Booked",
      "sentiment": "Positive",
      "leadScore": 8,
      "createdAt": "2026-09-30T10:00:00.000Z",
      "customer": {
        "id": "customer-uuid",
        "name": "John Doe",
        "mobile": "+919876543210",
        "email": "john@example.com"
      },
      "session": {
        "id": "session-uuid",
        "status": "completed",
        "direction": "outbound",
        "startTime": "2026-09-30T09:59:00.000Z",
        "endTime": "2026-09-30T09:59:45.000Z"
      }
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

### 2. Get Single Report Details
Fetch the details of a specific call report.

**Endpoint:** `GET /api/v1/public/reports/:id`

**Response Example:** Same structure as a single object from the array above.

### 3. Get Call Transcript
Fetch just the text transcript of a specific call.

**Endpoint:** `GET /api/v1/public/reports/:id/transcript`

**Response Example:**
```json
{
  "success": true,
  "data": {
    "transcript": "Hello, I would like to book an appointment..."
  }
}
```

### 4. Play / Download Recording
Retrieve the audio recording for a call report. This endpoint will either stream the audio file directly or redirect you to the recording URL.

**Endpoint:** `GET /api/v1/public/reports/:id/recording`

**Expected Behavior:** Returns an audio file stream or a `302 Redirect` to the audio URL.

### 5. Get Customers
Fetch a paginated list of customers in your merchant account.

**Endpoint:** `GET /api/v1/public/customers`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Records per page (default: 50)

**Response Example:**
```json
{
  "success": true,
  "data": [
    {
      "id": "customer-uuid",
      "name": "John Doe",
      "mobile": "+919876543210",
      "email": "john@example.com",
      "tags": "vip, interested",
      "notes": "Called regarding pricing",
      "createdAt": "2026-09-30T10:00:00.000Z"
    }
  ],
  "pagination": { "total": 1, "page": 1, "limit": 50, "totalPages": 1 }
}
```

### 6. Get Campaigns
Fetch a paginated list of your campaigns.

**Endpoint:** `GET /api/v1/public/campaigns`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Records per page (default: 50)
- `status` (optional): Filter by status (e.g. "running", "completed")

**Response Example:**
```json
{
  "success": true,
  "data": [
    {
      "id": "campaign-uuid",
      "name": "October Promo",
      "status": "running",
      "startTime": "2026-10-01T10:00:00.000Z",
      "createdAt": "2026-09-30T10:00:00.000Z"
    }
  ],
  "pagination": { "total": 1, "page": 1, "limit": 50, "totalPages": 1 }
}
```

---

## Webhooks (Push Integration)

Instead of pulling data, you can register a Webhook URL where CallKardo will POST data as soon as a call completes and its report is generated.

### Setting up a Webhook
To set up a Webhook for your account, **you must contact your Account Admin directly** and provide them with your endpoint URL.

### Webhook Payload Format
When a call completes, our system makes a POST request to your `webhookUrl` with the `Content-Type: application/json`.

**Example Payload:**
```json
{
  "event": "call_report.created",
  "data": {
    "reportId": "report-uuid",
    "callSessionId": "session-uuid",
    "campaignId": "campaign-uuid",
    "customerId": "customer-uuid",
    "duration": 45,
    "outcome": "Appointment Booked",
    "sentiment": "Positive",
    "leadScore": 8,
    "transcript": "Hello, I would like to book an appointment...",
    "summary": "Customer wanted to book an appointment for tomorrow.",
    "recordingUrl": "https://storage.provider.com/rec.wav",
    "createdAt": "2026-09-30T10:00:00.000Z"
  }
}
```

### Expected Response
Your webhook endpoint should return a `200 OK` or `201 Created` status code within 5 seconds. If your server is slow or offline, we log the failure but do not currently retry. We recommend processing the payload asynchronously on your end.
