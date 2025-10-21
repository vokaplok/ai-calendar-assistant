# AI Calendar Assistant 🤖📅

An intelligent Telegram bot that manages your Google Calendar using natural language and AI-powered memory.

## ✨ Features

### 🧠 **Smart Memory System**
- **Learns your preferences**: "I prefer morning meetings" → Remembers for future scheduling
- **Stores contact info**: "John works at Google" → Recalls when scheduling with John
- **Remembers patterns**: "My lunch is always 12-1pm" → Avoids scheduling conflicts
- **Context awareness**: References past conversations and stored information

### 📋 **Advanced Calendar Operations** 
- **Create events**: "schedule meeting at 3pm tomorrow"
- **Find free time**: "when am I free for 2 hours this week?"
- **Check availability**: "am I free at 2pm tomorrow?"
- **Analyze schedule**: "plan my day" or "what's my schedule today?"
- **Delete events**: "delete everything with Jane"
- **Smart conflict detection**: Warns about overlapping meetings

### 🎯 **Function Calling Architecture**
- **12 available functions**: From basic event creation to complex schedule analysis
- **Multi-step workflows**: LLM chains functions for complex requests
- **Numbered selections**: "Show slots" → "book slot 3" 
- **Extensible**: Easy to add new calendar operations

### 🔄 **Conversational Context**
- **Remembers recent lists**: Can respond to "book 1" after showing time slots
- **Maintains conversation flow**: Understands follow-up questions
- **Personalized responses**: References your stored preferences and history

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ 
- npm or yarn
- Google Cloud Project with Calendar API enabled
- Telegram Bot Token

### 2. Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### 3. Environment Configuration

Edit `.env` file with your credentials:

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_WEBHOOK_SECRET=optional_webhook_secret

# OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# Google Calendar
GOOGLE_OAUTH_CLIENT_ID=your_google_client_id_here
GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_OAUTH_REDIRECT_URL=http://localhost:3000/oauth/google/callback
```

### 4. Create Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Use `/newbot` command
3. Follow instructions to create your bot
4. Copy the bot token to `.env`

### 5. Setup Google Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable Google Calendar API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set application type to "Web application"
6. Add authorized redirect URI: `http://localhost:3000/oauth/google/callback`
7. Copy Client ID and Client Secret to `.env`

### 6. Get OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create account or sign in
3. Go to API Keys section
4. Create new API key
5. Copy to `.env`

### 7. Run the Application

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## Usage

### 1. Connect Google Calendar

Visit `http://localhost:3000/oauth/google/start` in your browser to authorize Google Calendar access.

### 2. Start Using the Bot

1. Find your bot on Telegram
2. Send `/start` to begin
3. Try natural language commands like:
   - "create event for 7pm called Tennis"
   - "schedule meeting tomorrow at 3pm with John"
   - "add lunch at 12:30pm"

## 💬 Example Commands

### **📅 Event Creation**
- **Simple**: "create event for 7pm called Tennis"
- **With details**: "schedule meeting tomorrow at 3pm with John at Google office"
- **Recurring info**: "my standup is every day at 10am for 15 minutes"

### **🔍 Availability & Scheduling** 
- **Find free time**: "when am I free for 2 hours tomorrow?"
- **Check conflicts**: "am I free at 3pm Friday?"
- **Smart scheduling**: "schedule with John for 90 minutes next week"

### **🧠 Memory & Learning**
- **Store preferences**: "I prefer morning meetings and hate Friday afternoons"
- **Remember contacts**: "John is my manager at Google, email john@google.com"  
- **Set patterns**: "lunch is always 12:30-1:30pm"
- **Query memory**: "what do you remember about my meeting preferences?"

### **📊 Analysis & Planning**
- **Daily planning**: "plan my day" or "optimize my schedule" 
- **Schedule analysis**: "how busy am I this week?"
- **Find patterns**: "analyze my meeting patterns this month"

### **🔄 Conversational Flow**
- **Follow-up selections**: After seeing time slots → "book slot 3" or just "3"
- **Batch operations**: "delete all meetings with Sarah from last month"
- **Complex queries**: "reschedule my 2pm meeting to first available slot tomorrow"

## 🏗️ Architecture

```
src/
├── telegram/          # Telegram bot integration & conversation handling
├── llm/              # LLM function calling & response generation
├── calendar/         # Google Calendar API & orchestration service
├── memory/           # Smart memory system with LLM-powered extraction
└── common/           # Shared types, schemas, and function definitions
```

### **🔧 Key Components**

- **📱 TelegramService**: Handles bot interactions and message routing
- **🧠 LlmService**: Function calling, planning, and response generation  
- **📅 CalendarService**: Google Calendar API integration
- **🎯 CalendarOrchestratorService**: Dynamic function execution (12+ functions)
- **💾 MemoryService**: Context storage, preference learning, conversation memory
- **📋 Function Schemas**: 12 calendar operations from simple to complex

### **🔄 Request Flow**

1. **User Message** → TelegramService
2. **Memory Extraction** → MemoryService (stores important info)
3. **Context Building** → Retrieves relevant memories + user preferences
4. **LLM Planning** → Determines functions to call with full context
5. **Function Execution** → CalendarOrchestratorService runs operations
6. **Response Generation** → LLM creates natural language response
7. **Memory Update** → Stores conversation context for follow-ups

### **⚡ Available Functions**

1. `list_events` - Get calendar events for time ranges
2. `check_availability` - Check if free at specific times
3. `create_event` - Create calendar events
4. `delete_events` - Remove events by search criteria  
5. `find_free_slots` - Find available time slots
6. `analyze_schedule` - Analyze patterns and insights
7. `reschedule_events` - Move existing events
8. `store_memory` - Save important information
9. `search_memory` - Find relevant stored info
10. `get_user_preferences` - Retrieve user context
11. `update_user_context` - Modify user settings
12. `select_from_list` - Handle numbered selections
13. `check_conflicts` - Detect scheduling conflicts

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run start:dev

# Run tests
npm test

# Lint code
npm run lint
```

## Roadmap

See [plan.MD](./plan.MD) for detailed development roadmap including future versions with image processing, database persistence, and advanced features.

## Support

For issues or questions, check the logs or create an issue in the repository.