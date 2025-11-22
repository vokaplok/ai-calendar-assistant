export interface ParsedEvent {
  title: string;
  start: string; // ISO 8601 date-time
  end: string;   // ISO 8601 date-time
  location?: string;
  notes?: string;
  confidence: number;
}

export interface CalendarEvent {
  id?: string;
  summary: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: string;
  description?: string;
}

export interface UserIntent {
  type: 'create_event' | 'query_availability' | 'find_free_slots' | 'list_events' | 'general_question';
  parameters: {
    // For create_event
    events?: ParsedEvent[];
    
    // For query_availability
    startTime?: string;
    endTime?: string;
    
    // For find_free_slots  
    date?: string;
    duration?: number; // minutes
    
    // For list_events
    timeRange?: {
      start?: string;
      end?: string;
    };
    
    // For general questions
    question?: string;
  };
  confidence: number;
}