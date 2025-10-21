You are an expert NestJS engineer.
Build a production-ready Telegram-first microservice that converts schedule images or messages into Google Calendar events with location enrichment and rules.

Goal

From a Telegram chat:
	1.	User sends an image of a schedule or a text or a voice note.
	2.	Service extracts events with times, titles, notes, and raw locations from the image or message.
	3.	Applies user rules: exclude titles containing “Lunch” or “Break”, set tag “TAU”.
	4.	Resolves location aliases like “N2 on the map” to the real building “Gilman Building, Tel Aviv University” using Google Maps Places.
	5.	Writes deduplicated events to Google Calendar in timezone Asia/Jerusalem.
	6.	Supports preview vs auto-commit, undo, and conflict checks.

Tech stack
	•	NestJS with TypeScript.
	•	Telegram Bot API via webhook.
	•	OCR: Google Cloud Vision (preferred) with bounding boxes.
	•	LLM parsing: OpenAI or Anthropic with function-calling to return strict JSON. Make the LLM module swappable.
	•	STT for voice: Whisper local wrapper interface, but implement a mock provider and an interface so it is pluggable.
	•	Google Maps Places + Geocoding.
	•	Google Calendar API.
	•	Redis + BullMQ for background jobs.
	•	PostgreSQL via Prisma.
	•	S3-compatible object storage (Hetzner).
	•	Sentry logging.

Monorepo structure

apps/
  api/            # NestJS app
packages/
  core/           # shared types, schemas, utils
  ocr/            # OCR provider
  llm/            # LLM parsing and intent modules
  tg/             # Telegram helpers, keyboards
  calendar/       # Google Calendar writer
  maps/           # Places resolver
  storage/        # S3 wrapper
infra/
  docker-compose.yml
  prisma/
    schema.prisma

Environment

Create .env.example with:

NODE_ENV=production
PORT=8080
PUBLIC_BASE_URL=https://yourdomain.tld

# Telegram
TELEGRAM_BOT_TOKEN=xxxxx
TELEGRAM_WEBHOOK_SECRET=xxxxx

# Google Cloud Vision
GCP_PROJECT_ID=xxxxx
GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp.json

# LLM (choose one to start; keep interface)
OPENAI_API_KEY=xxxxx
ANTHROPIC_API_KEY=xxxxx

# Google APIs
GOOGLE_OAUTH_CLIENT_ID=xxxxx
GOOGLE_OAUTH_CLIENT_SECRET=xxxxx
GOOGLE_OAUTH_REDIRECT_URL=https://yourdomain.tld/oauth/google/callback
GOOGLE_CALENDAR_DEFAULT_ID=primary

# Maps
GOOGLE_MAPS_API_KEY=xxxxx

# Redis
REDIS_URL=redis://redis:6379

# Postgres
DATABASE_URL=postgresql://user:pass@db:5432/agent

# S3 storage
S3_ENDPOINT=https://your-hetzner-endpoint
S3_BUCKET=ai-agent
S3_ACCESS_KEY=xxxxx
S3_SECRET_KEY=xxxxx

Database schema (Prisma)
	•	User id, tgUserId, googleAuth json, prefs jsonb.
	•	File id, userId, telegramMessageId, type enum {image,pdf,voice,text}, uri, createdAt.
	•	ParsedEvent id, fileId, title, start, end, locationRaw, notes, confidence float, needsLocationResolution bool, layout jsonb.
	•	Command id, userId, kind, payload jsonb, createdAt.
	•	CalendarEvent id, userId, googleEventId, hashKey, placeId, tags string[], createdAt.
	•	LocationAlias alias primary key, placeId, displayName.

Queues and jobs
	•	ingest_file → store original and normalized file in S3.
	•	parse_schedule → OCR → LLM parser → ParsedEvent[].
	•	interpret_command → apply rules and user text to build an “action plan”.
	•	resolve_locations → for each locationRaw, use LocationAlias then Places API, save placeId.
	•	commit_calendar → dedupe hash and write events to Google Calendar.
	•	undo → deletes created events by ids.

Deterministic dedupe

hashKey = sha1([title|start|end|placeId or locationRaw|timezone].join('|'))
Use hashKey as the Google Calendar event id when possible to avoid duplicates. If 409 conflict, fetch and update.

