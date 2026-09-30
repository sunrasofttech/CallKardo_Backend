# CallKardo Merchant Public API & Webhooks

Merchants can use the Public API to pull their report data or set up Webhooks to have the data pushed automatically to their own CRM.

## Authentication
To access the public API, you need an API key. 
1. Generate an API Key via the Merchant Dashboard (which calls `POST /api/v1/merchant-integration/api-key/generate`).
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
      "transcript": "Hello, I would like to book an appointment...",
      "summary": "Customer wanted to book an appointment for tomorrow.",
      "duration": 45,
      "outcome": "Appointment Booked",
      "sentiment": "Positive",
      "leadScore": 8,
      "recordingUrl": "https://storage.provider.com/rec.wav",
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

---

## Webhooks (Push Integration)

Instead of pulling data, you can register a Webhook URL where CallKardo will POST data as soon as a call completes and its report is generated.

### Setting up a Webhook
You can set your webhook URL via the Merchant Dashboard, which uses the endpoint:
`POST /api/v1/merchant-integration/webhook`
```json
{
  "webhookUrl": "https://your-crm.com/api/webhooks/callkardo"
}
```

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
