import { Module } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { TelegramService } from './telegram.service';

@Module({
  providers: [MonitorService, TelegramService],
})
export class MonitorModule {}