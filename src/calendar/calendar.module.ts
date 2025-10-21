import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { CalendarOrchestratorService } from './calendar-orchestrator.service';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [MemoryModule],
  providers: [CalendarService, CalendarOrchestratorService],
  controllers: [CalendarController],
  exports: [CalendarService, CalendarOrchestratorService],
})
export class CalendarModule {}