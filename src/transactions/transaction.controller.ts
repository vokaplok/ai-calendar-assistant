import { Controller, Post, Get } from '@nestjs/common';
import { TransactionSyncService } from './transaction-sync.service';
import { GoogleSheetClient } from './google-sheet.client';

@Controller('transactions')
export class TransactionController {
  constructor(
    private readonly transactionSyncService: TransactionSyncService,
    private readonly googleSheetClient: GoogleSheetClient
  ) {}

  @Post('test-connections')
  async testConnections() {
    const result = await this.transactionSyncService.testConnections();
    return { success: result };
  }

  @Post('sync')
  async sync() {
    try {
      const results = await this.transactionSyncService.syncAll();
      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Post('sync/brex')
  async syncBrex() {
    try {
      const results = await this.transactionSyncService.syncAll(['brex']);
      const summary = this.transactionSyncService.printSummary(results);
      return { 
        success: true, 
        results,
        summary: {
          totalNew: results[0]?.new || 0,
          totalProcessed: results[0]?.total || 0,
          message: `Added ${results[0]?.new || 0} new Brex transactions`
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Post('sync/stripe')
  async syncStripe() {
    try {
      const results = await this.transactionSyncService.syncAll(['stripe']);
      return { 
        success: true, 
        results,
        summary: {
          totalNew: results[0]?.new || 0,
          totalProcessed: results[0]?.total || 0,
          message: `Added ${results[0]?.new || 0} new Stripe transactions`
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Get('check-brex-sheet')
  async checkBrexSheet() {
    try {
      await this.googleSheetClient.initialize();
      const structure = await this.googleSheetClient.getSheetStructure('Auto_input.Brex');
      return { success: true, structure: structure?.slice(-10) }; // Last 10 rows
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Get('debug-brex')
  async debugBrex() {
    try {
      const transactions = await this.transactionSyncService.debugBrexTransactions();
      return { success: true, transactions };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}