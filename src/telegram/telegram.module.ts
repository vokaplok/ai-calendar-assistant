import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { LlmModule } from '../llm/llm.module';
import { CalendarModule } from '../calendar/calendar.module';
import { MemoryModule } from '../memory/memory.module';
import { TransactionModule } from '../transactions/transaction.module';

@Module({
  imports: [LlmModule, CalendarModule, MemoryModule, TransactionModule],
  providers: [TelegramService],
  controllers: [TelegramController],
})
export class TelegramModule {}