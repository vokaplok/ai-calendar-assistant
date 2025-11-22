import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BaseParser, Transaction } from './base.parser';

@Injectable()
export class PrivatBankParser extends BaseParser {
  private apiToken: string;
  private merchantId: string;
  private baseUrl: string = 'https://acp.privatbank.ua/api';

  constructor(config: ConfigService) {
    super(config);
    this.apiToken = this.config.get<string>('PRIVATBANK_API_TOKEN') || '';
    this.merchantId = this.config.get<string>('PRIVATBANK_MERCHANT_ID') || '';
  }

  /**
   * Test PrivatBank API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.apiToken || !this.merchantId) {
        console.log('❌ PrivatBank: API token or merchant ID not configured');
        return false;
      }

      // Test with a simple balance request
      const response = await axios.post(`${this.apiToken}/balance`, {
        merchant: this.merchantId,
        token: this.apiToken,
      });

      if (response.data.state === 'ok') {
        console.log('✅ PrivatBank: Connected successfully');
        return true;
      } else {
        console.log(`❌ PrivatBank: ${response.data.message || 'Connection failed'}`);
        return false;
      }
    } catch (error) {
      console.log(`❌ PrivatBank: ${error.response?.data?.message || error.message}`);
      return false;
    }
  }

  /**
   * Fetch transactions from PrivatBank
   */
  async fetchTransactions(): Promise<Transaction[]> {
    if (!this.apiToken || !this.merchantId) {
      throw new Error('PrivatBank API token or merchant ID not configured');
    }

    console.log('📡 Fetching transactions from PrivatBank...');

    // Get transactions for the last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const response = await axios.post(`${this.apiToken}/statements`, {
      merchant: this.merchantId,
      token: this.apiToken,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    });

    if (response.data.state !== 'ok') {
      throw new Error(`PrivatBank API error: ${response.data.message}`);
    }

    const transactions = response.data.transactions || [];
    console.log(`📥 Found ${transactions.length} PrivatBank transactions`);

    const formattedTransactions: Transaction[] = transactions.map((tx: any) => ({
      id: tx.id || `pb_${tx.date}_${tx.amount}`,
      date: this.formatDate(tx.date),
      amount: Math.abs(parseFloat(tx.amount)),
      currency: tx.currency || 'UAH',
      description: this.cleanDescription(tx.description || tx.purpose || 'PrivatBank transaction'),
      type: parseFloat(tx.amount) >= 0 ? 'income' : 'expense',
      category: this.categorizeTransaction(tx.description || tx.purpose || ''),
      account: 'PrivatBank',
      reference: tx.reference || tx.id || ''
    }));

    console.log(`✅ Processed ${formattedTransactions.length} PrivatBank transactions`);
    return formattedTransactions;
  }

  /**
   * Simple categorization based on transaction description
   */
  private categorizeTransaction(description: string): string {
    const desc = description.toLowerCase();
    
    if (desc.includes('зарплата') || desc.includes('salary')) {
      return 'Salary';
    } else if (desc.includes('комунальні') || desc.includes('utility')) {
      return 'Utilities';
    } else if (desc.includes('продукти') || desc.includes('grocery')) {
      return 'Groceries';
    } else if (desc.includes('транспорт') || desc.includes('transport')) {
      return 'Transport';
    } else if (desc.includes('ресторан') || desc.includes('кафе') || desc.includes('restaurant')) {
      return 'Dining';
    } else {
      return 'Other';
    }
  }
}