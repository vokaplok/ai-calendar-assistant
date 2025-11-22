export interface FunctionSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
}

export const CALENDAR_FUNCTIONS: FunctionSchema[] = [
  {
    name: "list_events",
    description: "Get calendar events for a specific time range",
    parameters: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          format: "date-time",
          description: "Start date/time in ISO format (Asia/Jerusalem timezone)"
        },
        end_date: {
          type: "string", 
          format: "date-time",
          description: "End date/time in ISO format (Asia/Jerusalem timezone)"
        },
        max_results: {
          type: "number",
          description: "Maximum number of events to return (default: 20)"
        }
      },
      required: ["start_date", "end_date"]
    }
  },
  {
    name: "check_availability",
    description: "Check if the user is free during a specific time slot",
    parameters: {
      type: "object",
      properties: {
        start_time: {
          type: "string",
          format: "date-time", 
          description: "Start time in ISO format (Asia/Jerusalem timezone)"
        },
        end_time: {
          type: "string",
          format: "date-time",
          description: "End time in ISO format (Asia/Jerusalem timezone)"
        }
      },
      required: ["start_time", "end_time"]
    }
  },
  {
    name: "create_event", 
    description: "Create a single calendar event. For multiple events, call this function multiple times - once per event.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Event title/summary"
        },
        start_time: {
          type: "string",
          format: "date-time",
          description: "Event start time in ISO format (Asia/Jerusalem timezone)"
        },
        end_time: {
          type: "string", 
          format: "date-time",
          description: "Event end time in ISO format (Asia/Jerusalem timezone)"
        },
        location: {
          type: "string",
          description: "Event location (optional)"
        },
        description: {
          type: "string",
          description: "Event description/notes (optional)"
        }
      },
      required: ["title", "start_time", "end_time"]
    }
  },
  {
    name: "delete_events",
    description: "Delete events matching search criteria",
    parameters: {
      type: "object", 
      properties: {
        search_query: {
          type: "string",
          description: "Search term to match in event titles, descriptions, or locations"
        },
        start_date: {
          type: "string",
          format: "date-time", 
          description: "Limit search to events after this date (optional)"
        },
        end_date: {
          type: "string",
          format: "date-time",
          description: "Limit search to events before this date (optional)"
        }
      },
      required: ["search_query"]
    }
  },
  {
    name: "find_free_slots",
    description: "Find available time slots for scheduling",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          format: "date",
          description: "Date to search for free slots (YYYY-MM-DD)"
        },
        duration_minutes: {
          type: "number", 
          description: "Required slot duration in minutes (default: 60)"
        },
        earliest_hour: {
          type: "number",
          minimum: 0,
          maximum: 23,
          description: "Earliest hour to consider (default: 9)"
        },
        latest_hour: {
          type: "number", 
          minimum: 0,
          maximum: 23,
          description: "Latest hour to consider (default: 18)"
        }
      },
      required: ["date"]
    }
  },
  {
    name: "analyze_schedule",
    description: "Analyze schedule patterns and provide insights",
    parameters: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          format: "date",
          description: "Start date for analysis period"
        },
        end_date: {
          type: "string", 
          format: "date",
          description: "End date for analysis period"
        },
        analysis_type: {
          type: "string",
          enum: ["summary", "conflicts", "free_time", "patterns"],
          description: "Type of analysis to perform"
        }
      },
      required: ["start_date", "end_date", "analysis_type"]
    }
  },
  {
    name: "reschedule_events",
    description: "Move or reschedule existing events",
    parameters: {
      type: "object",
      properties: {
        search_query: {
          type: "string", 
          description: "Search term to find events to reschedule"
        },
        new_start_time: {
          type: "string",
          format: "date-time",
          description: "New start time for the event(s)"
        },
        new_end_time: {
          type: "string",
          format: "date-time", 
          description: "New end time for the event(s) (optional, will preserve duration)"
        }
      },
      required: ["search_query", "new_start_time"]
    }
  },
  {
    name: "store_memory",
    description: "Store important information for future reference",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Information to remember"
        },
        type: {
          type: "string",
          enum: ["user_preference", "contact_info", "recurring_pattern", "future_reminder", "relationship", "location_preference", "context_note"],
          description: "Type of memory to store"
        },
        importance: {
          type: "number",
          minimum: 1,
          maximum: 10,
          description: "How important is this information (1-10)"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Keywords for easy retrieval"
        },
        expires_days: {
          type: "number",
          description: "Number of days after which this memory expires (optional)"
        }
      },
      required: ["content", "type", "importance"]
    }
  },
  {
    name: "search_memory",
    description: "Search stored memories for relevant information",
    parameters: {
      type: "object", 
      properties: {
        query: {
          type: "string",
          description: "Search term or question to find relevant memories"
        },
        type: {
          type: "string",
          enum: ["user_preference", "contact_info", "recurring_pattern", "future_reminder", "relationship", "location_preference", "context_note"],
          description: "Filter by memory type (optional)"
        },
        importance: {
          type: "number",
          minimum: 1,
          maximum: 10,
          description: "Minimum importance level (optional)"
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return (default: 5)"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "get_user_preferences",
    description: "Get user's stored preferences and context",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["meeting_preferences", "working_hours", "contact_preferences", "all"],
          description: "Category of preferences to retrieve (default: all)"
        }
      },
      required: []
    }
  },
  {
    name: "update_user_context",
    description: "Update user's working hours, timezone, or general preferences",
    parameters: {
      type: "object",
      properties: {
        working_hours_start: {
          type: "number",
          minimum: 0,
          maximum: 23,
          description: "Work day start hour (24-hour format)"
        },
        working_hours_end: {
          type: "number", 
          minimum: 0,
          maximum: 23,
          description: "Work day end hour (24-hour format)"
        },
        meeting_buffer: {
          type: "number",
          description: "Preferred minutes between meetings"
        },
        preferred_meeting_length: {
          type: "number",
          description: "Default meeting duration in minutes"
        },
        lunch_start: {
          type: "string",
          format: "time",
          description: "Lunch start time (HH:MM format)"
        },
        lunch_end: {
          type: "string", 
          format: "time",
          description: "Lunch end time (HH:MM format)"
        }
      },
      required: []
    }
  },
  {
    name: "select_from_list",
    description: "Select an option from a previously shown numbered list (like time slots)",
    parameters: {
      type: "object",
      properties: {
        selection_number: {
          type: "number",
          description: "The number of the option to select (1, 2, 3, etc.)"
        },
        list_type: {
          type: "string",
          enum: ["time_slots", "events", "people", "locations"],
          description: "What type of list was previously shown"
        },
        action: {
          type: "string", 
          enum: ["schedule", "book", "select", "choose", "delete"],
          description: "What action to perform on the selected item"
        }
      },
      required: ["selection_number", "list_type", "action"]
    }
  },
  {
    name: "check_conflicts",
    description: "Check for scheduling conflicts before creating an event",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Proposed event title"
        },
        start_time: {
          type: "string",
          format: "date-time",
          description: "Proposed start time"
        },
        end_time: {
          type: "string", 
          format: "date-time",
          description: "Proposed end time"
        },
        buffer_minutes: {
          type: "number",
          description: "Minutes of buffer to check before/after (default: 15)"
        }
      },
      required: ["title", "start_time", "end_time"]
    }
  }
];

export interface FunctionCall {
  name: string;
  arguments: Record<string, any>;
}

export interface FunctionResult {
  success: boolean;
  data?: any;
  error?: string;
}