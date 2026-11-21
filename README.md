# Property Assistant Demo

A sanitized full-stack property assistant demo built with React, Fastify, TypeScript and PostgreSQL. It demonstrates an embeddable chat widget, SSE streaming, typed message blocks, fixture-based property search and configurable lead forms.

## Requirements

- Node.js 20+ (developed on 25)
- npm 10+ (npm workspaces)
- PostgreSQL 13+ running locally (default `127.0.0.1:5432`, database `property_assistant`, user `$USER`)

## Run locally

```bash
npm install
cp .env.example .env              # optional: edit local settings; never commit .env
createdb property_assistant      # once, if it doesn't exist
npm run db:migrate                # apply migrations (additive, safe to re-run)
npm run dev:api                   # terminal 1 → API on http://127.0.0.1:4000
npm run dev:web                   # terminal 2 → chat UI on http://localhost:5173
```

Open **http://localhost:5173**. The project gallery loads its listings from
`GET /api/v1/properties`; the chat's Gemini search tools use the same backend
catalogue. Vite proxies `/api` to the backend, so no CORS setup is needed.

## Environment setup

`.env.example` contains safe defaults and blank placeholders for optional
settings. Copy it to `.env` for local overrides. This checkout's ignored
`.env` selects Gemini and has a blank `GEMINI_API_KEY` for you to fill in.
Until the key is filled in, the API intentionally fails fast rather than
silently switching back to mock replies. Keep `.env` private and never commit
or share the key in chat.
The `.env` and `.env.*` ignore rules keep local secrets out of Git, while
`.env.example` templates remain shareable. The web app's optional Vite settings
are documented in [`apps/web/.env.example`](apps/web/.env.example).

Or try the API directly:

```bash
curl -s -X POST localhost:4000/api/v1/conversations
curl -N -X POST localhost:4000/api/v1/conversations/<id>/messages \
  -H 'content-type: application/json' \
  -d '{"clientMessageId":"m-1","message":"Show me 3 BHK flats under 4 crore"}'
```

## Commands

| Command (repo root) | What it does |
|---|---|
| `npm run dev:api` | Builds contracts and the LLM package, then runs the API with `tsx watch`. (`npm run dev` does the same.) |
| `npm run dev:web` | Runs the chat test bench with Vite. Edits to `packages/chat-ui` hot-reload. |
| `npm run build` | Builds contracts, chat-ui, the API and the web app. |
| `npm run typecheck` | Type-checks the source and the tests in every workspace. |
| `npm run db:migrate` | Applies pending SQL migrations. |
| `npm test` | LLM tests, API tests (on `property_assistant_test`), then chat-ui tests. |

## Workspace

- `apps/api`: Fastify API, made up of:
  - `src/routes`: HTTP handlers
  - `src/modules/chat`: claim/stream/persist logic and the message repository
  - `src/modules/conversations`
  - `src/modules/properties`: the `PropertyService` seam, the fixture service shared with Gemini and the gallery, and the optional live Property Desk service
  - `src/providers/factory.ts`: picks the provider from `CHAT_PROVIDER` and hands it the property service
  - `src/db`: the shared `pg.Pool`, the transaction helper and the migration runner
  - `migrations/`, `test/`
- `packages/contracts`: shared Zod schemas and TypeScript types for blocks, messages, SSE events and errors. It has no React or framework dependency.
- `packages/chat-ui`: the embeddable React widget. Its icons work with any library (`{ library, names }`), and its themes are presets, custom named themes or token overrides. You can also swap block renderers. See [packages/chat-ui/README.md](packages/chat-ui/README.md).
- `apps/llm`: the chat providers and the canonical 50-project fictional catalogue. Gemini never calls a listings API directly: the API passes it a `PropertyLookup` backed by the same catalogue the gallery uses.
- `apps/web`: a Vite test bench that hosts the widget, with a debug panel and theme and icon switchers.

## Documentation

- [packages/chat-ui/README.md](packages/chat-ui/README.md): widget props, plugging in icons and themes, custom block renderers.
- [docs/API.md](docs/API.md): endpoint contracts, SSE events, idempotency, block examples, migrations and tests.
- [docs/property-desk-upstream.md](docs/property-desk-upstream.md): the upstream endpoints and how their fields map to property cards. Only the projects list is called.

## Configuration

Settings are read from environment variables (see `.env.example`). `npm run dev:api`, `npm start` and `npm run db:migrate` also load a repo-root `.env` if one exists. If `CHAT_PROVIDER` is blank, the API selects Gemini when `GEMINI_API_KEY` is set and otherwise selects the mock provider. `CHAT_PROVIDER=gemini` requires a key (get one at https://aistudio.google.com/apikey); the API logs the selected provider and property source at startup.

With Gemini, the model writes the reply text and works through tools: `search_properties` and `compare_properties` query the backend catalogue, and the other tools show quick replies, questions and forms. The server builds every block, so the model never invents project cards. The default `PROPERTY_SOURCE=fixtures` uses the 50 fictional projects; set it to `catalog` to query the configured live projects API.

## Current limitations

- **Fictional demo catalogue.** The 50 project cases and their photo references are in the [demo project catalogue](apps/llm/src/demo-projects/README.md); names, prices, locations and other project details are illustrative only.
- **Listing data is indicative.** Search uses the projects list only (no detail endpoint), cached for 10 minutes. Locality ids are opaque, so search matches sectors by keyword only.
- **Lead delivery is configurable.** With `LEADS_MODE=catalog`, callback, site-visit and online-presentation requests use the Property Desk enquiry flow and WhatsApp OTP. In the default disabled mode, forms collect details but do not send them.
- **Signed-in chats stay private.** Set the same high-entropy `CHAT_AUTH_SECRET` in this service and Property Desk. Its `/api/auth/chat-token` endpoint exchanges the website's HTTP-only session for a five-minute, single-purpose ticket; the chatbot stores only its verified subject as the conversation owner.
- **No authentication.** Anyone who knows a conversation id can read it. Before production, add anonymous identity or ownership, CORS and origin allowlists, rate limiting, observability and retention/deletion workflows.
