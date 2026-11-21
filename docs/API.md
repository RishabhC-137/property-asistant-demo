# Chatbot API — v1

Base URL (local): `http://127.0.0.1:4000`. Chatbot routes live under `/api/v1`.
All request/response shapes are defined as Zod schemas in
[`packages/contracts`](../packages/contracts/src) — that package is the source of truth; this
document describes it.

- [Conventions](#conventions)
- [Endpoints](#endpoints)
- [Streaming protocol (SSE)](#streaming-protocol-sse)
- [Idempotency and retries](#idempotency-and-retries)
- [Response blocks](#response-blocks)
- [Database and migrations](#database-and-migrations)
- [Running tests](#running-tests)

## Conventions

- JSON bodies, `Content-Type: application/json`. Unknown fields are rejected (`400`).
- Timestamps are ISO-8601 UTC strings. Calendar dates are `YYYY-MM-DD`.
- Successful non-streaming responses use a `data` envelope.
- Errors always use this shape:

```json
{
  "error": {
    "code": "CONVERSATION_NOT_FOUND",
    "message": "Conversation not found",
    "retryable": false,
    "requestId": "req-3",
    "details": [{ "path": "message", "message": "Too small: expected string to have >=1 characters" }]
  }
}
```

`details` is only present for validation-style errors.

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad path, query or body (including malformed JSON). `details` lists the issues. |
| 400 | `INVALID_CURSOR` | The `before` cursor couldn't be decoded. |
| 404 | `CONVERSATION_NOT_FOUND` | No conversation with that id. |
| 401 | `UNAUTHORIZED` | A signed chat identity ticket is invalid or expired. |
| 404 | `NOT_FOUND` | Unknown route. |
| 409 | `IDEMPOTENCY_KEY_REUSED` | `clientMessageId` was already used with a **different** message. Not retryable. |
| 409 | `MESSAGE_IN_PROGRESS` | A reply for this `clientMessageId` is still generating. Retryable; sends `Retry-After: 1`. |
| 413 | `PAYLOAD_TOO_LARGE` | Body over the limit (32 KiB for messages, 64 KiB elsewhere). |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Body is not JSON. |
| 500 | `INTERNAL_ERROR` | Unexpected failure. Retryable. |

These codes are only sent **inside the stream** as `message.error`: `PROVIDER_ERROR`, `INVALID_PROVIDER_OUTPUT`, `PERSISTENCE_ERROR`, `MESSAGE_IN_PROGRESS` (a newer attempt took over) and `INTERNAL_ERROR`.

## Endpoints

### `GET /health`

Liveness check. It never touches the database.

```json
200 { "status": "ok", "service": "property-assistant" }
```

### `GET /ready`

Readiness check: runs `SELECT 1` against PostgreSQL with a 2-second timeout.

```json
200 { "status": "ready",     "checks": { "database": "ok" } }
503 { "status": "not_ready", "checks": { "database": "unavailable" } }
```

### `POST /api/v1/conversations`

Creates a conversation. The body is optional; if you send one it must be `{}`.

```json
201 {
  "data": {
    "id": "8afb3bef-7971-4649-a244-881e535c4bda",
    "createdAt": "2026-10-17T13:27:12.120Z",
    "updatedAt": "2026-10-17T13:27:12.120Z",
    "messageCount": 0,
    "lastMessageAt": null
  }
}
```

### `GET /api/v1/conversations/:conversationId`

Returns the conversation's metadata in the same shape as above. `messageCount` counts user and assistant rows, including pending and failed replies. Returns `400` if the id is not a UUID and `404` if the conversation does not exist.

### `DELETE /api/v1/conversations/:conversationId`

Deletes the conversation and all of its messages and blocks for good; any reply still being generated for it is stopped. `204` with no body. Access follows the same rule as reading it: only the owner can delete a signed-in user's conversation, and anyone holding the id can delete an anonymous one. Unknown or not-yours → `404 CONVERSATION_NOT_FOUND`. The widget asks the visitor to confirm before calling it.

### `GET /api/v1/conversations/:conversationId/messages?limit=50&before=<cursor>`

Paginated message history.

| Query | Default | Rules |
|---|---|---|
| `limit` | 50 | Integer from 1 to 100. |
| `before` | — | Opaque cursor taken from `pagination.nextCursor`. |

Pages are cut **newest first**, but the messages inside each page are in **chronological order**, so a chat UI can prepend each page as it loads. To load older history, pass `nextCursor` back as `before` until `hasMore` is `false`.

```json
200 {
  "data": [
    {
      "id": "950d63a7-…", "conversationId": "8afb3bef-…", "role": "user",
      "clientMessageId": "smoke-1", "status": "completed",
      "content": "Show me 3 BHK flats in Metro", "blocks": [],
      "replyToMessageId": null,
      "createdAt": "2026-10-17T13:27:12.200Z", "completedAt": "2026-10-17T13:27:12.200Z",
      "error": null
    },
    {
      "id": "d2d68e1a-…", "conversationId": "8afb3bef-…", "role": "assistant",
      "clientMessageId": "smoke-1", "status": "completed",
      "content": "Happy to help you search. …",
      "blocks": [
        { "type": "text", "data": { "text": "Happy to help you search. …" } },
        { "type": "clarification", "data": { "…": "…" } },
        { "type": "quick_replies", "data": { "…": "…" } }
      ],
      "replyToMessageId": "950d63a7-…",
      "createdAt": "2026-10-17T13:27:12.201Z", "completedAt": "2026-10-17T13:27:12.390Z",
      "error": null
    }
  ],
  "pagination": { "limit": 50, "hasMore": false, "nextCursor": null }
}
```

`status` is `completed`, `pending` (still generating) or `failed`. A failed message carries an `error` object (`{ code, message }`). User messages are always `completed` and their `blocks` is always `[]`.

### `POST /api/v1/conversations/:conversationId/messages`

Sends a user message and streams back the assistant's reply.

```json
{ "clientMessageId": "c1a7e7e2-5d1b-4a3c-9f0e-1b2c3d4e5f60", "message": "Show me 3 BHK flats" }
```

| Field | Rules |
|---|---|
| `clientMessageId` | 1–128 characters from `A–Z a–z 0–9 . _ : -`. Must be unique per conversation. A UUID is recommended. |
| `message` | Normalized, then 1–4000 characters (`MAX_MESSAGE_LENGTH`, also enforced by a DB constraint). NUL characters are not allowed. |

Before validation, the server normalizes `message`:
- It removes leading and trailing whitespace.
- It turns runs of spaces, tabs or other whitespace into a single space (`"3   BHK"` → `"3 BHK"`).
- It strips spaces at the start and end of each line.
- It allows at most one blank line in a row.
- It converts line breaks to `\n`.

The length limit applies to the normalized text, and that text is what gets stored and compared for duplicates. A retry that differs only in spacing therefore counts as the same message.

Validation failures, a missing conversation and idempotency conflicts are returned as **plain JSON** with the matching status code, before any stream opens. Otherwise the response is `200` with `Content-Type: text/event-stream`. A replayed response also carries the header `Idempotent-Replayed: true`.

Browsers can't send a POST with `EventSource`. Read the stream with `fetch()` and a `ReadableStream` reader, or with a library such as `@microsoft/fetch-event-source`.

### `POST /api/v1/conversations/:conversationId/messages/:messageId/stop`

Stops a reply that is still generating. `messageId` is the `assistantMessageId` from `message.started`. The open stream then ends normally:

- If some of the reply was already streamed, it ends with `message.completed` and the message keeps what was streamed. Chips and forms that weren't shown yet are dropped.
- If nothing was streamed yet, it ends with `message.error`, code `CANCELLED` (retryable). Retrying regenerates the reply.

Response: `200 { "data": { "stopped": true } }`, or `{ "stopped": false }` when that reply isn't generating (it already finished, or it belongs to another conversation). This is different from a dropped connection: when the client disconnects, the server keeps generating so a retry can replay the finished reply.

With more than one API instance, the stop request has to reach the instance that is generating the reply (for example through sticky routing). Otherwise it returns `stopped: false`.

### `GET /api/v1/properties`

More results for a row of cards, with no model call. Pass the card block's `query` fields (`keywords`, `bedrooms`, `budgetMinInr`, `budgetMaxInr`, `category`, `nearProjectId`, `withinKm`; leave out nulls) with `page` (1–50) and `limit` (1–12).

Response: `200 { "data": PropertyCard[], "pagination": { "page", "limit", "total", "hasMore" } }`. An unknown `nearProjectId` gives `404`; listings being down gives `503 SERVICE_UNAVAILABLE` (retryable).

### `POST /api/v1/leads`, `POST /api/v1/leads/:leadId/verify`, `POST /api/v1/leads/:leadId/resend`

Sends a callback, enquiry, site-visit or online-presentation request from a form, confirmed by a 6-digit code sent on WhatsApp. These routes are available when `LEADS_MODE=catalog`; otherwise they return `503`. Contact details are passed on to the website's enquiry API (`/enquiry/create`, `/enquiry/verify-otp`) and are never stored or logged here.

- **Create.** Body: `{ requestType: "callback" | "enquiry" | "site_visit" | "online_presentation", projectIds?, projectName?, name, phone, email?, message?, visitDate?, visitTime?, transportMode?, meetingPlatform? }`. A site visit or online presentation needs `visitDate` (`YYYY-MM-DD`) and `visitTime` (`HH:MM`); site visits also choose `transportMode` (`cab | not-required`) and online presentations choose `meetingPlatform` (`google-meet | teams | zoom`). Response: `201 { "data": { leadId, phoneMasked, verified: false } }`.
- **Verify.** Body: `{ otp }`. Response: `{ "data": { leadId, phoneMasked, verified: true } }`. A wrong code gives `400` with the website's message (for example "That code is not right. 4 attempts left.").
- **Resend.** Sends a new code. The website allows one code every 30 seconds.

Each client IP may start 5 requests per 10 minutes (`429 RATE_LIMITED`). The website also limits each phone number to 5 requests per hour.

### `GET /embed.js`

The website widget: a floating chat button and panel in a shadow root. Build it with `npm run build:embed`. To embed it on a site, add the site's origin to `CORS_ORIGINS`, then:

```html
<script src="https://<chat-api>/embed.js"></script>
<script>CatalogChat.mount({ apiBaseUrl: "https://<chat-api>/api/v1" })</script>
```

`mount` also takes `theme`, `title`, `subtitle`, `welcomeMessage`, `suggestions`, `launcherLabel`, `teaser` and `position`. `CatalogChat.unmount()` removes the widget.

## Streaming protocol (SSE)

Each event is sent as:

```
event: <name>
data: <single-line JSON>

```

On success, events arrive in this order:

```
message.started → (text.delta | block | status)* → message.completed → suggestions?
```

On failure, they arrive in this order:

```
message.started → (text.delta | block)* → message.error
```

A stream always has exactly one `message.completed` or one `message.error`. After `message.completed`, a `suggestions` event may follow before the stream closes (a replayed or stopped reply has none). The reply is complete at `message.completed`, so the client can accept the next message straight away.

| Event | Payload |
|---|---|
| `message.started` | `{ conversationId, clientMessageId, userMessageId, assistantMessageId, replay }` |
| `text.delta` | `{ messageId, index, delta }`: append `delta` to the `text` block at position `index` |
| `block` | `{ messageId, index, block }`: a complete structured block at position `index` |
| `message.completed` | `{ message }`: the full persisted assistant `ChatMessage`, including all blocks |
| `message.error` | `{ messageId, error: { code, message, retryable, details? } }` |
| `status` | `{ messageId, label }`: what the assistant is doing, such as "Searching projects…". Never stored. |
| `suggestions` | `{ messageId, questions }`: 1–4 questions the user might ask next, shown as pills under the latest reply. Tapping one sends it as the next message. Never stored, so a reloaded conversation has none. |

`index` is the block's position in `message.blocks`. Text and structured blocks can interleave. For example, text at index 0, a `quick_replies` block at index 1, then more text at index 2.

Example (trimmed):

```
event: message.started
data: {"conversationId":"8afb…","clientMessageId":"smoke-1","userMessageId":"950d…","assistantMessageId":"d2d6…","replay":false}

event: text.delta
data: {"messageId":"d2d6…","index":0,"delta":"Happy "}

event: text.delta
data: {"messageId":"d2d6…","index":0,"delta":"to "}

event: block
data: {"messageId":"d2d6…","index":1,"block":{"type":"clarification","data":{…}}}

event: message.completed
data: {"message":{"id":"d2d6…","role":"assistant","status":"completed","blocks":[…],…}}
```

Client rules:

- Treat `message.completed.message` as the authoritative final state.
- On `message.error`, throw away any partial text and blocks already received. If `retryable` is `true`, resend the **same** request with the **same** `clientMessageId`.
- If the connection drops mid-stream, resend the same request. The server keeps generating after a disconnect and saves the result, so a retry usually replays the finished reply.

## Idempotency and retries

`clientMessageId` is the idempotency key. Its scope is one conversation. When an ID repeats, the server compares the normalized `message` with the stored `content`.

| Situation | Result |
|---|---|
| New `clientMessageId` | The user message and a `pending` assistant message are saved in one transaction, then the reply streams (`replay: false`). |
| Same id and message, reply `completed` | The saved reply is streamed again unchanged (`replay: true`). The provider is **not** called again. |
| Same id and message, reply still `pending` | `409 MESSAGE_IN_PROGRESS` with `Retry-After: 1`. |
| Same id and message, reply `failed` | That one request takes over and generates again (`attempt` goes up by 1). Concurrent retries get `409 MESSAGE_IN_PROGRESS`. |
| Same id and message, reply `pending` past the lease (`GENERATION_LEASE_MS`, default 120 s) | Treated as abandoned, for example after a crash, and taken over as above. |
| Same id, **different** message | `409 IDEMPOTENCY_KEY_REUSED`. Nothing is written. |

How duplicates are prevented:

- `UNIQUE (conversation_id, client_message_id, role)` makes concurrent duplicate submissions queue up behind the first insert. Exactly one of them creates the pending reply.
- A takeover is a single conditional `UPDATE`, so only one request can win it.
- When generation finishes, the completion `UPDATE` checks `attempt`. An attempt that has been superseded can't overwrite the newer reply; it gets `message.error` with code `MESSAGE_IN_PROGRESS`.
- The completion update and all block inserts commit in one transaction. If any of them fails, everything rolls back and the reply is marked `failed`.

## Response blocks

Every block has the shape `{ "type": <stable string>, "data": <typed object> }` and is validated by `ChatBlockSchema`, a Zod discriminated union. Blocks describe data only; they have no tie to any UI framework. Unknown fields are removed before a block is saved.

| `type` | Purpose |
|---|---|
| `text` | Ordinary assistant text, streamed through `text.delta`. |
| `property_cards` | A list of 1–12 property/project cards. |
| `property_gallery` | 1–40 photos and plans of one project. |
| `payment_plan` | A project's payment stages and booking amount, exactly as the source lists them. |
| `project_map` | Where a project is, for a map. The viewer's distance is worked out on their device. |
| `property_comparison` | 2–4 cards plus the attributes to compare. |
| `clarification` | Follow-up questions and the search criteria still missing. |
| `quick_replies` | 1–8 selectable choices. |
| `lead_capture_form` | A callback/enquiry form. It sends only when its `submission.mode` is `api`. |
| `site_visit_form` | A site-visit or online-presentation form. It sends only when its `submission.mode` is `api`. |

To add a new block type:

1. Add a schema in `packages/contracts/src/blocks.ts`.
2. Add the type to `BLOCK_TYPES`.
3. Add a migration that extends the `message_blocks.type` CHECK constraint.

### `text`

```json
{ "type": "text", "data": { "text": "Happy to help you search." } }
```

### `property_cards`

```json
{
  "type": "property_cards",
  "data": {
    "title": "Sample results (demo data)",
    "items": [ PropertyCard, … ],
    "totalResults": null,
    "notice": "Demo fixture data for development only — not real listings, prices or availability.",
    "criteria": null
  }
}
```

`criteria` is the search behind the cards, `{ "bedrooms": 3, "budgetMinInr": null, "budgetMaxInr": 30000000 }`, or `null` when the cards are not from a filtered search. Clients use it to show the starting price of the searched BHK (for example "3 BHK from ₹2.8 Cr") and to list matching configurations first. It may be missing on blocks stored before it was added; treat that as `null`.

**`PropertyCard`**: the example below is mapped from the captured Property Desk snapshot by `mapCatalogProject`. It is historical data, not live inventory.

```json
{
  "id": "6aca0be07d2760c3b208e8ba",
  "source": "catalog",
  "projectCode": "GUR208235",
  "slug": "sunrise-park",
  "name": "Experion Emerelle Reserve",
  "developer": { "id": "69f9d83851bbd20f4175e398", "name": "Experion Developers Private Limited", "slug": "Sunrise-developers-private-limited" },
  "location": { "localityName": null, "localityId": "6aae78fe2c669d04c842ec61", "city": "Metro", "pincode": "122505" },
  "category": "Residential",
  "propertyTypes": ["Apartment"],
  "status": "Pre-Launch",
  "price": { "currency": "INR", "min": 35700000, "max": 51000000, "pricePerSqft": 17000 },
  "configurations": [
    {
      "label": "3 BHK", "bedrooms": 3,
      "size": { "min": 2100, "max": 2500, "unit": "sqft" },
      "price": { "currency": "INR", "min": 35700000, "max": 42500000, "pricePerSqft": 17000 },
      "availability": { "status": "unknown", "availableUnits": null }
    }
  ],
  "possessionDate": "2031-08-31",
  "reraId": null,
  "highlights": ["Experion Emerelle Reserve features a three-level clubhouse designed around a nature-inspired forest theme."],
  "image": { "url": null, "path": "sunrise-park-sector-88a-565559.webp", "alt": "Experion Emerelle Reserve exterior" },
  "detailUrl": "https://example.com/property/sunrise-park",
  "dataAsOf": null
}
```

Card semantics:

- **`source`**: `fixture` means fictional development data; `catalog` means data mapped from the upstream API.
- **`price.max`**: `null` means the upper bound is unknown. It does not mean the price is open-ended.
- **`availability.status`**:
  - `unknown`: the source does not track units, which was true of every project in the snapshot.
  - `reported_available` / `reported_sold_out`: what the source reported as of `dataAsOf`. These values never mean live stock.
- **`image.url`**: `null` when only a relative filename is known and no media base URL has been configured. Use `path` only for diagnostics.
- **`location.coordinates`**: `{ lat, lng }`, or `null` when the source gives none or a position outside Metro City. The source often stores the pair in the wrong order; it is corrected. Cards saved before this field existed don't have it.
- **`location.localityName`**: `null` when the source only gave an opaque id. The id is kept in `localityId`.
- **`dataAsOf`**: `null` means freshness is unknown. Don't present the data as current.

### `property_gallery`

```json
{
  "type": "property_gallery",
  "data": {
    "projectId": "6a16e0b242154ed087e153bb",
    "projectName": "M3M Antalya Hills",
    "images": [
      {
        "url": "https://example.com/uploads/images/m3m-antalya-hills/antalya-hills-grand-entrance-196752.webp",
        "path": "antalya-hills-grand-entrance-196752.webp",
        "alt": "Antalya Hills grand entrance",
        "category": "exterior"
      }
    ],
    "detailUrl": null
  }
}
```

- **`category`**: `exterior | interior | floor_plan | master_plan | site_plan | location`, taken from the source's media folders.
- **`url`**: always an HTTPS URL. Images that don't resolve to a URL are left out.
- **`alt`**: made from the source file name. Upstream names files descriptively (e.g. `antalya-hills-grand-entrance-196752.webp`); a generic caption is used when the name has no words.

### `project_map`

```json
{
  "type": "project_map",
  "data": {
    "projectId": "6a16e0b242154ed087e153bb",
    "projectName": "M3M Antalya Hills",
    "coordinates": { "lat": 28.357348, "lng": 76.972684 },
    "address": "Metro"
  }
}
```

The default widget embeds OpenStreetMap (free, no key) and links to Google Maps. It asks the viewer whether to use their location: if they agree, it shows the straight-line distance and a directions link; if they decline, it shows the project only. The viewer's location never leaves the device: it is not sent to the API or the model, and only the yes/no choice is remembered (localStorage `rec-location-choice`).

### `payment_plan`

```json
{
  "type": "payment_plan",
  "data": {
    "projectId": "6a2541149a3250947a82826e",
    "projectName": "Adani The Marq",
    "bookingAmountInr": 2100000,
    "stages": [
      { "stage": "On Application (Booking Amount)", "percentage": 5, "note": null },
      { "stage": "At Booking", "percentage": 10, "note": "Of the total sale value" }
    ],
    "notice": "Indicative plan from the listing; please confirm the final schedule with an advisor."
  }
}
```

- **`stages`**: in the source's order, with the source's own wording. Percentages are never changed: when they don't add up to 100%, `notice` says so.
- **`bookingAmountInr`**: `null` when the source doesn't list one.

### `property_comparison`

```json
{
  "type": "property_comparison",
  "data": {
    "title": "Project comparison (demo data)",
    "items": [ PropertyCard, PropertyCard ],
    "attributes": ["price", "price_per_sqft", "configurations", "possession_date", "status"],
    "notice": "Demo fixture data for development only — not real listings, prices or availability."
  }
}
```

`attributes` ⊆ `price | price_per_sqft | configurations | possession_date | status | developer | locality | rera_id`. Order is preserved; each value appears at most once.

### `clarification`

```json
{
  "type": "clarification",
  "data": {
    "questions": [{ "id": "budget", "text": "What is your budget range?", "criterion": "budget" }],
    "missingCriteria": ["budget"]
  }
}
```

The criteria are `budget | bedrooms | locality | property_type | possession | project`.

### `quick_replies`

```json
{
  "type": "quick_replies",
  "data": {
    "prompt": "Pick a budget",
    "options": [
      { "id": "budget_under_2cr", "label": "Under ₹2 Cr", "value": "Budget under 2 crore" },
      { "id": "budget_2_4cr", "label": "₹2–4 Cr", "value": "Budget 2 to 4 crore" }
    ]
  }
}
```

When the user selects an option, send its `value` as the next user message, with a new `clientMessageId`.

### `lead_capture_form` / `site_visit_form`

The block defines the fields shown by the widget. When `LEADS_MODE=catalog`, the same form submits through the lead endpoints above and is confirmed by WhatsApp OTP; otherwise its `submission.mode` is `"disabled"`.

```json
{
  "type": "site_visit_form",
  "data": {
    "formId": "site_visit",
    "title": "Request a site visit",
    "description": "Choose a preferred date and time. A request is not a confirmed visit.",
    "fields": [
      { "name": "name", "label": "Full name", "input": "text", "required": true, "placeholder": null, "maxLength": 100, "options": null },
      { "name": "phone", "label": "Mobile number", "input": "tel", "required": true, "placeholder": null, "maxLength": 20, "options": null },
      { "name": "visitDate", "label": "Preferred date", "input": "date", "required": true, "placeholder": null, "maxLength": null, "options": null }
    ],
    "submitLabel": "Request visit",
    "consentText": "By submitting, you agree to be contacted about this enquiry. (Demo form — nothing is submitted.)",
    "submission": { "mode": "disabled", "notice": "Submitting is not available yet. Your details will not be sent anywhere." },
    "projectIds": [],
    "earliestDate": null
  }
}
```

The fields shared by both forms:

- `formId`, `title`, `description`, `fields`, `submitLabel`, `consentText`, `submission`

The fields specific to each:

- `lead_capture_form`: `projectId` and `requestType` (`callback | enquiry`)
- `site_visit_form`: `projectIds` and `earliestDate`

Field rules:

- `input` is one of `text | tel | email | textarea | select | date | time | checkbox`.
- A `select` field must have `options`; every other input type must have `options: null`.
- Select options may include an HTTPS `image`, short `detail`, and `recommended` flag. The site-visit project selector uses these to render a searchable, vertically scrolling project-card catalogue (up to 100 projects), with recommended matches first. Visitors must select between one and three projects before Next becomes available.
- `visibleWhen`, when present, shows a field only after another field has the named value. The booking form uses this for site-visit transport and online-presentation platform choices.
- Field names must be unique within a form.

## Database and migrations

The API uses PostgreSQL 13 or later (it relies on the built-in `gen_random_uuid()` and `sha256()`, used by migration 002). It connects with `DATABASE_URL`, or with the libpq variables `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and `PGPASSWORD`. The defaults are `127.0.0.1:5432/property_assistant` as `$USER`.

```bash
npm run db:migrate          # from the repo root (or apps/api)
```

- Migrations live in `apps/api/migrations/NNN_name.sql` and are applied in order.
- Each file runs in its own transaction under an advisory lock and is recorded in `schema_migrations` with a checksum. Editing a migration after it has been applied is reported as an error.
- Migrations are forward-only and additive. **Never** edit an applied migration or delete user data; add a new file instead.
- `001_create_tables` creates the original `conversations` and `messages` tables using `IF NOT EXISTS`. On databases created before migrations existed, it does nothing.
- `002_chat_persistence`:
  - Adds `seq`, `status`, `request_hash`, `reply_to_message_id`, `attempt`, `error`, `generation_started_at`, `completed_at` and `updated_at` to `messages`.
  - Backfills existing rows: chronological `seq`, the hash of user text, links from assistant to user messages, and completion timestamps.
  - Adds CHECK, FK and unique constraints, and an index on `(conversation_id, seq)`.
  - Creates `message_blocks`: `(message_id, position)` is unique, `type` is checked against the known types, and `data` is JSONB.
  - Rewrites `messages` while holding a brief exclusive lock. That is fine at the current size; on a large table, run it in a maintenance window.
- `003_drop_request_hash` drops `messages.request_hash` and its CHECK constraint. Duplicate detection now compares `content` directly.
- `004_user_message_length` adds `CHECK (role <> 'user' OR char_length(content) BETWEEN 1 AND 4000)`, which mirrors `MAX_MESSAGE_LENGTH`.

## Running tests

```bash
npm test                    # from the repo root
```

`npm test` builds `packages/contracts`, then creates the **`property_assistant_test`** database if it doesn't exist and migrates it. It then runs `node --test` with `tsx` against `apps/api/test/**/*.test.ts`. Settings come from `apps/api/.env.test`.

Tests only truncate tables after confirming that the current database name ends in `_test`, so development data is never touched.

The suites cover:

- the block schemas
- the Property Desk mapper, run against the captured snapshot
- the mock provider
- transactions and rollback
- migrations, including an upgrade of a legacy-shaped schema containing existing rows
- conversations and health checks
- streaming and persistence
- replay, concurrent duplicates, in-flight duplicates and superseded attempts
- provider failures and retry
- block-persistence rollback
- validation errors
- history pagination

Other commands:

```bash
npm run build               # contracts + api (tsc)
npm run typecheck           # src and tests
```
