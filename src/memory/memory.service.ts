import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { 
  MemoryEntry, 
  MemoryType, 
  UserContext, 
  MemorySearchQuery, 
  MemorySearchResult,
  ExtractedMemory,
  ConversationContext
} from '../common/memory-types';
import { randomUUID } from 'crypto';

@Injectable()
export class MemoryService {
  private openai: OpenAI;
  private memories: Map<string, MemoryEntry> = new Map(); // In-memory storage for MVP
  private userContexts: Map<string, UserContext> = new Map();
  
  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  async extractAndStoreMemories(userMessage: string, userId: string = 'default'): Promise<ExtractedMemory[]> {
    try {
      if (!this.openai) {
        return this.fallbackExtraction(userMessage);
      }

      const systemPrompt = `You are a memory extraction system. Analyze the user's message and extract any information that should be remembered for future interactions.

Extract information like:
- Personal preferences ("I prefer morning meetings", "I don't like Friday afternoon calls")
- Contact information ("John works at Google", "Jane's email is jane@company.com")
- Recurring patterns ("Lunch is always 12-1pm", "Weekly standup every Monday 10am")
- Future reminders ("Follow up on project proposal next week", "Check on budget approval")
- Relationships ("John is my manager", "Sarah from marketing team")
- Context notes ("Last meeting with client was about pricing")

For each piece of information, determine:
1. Content - what to remember
2. Type - category of memory
3. Importance (1-10) - how important is this to remember
4. Tags - keywords for easy retrieval
5. Context - additional structured data
6. ExpiresAt - when this information becomes outdated (optional)

Return JSON array of memories to store.`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract memories from: "${userMessage}"` }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) return [];

      const parsed = JSON.parse(response);
      const memories = parsed.memories || [];

      const extractedMemories: ExtractedMemory[] = [];

      for (const memory of memories) {
        const extracted: ExtractedMemory = {
          content: memory.content || '',
          type: this.mapToMemoryType(memory.type),
          importance: Math.min(10, Math.max(1, memory.importance || 5)),
          tags: Array.isArray(memory.tags) ? memory.tags : [memory.type],
          context: memory.context || {},
          expiresAt: memory.expiresAt ? new Date(memory.expiresAt) : undefined
        };

        if (extracted.content) {
          extractedMemories.push(extracted);
          await this.storeMemory(extracted, userId);
        }
      }

      return extractedMemories;

    } catch (error) {
      console.error('Error extracting memories:', error);
      return this.fallbackExtraction(userMessage);
    }
  }

  async storeMemory(memory: ExtractedMemory, userId: string): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: randomUUID(),
      type: memory.type,
      content: memory.content,
      context: { ...memory.context, userId },
      importance: memory.importance,
      createdAt: new Date(),
      lastAccessed: new Date(),
      tags: memory.tags,
      expiresAt: memory.expiresAt
    };

    this.memories.set(entry.id, entry);
    console.log(`Stored memory: ${entry.type} - ${entry.content}`);
    
    return entry;
  }

  async searchMemories(query: MemorySearchQuery, userId: string = 'default'): Promise<MemorySearchResult> {
    const userMemories = Array.from(this.memories.values())
      .filter(m => m.context.userId === userId && !this.isExpired(m));

    let filteredMemories = userMemories;

    // Filter by type if specified
    if (query.type) {
      filteredMemories = filteredMemories.filter(m => m.type === query.type);
    }

    // Filter by importance if specified
    if (query.importance) {
      filteredMemories = filteredMemories.filter(m => m.importance >= query.importance);
    }

    // Simple text matching for now (in production, use vector embeddings)
    const searchTerms = query.query.toLowerCase().split(' ');
    const scoredMemories = filteredMemories.map(memory => {
      const content = memory.content.toLowerCase();
      const tags = memory.tags.join(' ').toLowerCase();
      
      let score = 0;
      searchTerms.forEach(term => {
        if (content.includes(term)) score += 3;
        if (tags.includes(term)) score += 2;
        if (memory.type.includes(term)) score += 1;
      });
      
      // Boost score by importance and recency
      score += memory.importance;
      const daysSinceCreated = (Date.now() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 10 - daysSinceCreated); // More recent = higher score

      return { memory, score };
    });

    // Sort by relevance score
    scoredMemories.sort((a, b) => b.score - a.score);

    const maxResults = query.maxResults || 10;
    const topResults = scoredMemories.slice(0, maxResults);

    return {
      entries: topResults.map(r => r.memory),
      relevanceScores: topResults.map(r => r.score),
      totalFound: filteredMemories.length
    };
  }

  async buildConversationContext(
    userMessage: string, 
    userId: string = 'default',
    recentMessages: string[] = []
  ): Promise<ConversationContext> {
    // Search for relevant memories
    const memoryQuery: MemorySearchQuery = {
      query: userMessage,
      maxResults: 5,
      importance: 3 // Only include moderately important+ memories
    };

    const memoryResults = await this.searchMemories(memoryQuery, userId);
    const userContext = this.getUserContext(userId);

    // Extract entities from current message
    const entities = await this.extractEntities(userMessage);

    return {
      recentMessages: recentMessages.slice(-3), // Last 3 messages
      relevantMemories: memoryResults.entries,
      userContext,
      currentIntent: '', // Will be filled by LLM
      mentionedPeople: entities.people,
      mentionedDates: entities.dates,
      mentionedLocations: entities.locations
    };
  }

  getUserContext(userId: string = 'default'): UserContext {
    return this.userContexts.get(userId) || {
      userId,
      timezone: 'Asia/Jerusalem',
      workingHours: { start: 9, end: 18 },
      preferences: {
        meetingBuffer: 15,
        preferredMeetingLength: 60
      }
    };
  }

  updateUserContext(userId: string, context: Partial<UserContext>): void {
    const existing = this.getUserContext(userId);
    this.userContexts.set(userId, { ...existing, ...context });
  }

  async getMemoriesByType(type: MemoryType, userId: string = 'default'): Promise<MemoryEntry[]> {
    return Array.from(this.memories.values())
      .filter(m => m.type === type && m.context.userId === userId && !this.isExpired(m))
      .sort((a, b) => b.importance - a.importance);
  }

  async removeMemory(memoryId: string): Promise<boolean> {
    return this.memories.delete(memoryId);
  }

  async updateMemoryImportance(memoryId: string, importance: number): Promise<boolean> {
    const memory = this.memories.get(memoryId);
    if (memory) {
      memory.importance = Math.min(10, Math.max(1, importance));
      memory.lastAccessed = new Date();
      return true;
    }
    return false;
  }

  // Helper methods
  private mapToMemoryType(typeString: string): MemoryType {
    const lowercaseType = typeString?.toLowerCase() || '';
    
    if (lowercaseType.includes('preference')) return MemoryType.USER_PREFERENCE;
    if (lowercaseType.includes('contact') || lowercaseType.includes('email')) return MemoryType.CONTACT_INFO;
    if (lowercaseType.includes('recurring') || lowercaseType.includes('always')) return MemoryType.RECURRING_PATTERN;
    if (lowercaseType.includes('reminder') || lowercaseType.includes('follow')) return MemoryType.FUTURE_REMINDER;
    if (lowercaseType.includes('relationship') || lowercaseType.includes('manager')) return MemoryType.RELATIONSHIP;
    if (lowercaseType.includes('location')) return MemoryType.LOCATION_PREFERENCE;
    if (lowercaseType.includes('context') || lowercaseType.includes('note')) return MemoryType.CONTEXT_NOTE;
    
    return MemoryType.CONTEXT_NOTE; // Default
  }

  private fallbackExtraction(userMessage: string): ExtractedMemory[] {
    const message = userMessage.toLowerCase();
    const extracted: ExtractedMemory[] = [];

    // Simple pattern matching fallbacks
    if (message.includes('prefer') && (message.includes('morning') || message.includes('afternoon'))) {
      extracted.push({
        content: `User prefers ${message.includes('morning') ? 'morning' : 'afternoon'} meetings`,
        type: MemoryType.USER_PREFERENCE,
        importance: 7,
        tags: ['preference', 'timing'],
        context: { timePreference: message.includes('morning') ? 'morning' : 'afternoon' }
      });
    }

    if (message.includes('lunch') && (message.includes('always') || message.includes('usually'))) {
      extracted.push({
        content: 'User has regular lunch schedule',
        type: MemoryType.RECURRING_PATTERN,
        importance: 8,
        tags: ['lunch', 'recurring'],
        context: { pattern: 'lunch' }
      });
    }

    return extracted;
  }

  private async extractEntities(message: string): Promise<{people: string[], dates: string[], locations: string[]}> {
    // Simple entity extraction - in production, use NER or more sophisticated methods
    const words = message.split(' ');
    
    const people = words.filter(word => 
      /^[A-Z][a-z]+$/.test(word) && 
      !['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(word)
    );

    const dates = words.filter(word => 
      ['today', 'tomorrow', 'yesterday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(word.toLowerCase())
    );

    const locations = words.filter(word => 
      ['office', 'home', 'starbucks', 'zoom', 'teams'].includes(word.toLowerCase())
    );

    return { people, dates, locations };
  }

  private isExpired(memory: MemoryEntry): boolean {
    return memory.expiresAt ? memory.expiresAt < new Date() : false;
  }
}