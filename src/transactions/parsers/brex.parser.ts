import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BaseParser, Transaction } from './base.parser';

@Injectable()
export class BrexParser extends BaseParser {
  private apiKey: string;
  private baseUrl: string = 'https://platform.brexapis.com';

  constructor(config: ConfigService) {
    super(config);
    this.apiKey = this.config.get<string>('BREX_API_KEY') || '';
  }

  /**
   * Test Brex API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        console.log('❌ Brex: API key not configured');
        return false;
      }

      // Try different Brex API endpoints to find working one
      // First try to get user info which is usually accessible with basic permissions
      const response = await axios.get(`${this.baseUrl}/v1/companies`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      console.log(`✅ Brex: Connected to company ${response.data.legal_name || 'Unknown'}`);
      return true;
    } catch (error) {
      console.log(`❌ Brex: ${error.response?.data?.message || error.message}`);
      return false;
    }
  }

  /**
   * Fetch transactions from Brex
   */
  async fetchTransactions(): Promise<Transaction[]> {
    if (!this.apiKey) {
      throw new Error('Brex API key not configured');
    }

    console.log('📡 Fetching accounts from Brex...');
    
    // First get all accounts
    const accountsResponse = await axios.get(`${this.baseUrl}/v2/accounts`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    const accounts = accountsResponse.data.items || [];
    console.log(`📥 Found ${accounts.length} Brex accounts`);

    const allTransactions: Transaction[] = [];

    // Fetch transactions for each account
    for (const account of accounts) {
      console.log(`📡 Fetching transactions for account ${account.name}...`);
      
      try {
        const transactionsResponse = await axios.get(`${this.baseUrl}/v2/transactions/card`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
          params: {
            account_id: account.id,
            limit: 100, // Adjust as needed
          },
        });

        const transactions = transactionsResponse.data.items || [];
        console.log(`📥 Found ${transactions.length} transactions for ${account.name}`);

        for (const tx of transactions) {
          // Create unique ID by combining account name, date, amount and merchant info
          const uniqueId = `brex_${account.name.toLowerCase().replace(/\s+/g, '_')}_${tx.initiated_at_date}_${Math.abs(tx.amount.amount)}_${tx.id.slice(-8)}`;
          
          allTransactions.push({
            id: uniqueId,
            date: this.formatDate(tx.initiated_at_date),
            amount: Math.abs(tx.amount.amount / 100), // Convert from cents
            currency: tx.amount.currency,
            description: this.cleanDescription(tx.merchant.raw_descriptor || tx.description || 'Brex transaction'),
            type: tx.amount.amount < 0 ? 'expense' : 'income',
            category: tx.merchant.mcc_code || 'Business Expense',
            account: account.name,
            reference: tx.id
          });
        }
      } catch (error) {
        console.log(`⚠️  Failed to fetch transactions for account ${account.name}: ${error.message}`);
      }
    }

    console.log(`✅ Processed ${allTransactions.length} Brex transactions`);
    return allTransactions;
  }
}