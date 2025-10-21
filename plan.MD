# AI Calendar Assistant - Project Plan

## MVP Version (v0.1) - Text-only Telegram Bot
**Goal: Simple text command processing without database, images, or complex features**

### Features:
- ✅ Telegram bot that responds to text commands
- ✅ Parse natural language calendar commands like:
  - "create event for 7pm called Tennis"
  - "add meeting tomorrow at 3pm with John"
  - "schedule lunch at 12:30pm"
- ✅ Basic LLM integration (OpenAI/Anthropic) to parse text
- ✅ Google Calendar integration to create events
- ✅ Simple command validation and error handling
- ✅ In-memory storage (no database)
- ✅ Basic timezone handling (Asia/Jerusalem)

### Tech Stack (MVP):
- NestJS + TypeScript
- Telegram Bot API
- OpenAI/Anthropic for text parsing
- Google Calendar API
- Simple file-based config
- No Redis, PostgreSQL, or S3

### Commands:
- `/start` - Connect Google Calendar
- `/help` - Show available commands
- Text messages: Natural language event creation

---

## Version 1.0 - Basic Image Processing
**Goal: Add image OCR and basic persistence**

### Additional Features:
- ✅ Google Cloud Vision OCR for schedule images
- ✅ PostgreSQL + Prisma for data persistence
- ✅ Basic file storage (local filesystem)
- ✅ User preferences storage
- ✅ Event deduplication
- ✅ Preview mode before committing

### New Tech:
- Google Cloud Vision API
- PostgreSQL + Prisma
- Local file storage

---

## Version 2.0 - Advanced Features
**Goal: Full feature set as described in prompt**

### Additional Features:
- ✅ Redis + BullMQ for background processing
- ✅ S3-compatible storage (Hetzner)
- ✅ Voice message support (Whisper STT)
- ✅ Location enrichment (Google Maps Places)
- ✅ Advanced user rules and filtering
- ✅ Undo functionality
- ✅ Conflict detection and resolution
- ✅ Advanced Telegram keyboards and UI

### New Tech:
- Redis + BullMQ
- Whisper STT
- Google Maps Places API
- S3-compatible storage
- Advanced Telegram Bot features

---

## Version 3.0 - Production Ready
**Goal: Production deployment and monitoring**

### Additional Features:
- ✅ Docker containerization
- ✅ Sentry logging and monitoring
- ✅ API rate limiting and security
- ✅ Comprehensive testing suite
- ✅ CI/CD pipeline
- ✅ Performance optimization
- ✅ Multi-user support and scaling

### New Tech:
- Docker + Docker Compose
- Sentry monitoring
- nginx reverse proxy
- CI/CD pipeline
- Load testing tools

---

## Current Sprint: MVP v0.1
### Tasks:
1. [ ] Set up basic NestJS project structure
2. [ ] Create Telegram bot integration for text commands
3. [ ] Implement basic LLM parsing for text prompts
4. [ ] Add Google Calendar integration
5. [ ] Create environment configuration
6. [ ] Test with simple commands like "create event for 7pm called Tennis"

### Success Criteria:
- Bot responds to text messages
- Can parse "create event for 7pm called Tennis" 
- Successfully creates event in Google Calendar
- Handles basic errors gracefully
- Works without database or external storage