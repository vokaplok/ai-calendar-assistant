import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ParsedEvent, UserIntent } from '../common/types';
import { CALENDAR_FUNCTIONS, FunctionCall } from '../common/function-schemas';
import { ConversationContext } from '../common/memory-types';
import { z } from 'zod';

const EventSchema = z.object({
  title: z.string(),
  start: z.string(),
  end: z.string(),
  location: z.string().optional(),
  notes: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

const ParsedOutputSchema = z.object({
  timezone: z.literal('Asia/Jerusalem'),
  events: z.array(EventSchema),
});

const IntentSchema = z.object({
  type: z.enum(['create_event', 'query_availability', 'find_free_slots', 'list_events', 'general_question']),
  parameters: z.object({
    events: z.array(EventSchema).optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(), 
    date: z.string().optional(),
    duration: z.number().optional(),
    timeRange: z.object({
      start: z.string().optional(),
      end: z.string().optional(),
    }).optional(),
    question: z.string().optional(),
  }),
  confidence: z.number().min(0).max(1),
});

@Injectable()
export class LlmService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }
    this.openai = new OpenAI({ apiKey });
  }

  async parseTextCommand(userMessage: string): Promise<ParsedEvent[]> {
    try {
      const now = new Date();
      const israelTime = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(now);
      
      const systemPrompt = `You are an AI calendar assistant. Parse natural language messages into calendar events.

Current date and time in Asia/Jerusalem: ${israelTime}
Timezone: Asia/Jerusalem

Rules:
1. Always set timezone to "Asia/Jerusalem"  
2. If no date is specified, assume today (${israelTime.split(',')[0]})
3. If no end time is specified, assume 1 hour duration
4. Use ISO 8601 format for start/end times WITHOUT timezone suffix (local time only)
5. Example: "7pm today" should be "${israelTime.split(',')[0]}T19:00:00" 
6. Extract any location mentioned
7. Set confidence based on how clear the request is (0.0-1.0)
8. If the request is ambiguous or unclear, return empty events array

Examples:
- "create event for 7pm called Tennis" → event from 19:00 to 20:00 today
- "meeting tomorrow at 3pm with John" → event from 15:00 to 16:00 tomorrow, notes: "with John"  
- "lunch at 12:30" → event from 12:30 to 13:30 today
- "book 2 meetings tomorrow: John at 2pm and Sarah at 3pm" → two separate events: "Meeting with John" 14:00-15:00 tomorrow, "Meeting with Sarah" 15:00-16:00 tomorrow

Return JSON in this exact format:
{
  "timezone": "Asia/Jerusalem",
  "events": [
    {
      "title": "Event Title",
      "start": "2024-01-15T19:00:00",
      "end": "2024-01-15T20:00:00",
      "location": "Optional location",
      "notes": "Optional notes",
      "confidence": 0.9
    }
  ]
}`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      const parsedResponse = JSON.parse(responseText);
      const validatedOutput = ParsedOutputSchema.parse(parsedResponse);

      return validatedOutput.events as ParsedEvent[];
    } catch (error) {
      console.error('Error parsing text command:', error);
      
      // If parsing fails, try a simpler approach
      const fallbackEvent = this.createFallbackEvent(userMessage);
      return fallbackEvent ? [fallbackEvent] : [];
    }
  }

  private createFallbackEvent(message: string): ParsedEvent | null {
    // Simple fallback parsing for basic patterns
    const now = new Date();
    const timeRegex = /(\d{1,2}):?(\d{2})?\s*(am|pm)?/i;
    const titleRegex = /called\s+([^,]+)|"([^"]+)"|'([^']+)'/i;
    
    const timeMatch = message.match(timeRegex);
    const titleMatch = message.match(titleRegex);
    
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = parseInt(timeMatch[2] || '0');
      const ampm = timeMatch[3]?.toLowerCase();
      
      if (ampm === 'pm' && hour !== 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      
      const startTime = new Date(now);
      startTime.setHours(hour, minute, 0, 0);
      
      const endTime = new Date(startTime);
      endTime.setHours(startTime.getHours() + 1);
      
      const title = titleMatch?.[1] || titleMatch?.[2] || titleMatch?.[3] || 'Event';
      
      return {
        title: title.trim(),
        start: startTime.toISOString().slice(0, -1), // Remove Z for local time
        end: endTime.toISOString().slice(0, -1),
        confidence: 0.6,
      };
    }
    
    return null;
  }

  async classifyIntent(userMessage: string): Promise<UserIntent> {
    try {
      const now = new Date();
      const israelTime = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(now);

      const systemPrompt = `You are an AI calendar assistant. Classify user messages into intents and extract relevant parameters.

Current date and time in Asia/Jerusalem: ${israelTime}

Intent Types:
1. create_event - User wants to create/schedule a new event
2. query_availability - User asks if they're free at a specific time
3. find_free_slots - User wants to find available time slots
4. list_events - User wants to see their schedule/events
5. general_question - Other questions about calendar or general queries

Examples:
- "create event for 7pm called Tennis" → create_event
- "am I free at 2pm tomorrow?" → query_availability (startTime: tomorrow 2pm, endTime: tomorrow 3pm)
- "is there anything scheduled for 2pm-3pm?" → query_availability
- "what are free slots for tomorrow (for 1 hour window)" → find_free_slots (date: tomorrow, duration: 60)
- "what's my schedule for today?" → list_events (timeRange: today)
- "what meetings do I have this week?" → list_events (timeRange: this week)

For dates/times, use ISO format in local timezone (Asia/Jerusalem) without timezone suffix.
Today is: ${israelTime.split(',')[0]}

Return JSON in this format:
{
  "type": "intent_type",
  "parameters": {
    // Relevant parameters based on intent type
  },
  "confidence": 0.9
}`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      const parsedResponse = JSON.parse(responseText);
      const validatedIntent = IntentSchema.parse(parsedResponse);

      return validatedIntent as UserIntent;
    } catch (error) {
      console.error('Error classifying intent:', error);
      
      // Fallback to simple pattern matching
      return this.fallbackIntentClassification(userMessage);
    }
  }

  private fallbackIntentClassification(message: string): UserIntent {
    const lowerMessage = message.toLowerCase();

    // Check for create patterns
    if (lowerMessage.includes('create') || lowerMessage.includes('schedule') || lowerMessage.includes('add') || lowerMessage.includes('book')) {
      return {
        type: 'create_event',
        parameters: { question: message },
        confidence: 0.7
      };
    }

    // Check for availability patterns  
    if (lowerMessage.includes('free') && (lowerMessage.includes('at') || lowerMessage.includes('from'))) {
      return {
        type: 'query_availability',
        parameters: { question: message },
        confidence: 0.6
      };
    }

    // Check for free slots patterns
    if (lowerMessage.includes('free slot') || lowerMessage.includes('available slot') || lowerMessage.includes('when can')) {
      return {
        type: 'find_free_slots',
        parameters: { question: message, duration: 60 },
        confidence: 0.6
      };
    }

    // Check for list patterns
    if (lowerMessage.includes('schedule') || lowerMessage.includes('meetings') || lowerMessage.includes('events') || lowerMessage.includes('today') || lowerMessage.includes('tomorrow')) {
      return {
        type: 'list_events',
        parameters: { question: message },
        confidence: 0.6
      };
    }

    return {
      type: 'general_question',
      parameters: { question: message },
      confidence: 0.5
    };
  }

  async planAndExecute(userQuery: string): Promise<{ functionCalls: FunctionCall[]; reasoning: string }> {
    try {
      const now = new Date();
      const israelTime = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(now);

      const systemPrompt = `You are an AI calendar assistant. Plan and execute calendar operations using the available functions.

Current date and time in Asia/Jerusalem: ${israelTime}
Today is: ${israelTime.split(',')[0]}

Guidelines:
- Use Asia/Jerusalem timezone for all dates/times
- Break complex requests into multiple function calls
- Always call functions in logical order
- Use ISO format for dates/times
- Be thorough in your analysis
- For multiple events in one request, create separate create_event calls for each event
- MANDATORY: Each create_event function call creates only ONE event. If user wants multiple events, make multiple function calls.

Examples:
- "Plan my day" → list_events for today, then analyze_schedule
- "Delete everything with Jane" → list_events for broader period, then delete_events with "Jane"  
- "When can I meet with John for 2 hours?" → list_events, then find_free_slots with duration=120
- "Am I free at 2pm tomorrow?" → check_availability for specific time
- "book 2 meetings tomorrow: John at 2pm and Sarah at 3pm" → Create two separate create_event calls, one for John at 2pm and one for Sarah at 3pm

CRITICAL: When multiple events are requested, you MUST make multiple create_event function calls - one for each event. Do not try to create multiple events in a single function call.

You MUST call the appropriate functions to fulfill the user's request. Don't just explain what you would do - actually call the functions.`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userQuery }
        ],
        tools: CALENDAR_FUNCTIONS.map(func => ({
          type: 'function' as const,
          function: {
            name: func.name,
            description: func.description,
            parameters: func.parameters
          }
        })),
        tool_choice: 'auto',
        parallel_tool_calls: true,
        temperature: 0.1
      });

      const message = completion.choices[0]?.message;
      if (!message) {
        throw new Error('No response from OpenAI');
      }

      const functionCalls: FunctionCall[] = [];
      
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.type === 'function') {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              functionCalls.push({
                name: toolCall.function.name,
                arguments: args
              });
            } catch (error) {
              console.error('Error parsing function arguments:', error);
            }
          }
        }
      }

      return {
        functionCalls,
        reasoning: message.content || 'Processing your request...'
      };

    } catch (error) {
      console.error('Error in planAndExecute:', error);
      
      // Fallback to simple function call based on keywords
      return this.fallbackPlan(userQuery);
    }
  }

  async generateResponse(userQuery: string, functionResults: any[]): Promise<string> {
    try {
      console.log('💬 [LLM] Generating simple response...');

      const resultsContext = functionResults.map(result =>
        `Function: ${result.function}\nResult: ${JSON.stringify(result.data, null, 2)}`
      ).join('\n\n');

      const systemPrompt = `You are a helpful calendar assistant. Based on the user's query and the function results, provide a natural, helpful response in Ukrainian.

Be conversational and friendly. Format information clearly. Use emojis appropriately.

User Query: ${userQuery}

Function Results:
${resultsContext}

Provide a comprehensive response based on the results.`;

      console.log('   📡 Calling OpenAI API...');
      const startTime = Date.now();

      // Create promise with timeout
      const completionPromise = this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Please provide a response based on the function results.' }
        ],
        temperature: 0.7
      }, {
        timeout: 30000 // 30 second timeout
      });

      // Add additional timeout wrapper
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OpenAI API timeout after 30 seconds')), 30000)
      );

      const completion = await Promise.race([completionPromise, timeoutPromise]) as any;

      const duration = Date.now() - startTime;
      console.log(`   ✅ OpenAI responded in ${duration}ms`);

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        console.warn('   ⚠️ Empty response from OpenAI, using fallback');
        return this.fallbackResponse(userQuery, functionResults);
      }

      return responseText;

    } catch (error) {
      console.error('❌ [LLM] Error generating response:', error?.message);
      console.error('   Falling back to structured response...');
      return this.fallbackResponse(userQuery, functionResults);
    }
  }

  private fallbackPlan(userQuery: string): { functionCalls: FunctionCall[]; reasoning: string } {
    const lowerQuery = userQuery.toLowerCase();
    
    if (lowerQuery.includes('delete') && (lowerQuery.includes('jane') || lowerQuery.includes('john'))) {
      const name = lowerQuery.includes('jane') ? 'jane' : 'john';
      return {
        functionCalls: [
          {
            name: 'delete_events',
            arguments: { search_query: name }
          }
        ],
        reasoning: `Deleting events related to ${name}`
      };
    }
    
    if (lowerQuery.includes('plan') && lowerQuery.includes('day')) {
      const today = new Date().toISOString().split('T')[0];
      return {
        functionCalls: [
          {
            name: 'list_events',
            arguments: {
              start_date: `${today}T00:00:00`,
              end_date: `${today}T23:59:59`
            }
          }
        ],
        reasoning: 'Getting today\'s schedule to help plan your day'
      };
    }
    
    if (lowerQuery.includes('free') || lowerQuery.includes('available')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      return {
        functionCalls: [
          {
            name: 'find_free_slots',
            arguments: {
              date: tomorrowStr,
              duration_minutes: 60
            }
          }
        ],
        reasoning: 'Finding available time slots'
      };
    }

    // Default to listing today's events
    const today = new Date().toISOString().split('T')[0];
    return {
      functionCalls: [
        {
          name: 'list_events',
          arguments: {
            start_date: `${today}T00:00:00`,
            end_date: `${today}T23:59:59`
          }
        }
      ],
      reasoning: 'Getting your current schedule'
    };
  }


  private fallbackResponse(userQuery: string, functionResults: any[]): string {
    console.log('⚠️ Using fallback response (OpenAI unavailable)');

    if (functionResults.length === 0) {
      return "Не вдалося обробити ваш запит. Спробуйте ще раз.";
    }

    let response = "📋 **Ось що я знайшов:**\n\n";

    functionResults.forEach(result => {
      if (!result.success) {
        response += `❌ Помилка: ${result.error}\n\n`;
        return;
      }

      if (result.data) {
        // Handle events list
        if (result.data.events && Array.isArray(result.data.events)) {
          const events = result.data.events;

          if (events.length === 0) {
            response += `📅 Подій не знайдено\n\n`;
          } else {
            response += `📅 **Знайдено ${events.length} подій:**\n\n`;

            events.forEach((event, index) => {
              const title = event.summary || 'Без назви';
              const start = event.start?.dateTime || event.start?.date;
              const end = event.end?.dateTime || event.end?.date;

              if (start) {
                const startDate = new Date(start);
                const endDate = end ? new Date(end) : null;

                // Format date and time
                const dateStr = startDate.toLocaleDateString('uk-UA', {
                  timeZone: 'Asia/Jerusalem',
                  day: 'numeric',
                  month: 'long',
                  weekday: 'short'
                });

                const timeStr = startDate.toLocaleTimeString('uk-UA', {
                  timeZone: 'Asia/Jerusalem',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                const endTimeStr = endDate ? endDate.toLocaleTimeString('uk-UA', {
                  timeZone: 'Asia/Jerusalem',
                  hour: '2-digit',
                  minute: '2-digit'
                }) : '';

                response += `${index + 1}. **${title}**\n`;
                response += `   📅 ${dateStr}\n`;
                response += `   🕐 ${timeStr}${endTimeStr ? ' - ' + endTimeStr : ''}\n`;

                if (event.location) {
                  response += `   📍 ${event.location}\n`;
                }

                response += '\n';
              }
            });
          }
        }

        // Handle free slots
        else if (result.data.slots && Array.isArray(result.data.slots)) {
          const slots = result.data.slots;

          if (slots.length === 0) {
            response += `🕐 Вільних слотів не знайдено\n\n`;
          } else {
            response += `🕐 **Знайдено ${slots.length} вільних слотів:**\n\n`;

            slots.slice(0, 10).forEach((slot, index) => {
              const start = new Date(slot.start);
              const end = new Date(slot.end);

              const timeStr = start.toLocaleTimeString('uk-UA', {
                timeZone: 'Asia/Jerusalem',
                hour: '2-digit',
                minute: '2-digit'
              });

              const endTimeStr = end.toLocaleTimeString('uk-UA', {
                timeZone: 'Asia/Jerusalem',
                hour: '2-digit',
                minute: '2-digit'
              });

              response += `${index + 1}. ${timeStr} - ${endTimeStr}\n`;
            });

            if (slots.length > 10) {
              response += `\n...і ще ${slots.length - 10} слотів\n`;
            }
            response += '\n';
          }
        }

        // Handle deleted events
        else if (result.data.deleted !== undefined) {
          response += `✅ Видалено ${result.data.deleted} подій\n\n`;
        }

        // Handle availability check
        else if (result.data.available !== undefined) {
          response += result.data.available
            ? `✅ Ви вільні в цей час\n\n`
            : `❌ У вас вже є подія в цей час\n\n`;
        }
      }
    });

    response += `\n_Примітка: Відповідь згенерована в резервному режимі_`;

    return response;
  }


  async planAndExecuteWithContext(userQuery: string, context: ConversationContext): Promise<{ functionCalls: FunctionCall[]; reasoning: string }> {
    try {
      const now = new Date();
      const israelTime = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(now);

      // Build memory context string
      const memoryContext = context.relevantMemories.length > 0 
        ? `\nRelevant memories:\n${context.relevantMemories.map(m => `- ${m.content} (${m.type}, importance: ${m.importance})`).join('\n')}`
        : '';

      const userContextInfo = `
User Context:
- Timezone: ${context.userContext.timezone}
- Working hours: ${context.userContext.workingHours.start}:00 - ${context.userContext.workingHours.end}:00
- Meeting buffer: ${context.userContext.preferences.meetingBuffer} minutes
- Preferred meeting length: ${context.userContext.preferences.preferredMeetingLength} minutes
${context.userContext.preferences.lunchTime ? `- Lunch time: ${context.userContext.preferences.lunchTime.start} - ${context.userContext.preferences.lunchTime.end}` : ''}`;

      const systemPrompt = `You are an AI calendar assistant with memory. Plan and execute calendar operations using the available functions.

Current date and time in Asia/Jerusalem: ${israelTime}
Today is: ${israelTime.split(',')[0]}

${userContextInfo}${memoryContext}

Guidelines:
- Use the user's stored preferences and context when planning
- Consider their working hours and meeting preferences
- Reference past conversations and stored information
- Use memory functions to store new important information
- Search memory when relevant information might exist
- Always call functions to fulfill requests - don't just explain
- For multiple events in one request, create separate create_event calls for each event
- MANDATORY: Each create_event function call creates only ONE event. If user wants multiple events, make multiple function calls.

Examples:
- "I prefer morning meetings" → Use store_memory to remember this preference
- "Schedule with John" → Search memory for John's contact info, then schedule
- "Plan my day" → Consider stored preferences when suggesting optimal schedule
- "My lunch is always 12-1pm" → Store as recurring pattern and use for future scheduling
- "book 1" or "1" or "book slot 1" → Use select_from_list with selection_number=1, list_type="time_slots", action="book"
- "book 2 meetings tomorrow: John at 2pm and Sarah at 3pm" → Create two separate create_event calls, one for John at 2pm and one for Sarah at 3pm

🚨 CRITICAL: MULTIPLE tool_calls IN SINGLE RESPONSE 🚨

For multiple meetings, you MUST emit multiple tool_calls in the SAME response message.

REQUIRED RESPONSE FORMAT for "book 2 meetings tomorrow: John at 2pm and Sarah at 3pm":
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    {
      "id": "call_1",
      "type": "function", 
      "function": {
        "name": "create_event",
        "arguments": "{\"title\": \"Meeting with John\", \"start_time\": \"2025-10-25T14:00:00\", \"end_time\": \"2025-10-25T15:00:00\"}"
      }
    },
    {
      "id": "call_2", 
      "type": "function",
      "function": {
        "name": "create_event", 
        "arguments": "{\"title\": \"Meeting with Sarah\", \"start_time\": \"2025-10-25T15:00:00\", \"end_time\": \"2025-10-25T16:00:00\"}"
      }
    }
  ]
}

Each meeting = one tool_call in the tool_calls array.
Multiple meetings = multiple tool_calls in the SAME response.
DO NOT make separate responses - put all tool_calls in ONE response!

OTHER RULES:
- If user responds with just a number (like "1", "2", "3") or "book 1", "book slot 2", etc. - they are selecting from a recently shown numbered list. Use select_from_list function.

You MUST call the appropriate functions to fulfill the user's request.`;

      // Debug: Log what we're sending to OpenAI
      console.log('🔍 [LLM] SENDING TO LLM:');
      console.log('   Model: gpt-4-turbo-preview');
      console.log('   User query:', userQuery);
      console.log('   Tools available:', CALENDAR_FUNCTIONS.length);
      console.log('   Parallel tool calls: true');
      console.log('   Tool choice: required');

      console.log('   📡 Calling OpenAI API for function planning...');
      const planStartTime = Date.now();

      // Create promise with timeout
      const completionPromise = this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userQuery },
          { role: 'assistant', content: 'I need to count how many separate events/people are mentioned and make that many create_event function calls in parallel.' }
        ],
        tools: CALENDAR_FUNCTIONS.map(func => ({
          type: 'function' as const,
          function: {
            name: func.name,
            description: func.description,
            parameters: func.parameters
          }
        })),
        tool_choice: 'required',
        parallel_tool_calls: true,
        temperature: 0.0,
        max_tokens: 4000
      }, {
        timeout: 30000 // 30 second timeout
      });

      // Add additional timeout wrapper
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OpenAI API timeout after 30 seconds (planning phase)')), 30000)
      );

      const completion = await Promise.race([completionPromise, timeoutPromise]) as any;

      const planDuration = Date.now() - planStartTime;
      console.log(`   ✅ OpenAI planning completed in ${planDuration}ms`);

      // Debug: Log the exact response from OpenAI
      console.log('🔍 LLM RESPONSE:');
      console.log('Response message:', JSON.stringify(completion.choices[0]?.message, null, 2));
      console.log('Tool calls count:', completion.choices[0]?.message?.tool_calls?.length || 0);

      const message = completion.choices[0]?.message;
      if (!message) {
        throw new Error('No response from OpenAI');
      }

      const functionCalls: FunctionCall[] = [];
      
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.type === 'function') {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              functionCalls.push({
                name: toolCall.function.name,
                arguments: args
              });
            } catch (error) {
              console.error('Error parsing function arguments:', error);
            }
          }
        }
      }

      console.log(`🔍 VERIFICATION: Expected events vs actual function calls`);
      console.log('Function calls generated:', functionCalls.length);

      return {
        functionCalls,
        reasoning: message.content || 'Processing your request with context...'
      };

    } catch (error) {
      console.error('Error in planAndExecuteWithContext:', error);
      
      // Fallback to simple version
      return this.planAndExecute(userQuery);
    }
  }

  async generateResponseWithContext(userQuery: string, functionResults: any[], context: ConversationContext): Promise<string> {
    try {
      console.log('🤖 [LLM] Generating response with context...');
      console.log(`   Query: "${userQuery}"`);
      console.log(`   Function results: ${functionResults.length} results`);

      // Check for errors in function results and format them clearly
      const errors = functionResults.filter(result => !result.success);
      const successful = functionResults.filter(result => result.success);

      if (errors.length > 0) {
        console.warn(`   ⚠️ ${errors.length} function(s) failed`);
        errors.forEach(err => console.warn(`      - ${err.function}: ${err.error}`));
      }

      const resultsContext = functionResults.map(result => {
        if (result.success) {
          return `Function: ${result.function}\nResult: ${JSON.stringify(result.data, null, 2)}`;
        } else {
          return `Function: ${result.function}\nERROR: ${result.error || 'Unknown error'}`;
        }
      }).join('\n\n');

      const memoryContext = context.relevantMemories.length > 0
        ? `\nUser's relevant memories:\n${context.relevantMemories.map(m => `- ${m.content}`).join('\n')}`
        : '';

      const systemPrompt = `You are a helpful calendar assistant with memory. Based on the user's query and function results, provide a natural, personalized response.

IMPORTANT: Always use the FRESH FUNCTION RESULTS, not stored memories for current data like time slots or events.

Be conversational, friendly, and reference stored information when relevant. Use emojis appropriately.

User Query: ${userQuery}
${memoryContext}

FRESH FUNCTION RESULTS (use these for current data):
${resultsContext}

${errors.length > 0 ? `
ERRORS ENCOUNTERED: ${errors.length} function(s) failed
- Explain any errors clearly to the user
- Suggest what they can try to fix the issues
- Be helpful and not technical
` : ''}

Guidelines:
- If function results contain time slots, show ONLY those fresh results
- If function results contain events, show ONLY those fresh results
- Use stored memories for context and preferences, not current data
- When showing numbered lists, make it clear users can respond with just the number
- If there are errors, explain them clearly and suggest solutions
- Always be helpful and provide actionable advice

Provide a comprehensive, personalized response based on the FRESH function results.`;

      console.log('   📡 Calling OpenAI API...');
      const startTime = Date.now();

      // Create promise with timeout
      const completionPromise = this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Please provide a response based on the function results and context.' }
        ],
        temperature: 0.7
      }, {
        timeout: 30000 // 30 second timeout
      });

      // Add additional timeout wrapper
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OpenAI API timeout after 30 seconds')), 30000)
      );

      const completion = await Promise.race([completionPromise, timeoutPromise]) as any;

      const duration = Date.now() - startTime;
      console.log(`   ✅ OpenAI responded in ${duration}ms`);

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        console.warn('   ⚠️ Empty response from OpenAI, using fallback');
        return this.generateResponse(userQuery, functionResults);
      }

      console.log(`   📝 Response length: ${responseText.length} characters`);
      return responseText;

    } catch (error) {
      console.error('❌ [LLM] Error generating response with context:', error);
      console.error('   Error type:', error?.constructor?.name);
      console.error('   Error message:', error?.message);
      console.error('   Falling back to simple response generation...');

      return this.generateResponse(userQuery, functionResults);
    }
  }
}