import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from './telegram/telegram.module';
import { CalendarModule } from './calendar/calendar.module';
import { LlmModule } from './llm/llm.module';
import { TransactionModule } from './transactions/transaction.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TelegramModule,
    CalendarModule,
    LlmModule,
    TransactionModule,
  ],
})
export class AppModule {}