Timezone and rules
	•	Hard set timezone Asia/Jerusalem.
	•	Exclusions: case-insensitive regex on title or notes for \b(lunch|break)\b.
	•	Tag: always add TAU in extendedProperties.private.tags = ["TAU"].
	•	Option: separate “TAU” calendar if GOOGLE_CALENDAR_DEFAULT_ID is set to that id.

LLM parsing

Use OCR text + layout to reduce hallucinations.
Create a strict function schema and validate JSON output. If invalid, retry once with system reminder.

Parser function schema

type ParsedOutput = {
  timezone: "Asia/Jerusalem",
  events: Array<{
    title: string
    start: string   // ISO 8601 local date-time
    end: string
    location_raw?: string
    notes?: string
  }>
  confidence: number
}

System instructions: infer date from poster headers like “October 22–24, 2025”. If a day header like “Day 1, October 22nd” exists, apply to all rows under it. Never invent locations. If only “N2 on the map” is present, put it in location_raw.

Command interpreter
Allowed verbs: add_events, exclude_titles, map_location_alias, set_tags, preview, commit, undo.
For user phrases like “додай все крім lunch, N2 це Gilman Building, тег TAU” return a single plan:

{
  "action":"commit",
  "payload":{
    "exclude_titles":["Lunch","Break"],
    "tags":["TAU"],
    "aliases":{"N2":"Gilman Building, Tel Aviv University"}
  }
}

Telegram bot behavior
	•	Commands:
	•	/start connect Google Calendar via OAuth.
	•	/prefs show current rules and tags.
	•	/undo remove last committed batch.
	•	When user sends an image:
	•	Reply: “Знайшов N подій. Пропустити Lunch і Break, поставити тег TAU, N2 → Gilman Building?”
	•	Inline buttons: Confirm all, Preview, Cancel.
	•	If user previously set auto-commit, skip preview unless confidence < 0.85 or unresolved location.
	•	When text or voice arrives without a pending file, treat it as global rules or run on the last parsed file.

Location enrichment
	•	First consult LocationAlias map. Seed with:
	•	N2 → Gilman Building, Tel Aviv University
	•	Lorry Lokey → Lorry Lokey Building, Tel Aviv University
	•	If no alias, call Places Autocomplete scoped near TAU campus, pick top match, store placeId, formatted_address, lat, lng.

Google Calendar writer
	•	Use extendedProperties.private = { tags: ["TAU"], source: "telegram-image", file_id: "...", confidence: 0.xx }.
	•	On overlap, send a Telegram preview card listing conflicts with “Add anyway” or “Skip these”.

API routes
	•	POST /tg/webhook Telegram updates.
	•	GET /healthz health check.
	•	GET /oauth/google/start and GET /oauth/google/callback store refresh token server-side per user.

Docker compose

Create infra/docker-compose.yml with services: api, db (postgres), redis, nginx proxy, and a volume-mounted /secrets/gcp.json.

Tests and acceptance
	•	Unit tests for:
	•	exclusion regex
	•	hashKey stability
	•	alias resolution logic
	•	Integration tests:
	•	end-to-end from a sample PNG of the TAU orientation poster producing 5 events after excluding lunch and breaks.
	•	Acceptance criteria:
	•	Send TAU poster image → bot returns preview with 7 rows detected, suggests excluding Lunch and Break, applies tag TAU, resolves N2 to Gilman Building, writes 5 events, no duplicates on re-send.
	•	/undo removes those 5 events.

Seed scripts
	•	Seed LocationAlias with N2 and Lorry Lokey mappings.
	•	Provide a sample image and a mocked OCR response for deterministic tests.

Developer notes
	•	Wrap external calls with retry and timeouts.
	•	Validate all LLM outputs against the schema; on fail, return the OCR text back to user with a small edit UI in Telegram via buttons.
	•	Keep an audit log per request id: input file id, OCR text, parsed JSON, actions, created event ids.

Generate the entire project scaffold with the modules, DTOs, providers, and a minimal working flow. Include example prompts for the LLM parser and the command interpreter. Provide README with setup steps, Telegram webhook setup, and Google OAuth instructions.