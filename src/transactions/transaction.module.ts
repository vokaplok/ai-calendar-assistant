import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TransactionSyncService } from './transaction-sync.service';
import { TransactionController } from './transaction.controller';
import { GoogleSheetClient } from './google-sheet.client';
import { BrexParser } from './parsers/brex.parser';
import { StripeParser } from './parsers/stripe.parser';

@Module({
  imports: [ConfigModule],
  controllers: [TransactionController],
  providers: [
    TransactionSyncService,
    GoogleSheetClient,
    BrexParser,
    StripeParser,
  ],
  exports: [TransactionSyncService],
})
export class TransactionModule {}