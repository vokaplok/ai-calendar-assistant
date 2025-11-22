import { Injectable } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { MemoryService } from '../memory/memory.service';
import { FunctionCall, FunctionResult } from '../common/function-schemas';
import { MemoryType } from '../common/memory-types';

@Injectable()
export class CalendarOrchestratorService {
  constructor(
    private calendarService: CalendarService,
    private memoryService: MemoryService
  ) {}

  async executeFunction(functionCall: FunctionCall): Promise<FunctionResult> {
    try {
      console.log(`Executing function: ${functionCall.name}`, functionCall.arguments);

      switch (functionCall.name) {
        case 'list_events':
          return await this.handleListEvents(functionCall.arguments);
        
        case 'check_availability':
          return await this.handleCheckAvailability(functionCall.arguments);
        
        case 'create_event':
          return await this.handleCreateEvent(functionCall.arguments);
        
        case 'delete_events':
          return await this.handleDeleteEvents(functionCall.arguments);
        
        case 'find_free_slots':
          return await this.handleFindFreeSlots(functionCall.arguments);
        
        case 'analyze_schedule':
          return await this.handleAnalyzeSchedule(functionCall.arguments);
        
        case 'reschedule_events':
          return await this.handleRescheduleEvents(functionCall.arguments);
        
        case 'store_memory':
          return await this.handleStoreMemory(functionCall.arguments);
        
        case 'search_memory':
          return await this.handleSearchMemory(functionCall.arguments);
        
        case 'get_user_preferences':
          return await this.handleGetUserPreferences(functionCall.arguments);
        
        case 'update_user_context':
          return await this.handleUpdateUserContext(functionCall.arguments);
        
        case 'select_from_list':
          return await this.handleSelectFromList(functionCall.arguments);
        
        case 'check_conflicts':
          return await this.handleCheckConflicts(functionCall.arguments);
        
        default:
          return {
            success: false,
            error: `Unknown function: ${functionCall.name}`
          };
      }
    } catch (error) {
      console.error(`Error executing function ${functionCall.name}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async handleListEvents(args: any): Promise<FunctionResult> {
    const startDate = new Date(args.start_date);
    const endDate = new Date(args.end_date);
    const maxResults = args.max_results || 20;

    const events = await this.calendarService.listEvents(maxResults, startDate, endDate);
    
    const formattedEvents = events.map(event => ({
      id: event.id,
      title: event.summary,
      start: event.start?.dateTime,
      end: event.end?.dateTime,
      location: event.location,
      description: event.description
    }));

    return {
      success: true,
      data: {
        events: formattedEvents,
        count: formattedEvents.length,
        period: `${startDate.toDateString()} to ${endDate.toDateString()}`
      }
    };
  }

  private async handleCheckAvailability(args: any): Promise<FunctionResult> {
    const startTime = new Date(args.start_time);
    const endTime = new Date(args.end_time);

    const isAvailable = await this.calendarService.checkAvailability(startTime, endTime);
    const conflictingEvents = isAvailable ? [] : await this.calendarService.getEventsForTimeRange(startTime, endTime);

    return {
      success: true,
      data: {
        available: isAvailable,
        timeSlot: {
          start: startTime.toISOString(),
          end: endTime.toISOString()
        },
        conflicts: conflictingEvents.map(event => ({
          title: event.summary,
          start: event.start?.dateTime,
          end: event.end?.dateTime
        }))
      }
    };
  }

  private async handleCreateEvent(args: any): Promise<FunctionResult> {
    const event = {
      title: args.title,
      start: args.start_time,
      end: args.end_time,
      location: args.location,
      notes: args.description,
      confidence: 1.0
    };

    const createdEvent = await this.calendarService.createEvent(event);
    
    return {
      success: true,
      data: {
        event: {
          id: createdEvent.id,
          title: args.title,
          start: args.start_time,
          end: args.end_time,
          location: args.location
        }
      }
    };
  }

  private async handleDeleteEvents(args: any): Promise<FunctionResult> {
    const searchQuery = args.search_query.toLowerCase();
    const startDate = args.start_date ? new Date(args.start_date) : new Date('2020-01-01');
    const endDate = args.end_date ? new Date(args.end_date) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    // Get events in the date range
    const events = await this.calendarService.listEvents(100, startDate, endDate);
    
    // Find matching events
    const toDelete = events.filter(event => {
      const title = event.summary?.toLowerCase() || '';
      const description = event.description?.toLowerCase() || '';
      const location = event.location?.toLowerCase() || '';
      
      return title.includes(searchQuery) || 
             description.includes(searchQuery) || 
             location.includes(searchQuery);
    });

    // Delete the events
    const deletedEvents = [];
    const errors = [];

    for (const event of toDelete) {
      try {
        await this.calendarService.deleteEvent(event.id!);
        deletedEvents.push({
          title: event.summary,
          start: event.start?.dateTime,
          end: event.end?.dateTime
        });
      } catch (error) {
        errors.push(`Failed to delete "${event.summary}": ${error.message}`);
      }
    }

    return {
      success: true,
      data: {
        deleted: deletedEvents.length,
        events: deletedEvents,
        errors: errors
      }
    };
  }

  private async handleFindFreeSlots(args: any): Promise<FunctionResult> {
    const date = new Date(args.date);
    const durationMinutes = args.duration_minutes || 60;
    const earliestHour = args.earliest_hour || 9;
    const latestHour = args.latest_hour || 18;

    const freeSlots = await this.calendarService.findFreeSlots(
      date, 
      durationMinutes, 
      earliestHour, 
      latestHour
    );

    const slotsData = freeSlots.map((slot, index) => ({
      number: index + 1,
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      startTime: slot.start.toLocaleTimeString('en-US', {timeZone: 'Asia/Jerusalem'}),
      endTime: slot.end.toLocaleTimeString('en-US', {timeZone: 'Asia/Jerusalem'})
    }));

    // Store the slot list in conversation context for numbered selection
    await this.memoryService.storeMemory({
      content: `Recent time slot options for ${date.toDateString()}: ${slotsData.map(s => `${s.number}. ${s.startTime}-${s.endTime}`).join(', ')}`,
      type: MemoryType.CONVERSATION_CONTEXT,
      importance: 5,
      tags: ['time_slots', 'recent_options', date.toDateString()],
      context: {
        slots: slotsData,
        date: args.date,
        duration: durationMinutes,
        queryType: 'find_free_slots'
      },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // Expire in 1 hour
    }, 'default');

    return {
      success: true,
      data: {
        date: args.date,
        duration: durationMinutes,
        slots: slotsData,
        count: freeSlots.length
      }
    };
  }

  private async handleAnalyzeSchedule(args: any): Promise<FunctionResult> {
    const startDate = new Date(args.start_date);
    const endDate = new Date(args.end_date);
    const analysisType = args.analysis_type;

    const events = await this.calendarService.listEvents(200, startDate, endDate);

    switch (analysisType) {
      case 'summary':
        return {
          success: true,
          data: {
            totalEvents: events.length,
            period: `${startDate.toDateString()} to ${endDate.toDateString()}`,
            averagePerDay: (events.length / this.daysBetween(startDate, endDate)).toFixed(1),
            busiest_day: this.findBusiestDay(events),
            categories: this.categorizeEvents(events)
          }
        };

      case 'conflicts':
        return {
          success: true,
          data: {
            conflicts: await this.findConflicts(events),
            overlapCount: 0 // Simplified for now
          }
        };

      case 'free_time':
        const totalMinutes = this.daysBetween(startDate, endDate) * 8 * 60; // 8 work hours per day
        const busyMinutes = this.calculateBusyMinutes(events);
        return {
          success: true,
          data: {
            totalWorkMinutes: totalMinutes,
            busyMinutes: busyMinutes,
            freeMinutes: totalMinutes - busyMinutes,
            utilization: ((busyMinutes / totalMinutes) * 100).toFixed(1) + '%'
          }
        };

      default:
        return {
          success: true,
          data: { events: events.length, analysis: 'Basic analysis completed' }
        };
    }
  }

  private async handleRescheduleEvents(args: any): Promise<FunctionResult> {
    // This would implement rescheduling logic
    // For now, return a placeholder
    return {
      success: true,
      data: {
        message: 'Rescheduling functionality coming soon',
        searchQuery: args.search_query,
        newStartTime: args.new_start_time
      }
    };
  }

  // Helper methods
  private daysBetween(start: Date, end: Date): number {
    const timeDiff = end.getTime() - start.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
  }

  private findBusiestDay(events: any[]): string {
    const dayCount: { [key: string]: number } = {};
    
    events.forEach(event => {
      if (event.start?.dateTime) {
        const date = new Date(event.start.dateTime).toDateString();
        dayCount[date] = (dayCount[date] || 0) + 1;
      }
    });

    let busiestDay = '';
    let maxEvents = 0;
    
    for (const [day, count] of Object.entries(dayCount)) {
      if (count > maxEvents) {
        maxEvents = count;
        busiestDay = day;
      }
    }

    return `${busiestDay} (${maxEvents} events)`;
  }

  private categorizeEvents(events: any[]): { [category: string]: number } {
    const categories: { [key: string]: number } = {};
    
    events.forEach(event => {
      const title = event.summary?.toLowerCase() || '';
      let category = 'other';
      
      if (title.includes('meeting') || title.includes('call')) category = 'meetings';
      else if (title.includes('lunch') || title.includes('dinner') || title.includes('break')) category = 'meals';
      else if (title.includes('appointment') || title.includes('doctor') || title.includes('dentist')) category = 'appointments';
      else if (title.includes('workout') || title.includes('gym') || title.includes('exercise')) category = 'fitness';
      
      categories[category] = (categories[category] || 0) + 1;
    });

    return categories;
  }

  private async findConflicts(events: any[]): Promise<any[]> {
    const conflicts = [];
    
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const event1 = events[i];
        const event2 = events[j];
        
        if (event1.start?.dateTime && event1.end?.dateTime && 
            event2.start?.dateTime && event2.end?.dateTime) {
          
          const start1 = new Date(event1.start.dateTime);
          const end1 = new Date(event1.end.dateTime);
          const start2 = new Date(event2.start.dateTime);
          const end2 = new Date(event2.end.dateTime);
          
          // Check for overlap
          if (start1 < end2 && start2 < end1) {
            conflicts.push({
              event1: { title: event1.summary, start: event1.start.dateTime, end: event1.end.dateTime },
              event2: { title: event2.summary, start: event2.start.dateTime, end: event2.end.dateTime }
            });
          }
        }
      }
    }
    
    return conflicts;
  }

  private calculateBusyMinutes(events: any[]): number {
    let totalMinutes = 0;
    
    events.forEach(event => {
      if (event.start?.dateTime && event.end?.dateTime) {
        const start = new Date(event.start.dateTime);
        const end = new Date(event.end.dateTime);
        const duration = (end.getTime() - start.getTime()) / (1000 * 60);
        totalMinutes += duration;
      }
    });
    
    return totalMinutes;
  }

  // Memory handlers
  private async handleStoreMemory(args: any): Promise<FunctionResult> {
    const { content, type, importance, tags, expires_days } = args;
    
    const memoryType = this.mapStringToMemoryType(type);
    const expiresAt = expires_days ? new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000) : undefined;

    await this.memoryService.storeMemory({
      content,
      type: memoryType,
      importance: importance || 5,
      tags: tags || [type],
      context: {},
      expiresAt
    }, 'default');

    return {
      success: true,
      data: {
        message: `Stored memory: ${content}`,
        type: memoryType,
        importance
      }
    };
  }

  private async handleSearchMemory(args: any): Promise<FunctionResult> {
    const { query, type, importance, max_results } = args;

    const searchResult = await this.memoryService.searchMemories({
      query,
      type: type ? this.mapStringToMemoryType(type) : undefined,
      importance,
      maxResults: max_results || 5
    }, 'default');

    return {
      success: true,
      data: {
        memories: searchResult.entries.map(entry => ({
          content: entry.content,
          type: entry.type,
          importance: entry.importance,
          tags: entry.tags,
          createdAt: entry.createdAt
        })),
        totalFound: searchResult.totalFound,
        relevanceScores: searchResult.relevanceScores
      }
    };
  }

  private async handleGetUserPreferences(args: any): Promise<FunctionResult> {
    const { category } = args;
    
    const userContext = this.memoryService.getUserContext('default');
    let preferences: any = {};

    if (!category || category === 'all' || category === 'working_hours') {
      preferences.workingHours = userContext.workingHours;
      preferences.timezone = userContext.timezone;
    }

    if (!category || category === 'all' || category === 'meeting_preferences') {
      preferences.meetingPreferences = userContext.preferences;
    }

    // Get stored preference memories
    const preferenceMemories = await this.memoryService.getMemoriesByType(MemoryType.USER_PREFERENCE, 'default');
    preferences.storedPreferences = preferenceMemories.map(m => ({
      content: m.content,
      importance: m.importance,
      tags: m.tags
    }));

    return {
      success: true,
      data: preferences
    };
  }

  private async handleUpdateUserContext(args: any): Promise<FunctionResult> {
    const { 
      working_hours_start, 
      working_hours_end, 
      meeting_buffer, 
      preferred_meeting_length,
      lunch_start,
      lunch_end 
    } = args;

    const updates: any = {};

    if (working_hours_start !== undefined || working_hours_end !== undefined) {
      updates.workingHours = {};
      if (working_hours_start !== undefined) updates.workingHours.start = working_hours_start;
      if (working_hours_end !== undefined) updates.workingHours.end = working_hours_end;
    }

    if (meeting_buffer !== undefined || preferred_meeting_length !== undefined || lunch_start !== undefined || lunch_end !== undefined) {
      updates.preferences = {};
      if (meeting_buffer !== undefined) updates.preferences.meetingBuffer = meeting_buffer;
      if (preferred_meeting_length !== undefined) updates.preferences.preferredMeetingLength = preferred_meeting_length;
      if (lunch_start || lunch_end) {
        updates.preferences.lunchTime = {};
        if (lunch_start) updates.preferences.lunchTime.start = lunch_start;
        if (lunch_end) updates.preferences.lunchTime.end = lunch_end;
      }
    }

    this.memoryService.updateUserContext('default', updates);

    return {
      success: true,
      data: {
        message: 'User context updated successfully',
        updates
      }
    };
  }

  private async handleSelectFromList(args: any): Promise<FunctionResult> {
    const { selection_number, list_type, action } = args;

    // Search for recent conversation context that contains numbered lists
    const searchResult = await this.memoryService.searchMemories({
      query: list_type,
      type: MemoryType.CONVERSATION_CONTEXT,
      maxResults: 1
    }, 'default');

    if (searchResult.entries.length === 0) {
      return {
        success: false,
        error: "No recent numbered list found. Please request a new list of options."
      };
    }

    const contextMemory = searchResult.entries[0];
    const slots = contextMemory.context.slots;

    if (!slots || !Array.isArray(slots)) {
      return {
        success: false,
        error: "Invalid list data found."
      };
    }

    const selectedSlot = slots.find(slot => slot.number === selection_number);
    
    if (!selectedSlot) {
      return {
        success: false,
        error: `Option ${selection_number} not found. Available options: ${slots.map(s => s.number).join(', ')}`
      };
    }

    // Perform the requested action
    if (action === 'schedule' || action === 'book') {
      // Create an event for the selected slot
      const event = {
        title: 'Meeting', // Default title, can be enhanced
        start: selectedSlot.start,
        end: selectedSlot.end,
        notes: `Booked via slot selection #${selection_number}`,
        confidence: 1.0
      };

      try {
        const createdEvent = await this.calendarService.createEvent(event);
        
        return {
          success: true,
          data: {
            message: `Successfully booked slot #${selection_number}`,
            selected_slot: selectedSlot,
            event: {
              id: createdEvent.id,
              title: event.title,
              start: selectedSlot.start,
              end: selectedSlot.end
            }
          }
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to create event: ${error.message}`
        };
      }
    }

    return {
      success: true,
      data: {
        message: `Selected option #${selection_number}`,
        selected_slot: selectedSlot,
        action: action
      }
    };
  }

  private async handleCheckConflicts(args: any): Promise<FunctionResult> {
    const { title, start_time, end_time, buffer_minutes = 15 } = args;

    const proposedStart = new Date(start_time);
    const proposedEnd = new Date(end_time);
    
    // Extend the check window with buffer time
    const checkStart = new Date(proposedStart.getTime() - buffer_minutes * 60 * 1000);
    const checkEnd = new Date(proposedEnd.getTime() + buffer_minutes * 60 * 1000);

    const conflicts = await this.calendarService.getEventsForTimeRange(checkStart, checkEnd);
    
    const directConflicts = conflicts.filter(event => {
      const eventStart = new Date(event.start!.dateTime!);
      const eventEnd = new Date(event.end!.dateTime!);
      
      // Direct overlap with proposed event (no buffer)
      return proposedStart < eventEnd && proposedEnd > eventStart;
    });

    const bufferConflicts = conflicts.filter(event => {
      const eventStart = new Date(event.start!.dateTime!);
      const eventEnd = new Date(event.end!.dateTime!);
      
      // Within buffer zone but not direct overlap
      return (checkStart < eventEnd && checkEnd > eventStart) && 
             !(proposedStart < eventEnd && proposedEnd > eventStart);
    });

    const hasDirectConflict = directConflicts.length > 0;
    const hasBufferConflict = bufferConflicts.length > 0;

    return {
      success: true,
      data: {
        proposed_event: {
          title,
          start: start_time,
          end: end_time
        },
        has_direct_conflict: hasDirectConflict,
        has_buffer_conflict: hasBufferConflict,
        direct_conflicts: directConflicts.map(event => ({
          title: event.summary,
          start: event.start?.dateTime,
          end: event.end?.dateTime
        })),
        buffer_conflicts: bufferConflicts.map(event => ({
          title: event.summary, 
          start: event.start?.dateTime,
          end: event.end?.dateTime
        })),
        recommendation: hasDirectConflict 
          ? 'conflict' 
          : hasBufferConflict 
            ? 'warning' 
            : 'clear'
      }
    };
  }

  private mapStringToMemoryType(typeString: string): MemoryType {
    switch (typeString) {
      case 'user_preference': return MemoryType.USER_PREFERENCE;
      case 'contact_info': return MemoryType.CONTACT_INFO;
      case 'recurring_pattern': return MemoryType.RECURRING_PATTERN;
      case 'future_reminder': return MemoryType.FUTURE_REMINDER;
      case 'relationship': return MemoryType.RELATIONSHIP;
      case 'location_preference': return MemoryType.LOCATION_PREFERENCE;
      case 'context_note': return MemoryType.CONTEXT_NOTE;
      case 'conversation_context': return MemoryType.CONVERSATION_CONTEXT;
      default: return MemoryType.CONTEXT_NOTE;
    }
  }
}