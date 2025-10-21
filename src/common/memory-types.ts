export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  context: Record<string, any>;
  importance: number; // 1-10 scale
  createdAt: Date;
  lastAccessed: Date;
  tags: string[];
  expiresAt?: Date;
}

export enum MemoryType {
  USER_PREFERENCE = 'user_preference',    // "I prefer morning meetings"
  CONTACT_INFO = 'contact_info',          // "John works at Google, email john@google.com"
  RECURRING_PATTERN = 'recurring_pattern', // "Lunch is always 12-1pm"
  FUTURE_REMINDER = 'future_reminder',    // "Follow up on tennis game next week"
  CONTEXT_NOTE = 'context_note',          // "Last meeting with Jane was about the project proposal"
  RELATIONSHIP = 'relationship',          // "John is my manager"
  LOCATION_PREFERENCE = 'location_preference', // "Coffee meetings at Starbucks on 5th street"
  TASK_CONTEXT = 'task_context',         // "Working on Q4 planning this month"
  CONVERSATION_CONTEXT = 'conversation_context' // Recent slot suggestions, ongoing conversations
}

export interface UserContext {
  userId?: string;
  name?: string;
  timezone: string;
  workingHours: {
    start: number; // 9 = 9am
    end: number;   // 17 = 5pm
  };
  preferences: {
    meetingBuffer: number; // minutes between meetings
    preferredMeetingLength: number; // default duration
    avoidFridayAfternoons?: boolean;
    lunchTime?: { start: string; end: string };
  };
}

export interface MemorySearchQuery {
  query: string;
  type?: MemoryType;
  tags?: string[];
  importance?: number;
  maxResults?: number;
  includeContext?: boolean;
}

export interface MemorySearchResult {
  entries: MemoryEntry[];
  relevanceScores: number[];
  totalFound: number;
}

export interface ExtractedMemory {
  content: string;
  type: MemoryType;
  importance: number;
  tags: string[];
  context: Record<string, any>;
  expiresAt?: Date;
}

export interface ConversationContext {
  recentMessages: string[];
  relevantMemories: MemoryEntry[];
  userContext: UserContext;
  currentIntent: string;
  mentionedPeople: string[];
  mentionedDates: string[];
  mentionedLocations: string[];
}