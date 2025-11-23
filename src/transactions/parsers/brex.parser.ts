import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BaseParser, Transaction } from './base.parser';

interface BrexTransaction {
  id: string;
  date: string;
  amount: number;
  currency: string;
  description: string;
  memo?: string;
  external_memo?: string;
  initiated_by?: string;
  payment_method?: string;
  status?: string;
  type?: 'income' | 'expense';
}

@Injectable()
export class BrexParser extends BaseParser {
  private apiKey: string;
  private baseUrl: string = 'https://platform.brexapis.com';

  constructor(config: ConfigService) {
    super(config);
    this.apiKey = this.config.get<string>('BREX_API_KEY') || '';
    console.log(`🔑 Brex API Key configured: ${this.apiKey ? 'YES' : 'NO'}`);
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        console.log('❌ Brex: API key not configured');
        return false;
      }

      console.log('🔗 Testing Brex API with card transactions endpoint');

      // Test the card transactions endpoint that we know works
      const response = await axios.get(`${this.baseUrl}/v2/transactions/card/primary`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        params: {
          limit: 1, // Just fetch 1 transaction to test
        },
        timeout: 10000
      });

      const transactionCount = response.data.items?.length || 0;
      console.log(`✅ Brex: Connected successfully, found ${transactionCount} recent card transaction(s)`);
      return true;
    } catch (error) {
      console.log(`❌ Brex: ${error.response?.status} - ${error.response?.data?.message || error.message || 'Connection failed'}`);
      if (error.response?.data) {
        console.log('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      return false;
    }
  }

  async fetchTransactions(): Promise<Transaction[]> {
    if (!this.apiKey) {
      throw new Error('Brex API key not configured');
    }

    console.log('📡 Fetching transactions from Brex...');
    
    const allTransactions: Transaction[] = [];
    
    // Try multiple endpoints for cash transactions
    const cashEndpoints = [
      '/v2/transactions/cash/primary',
      '/v2/transactions/cash',
      '/v1/transfers'
    ];
    
    let cashTransactionsFound = false;
    
    for (const endpoint of cashEndpoints) {
      try {
        console.log(`📡 Trying cash endpoint: ${endpoint}`);
        const cashResponse = await axios.get(`${this.baseUrl}${endpoint}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
          params: {
            limit: 100,
          },
          timeout: 15000
        });

        const cashTransactions = cashResponse.data.items || cashResponse.data || [];
        console.log(`✅ Found ${cashTransactions.length} cash/transfer transactions via ${endpoint}`);

        if (cashTransactions.length > 0) {
          for (const tx of cashTransactions) {
            // Skip failed or cancelled transactions
            if (tx.status === 'FAILED' || tx.status === 'CANCELLED') {
              console.log(`⏭️ Skipping ${tx.status} transaction: ${tx.id}`);
              continue;
            }
            // Different date fields for different endpoints
            let dateField;
            if (endpoint.includes('transfers')) {
              // Try all possible date fields for transfers
              dateField = tx.process_date || tx.created_at || tx.updated_at || 
                         tx.posted_at || tx.initiated_at || tx.completed_at ||
                         tx.processed_at || tx.settlement_date;
            } else {
              dateField = tx.posted_at_date || tx.initiated_at_date || tx.created_at;
            }
            
            const date = new Date(dateField);
            
            // Debug date parsing
            if (!dateField) {
              console.log(`❌ No date field found for transaction ${tx.id}.`);
              console.log(`Available fields:`, Object.keys(tx));
              console.log(`Full transaction:`, JSON.stringify(tx, null, 2));
              continue;
            }
            
            if (isNaN(date.getTime())) {
              console.log(`❌ Invalid date "${dateField}" for transaction ${tx.id}`);
              console.log(`   Full transaction:`, JSON.stringify(tx, null, 2).substring(0, 500));
              continue;
            }

            let amount, isExpense, description, memo, paymentMethod;

            if (endpoint.includes('transfers')) {
              // Handle transfers endpoint
              amount = Math.abs(tx.amount?.amount ? tx.amount.amount / 100 : 0);
              // For transfers, negative amount typically means income (money coming in)
              isExpense = (tx.amount?.amount || 0) > 0;
              
              // Different logic for client-initiated vs system-initiated transfers
              const isClientInitiated = tx.initiator_type === 'USER' || tx.creator_user_id;
              
              if (isClientInitiated) {
                // For client-initiated: To/From = recipient, memo = null, externalMemo = external_memo
                description = tx.display_name || tx.description || 'Transfer';
                memo = ''; // Keep memo empty for client-initiated
              } else {
                // For system-initiated: keep current logic
                description = tx.display_name || tx.description || 'Transfer';
                memo = tx.external_memo || tx.memo || '';
              }
              
              paymentMethod = tx.payment_type === 'ACH' ? 'ACH' : 
                             tx.payment_type === 'WIRE' ? 'Wire' : 
                             tx.payment_type === 'INTERNATIONAL_WIRE' ? 'Wire' : 
                             tx.payment_type === 'BILL_PAY' ? 'Bill Pay' : 'ACH/Wire';
            } else {
              // Handle cash transactions endpoint
              amount = Math.abs(tx.amount.amount / 100);
              isExpense = tx.amount.amount > 0;
              description = tx.counterparty?.name || tx.description || 'Cash Transaction';
              memo = tx.external_memo || tx.memo || '';
              paymentMethod = tx.payment_type === 'ACH' ? 'ACH' : 
                             tx.payment_type === 'WIRE' ? 'Wire' : 
                             tx.payment_type === 'INTERNATIONAL_WIRE' ? 'Wire' : 'ACH/Wire';
            }

            if (amount === 0) continue; // Skip zero amounts
            
            // Skip "Payment – Thank you!" transactions
            if (description.match(/Payment\s*[–-]\s*Thank\s*you!/gi)) {
              console.log(`⚠️ Skipping "Payment - Thank you!" transaction: ${description}`);
              continue;
            }

            const transaction = {
              id: `brex_${endpoint.includes('transfers') ? 'transfer' : 'cash'}_${tx.id}`,
              date: date,
              amount: amount,
              currency: tx.amount?.currency || 'USD',
              description: this.cleanDescription(description),
              type: isExpense ? 'expense' as const : 'income' as const,
              category: endpoint.includes('transfers') ? 'Transfer' : 'Cash Transaction',
              account: 'Brex',
              reference: tx.id || '',
              memo: memo,
              externalMemo: tx.external_memo || '',
              initiatedBy: tx.initiator_type === 'USER' || tx.creator_user_id ? 'Client' : 'Brex',
              paymentMethod: paymentMethod,
              status: tx.status || 'Finalized',
              brexData: {
                originalId: tx.id,
                type: endpoint.includes('transfers') ? 'transfer' : 'cash',
                paymentType: tx.payment_type
              }
            };
            
            console.log(`➕ Adding ${endpoint.includes('transfers') ? 'transfer' : 'cash'} transaction: ${date.toLocaleDateString()} - ${description} - ${transaction.type} ${amount}`);
            allTransactions.push(transaction);
          }
          
          cashTransactionsFound = true;
          console.log(`✅ Successfully processed ${cashTransactions.length} transactions from ${endpoint}`);
          break; // Stop trying other endpoints if this one worked
        }
      } catch (error) {
        console.log(`⚠️ Endpoint ${endpoint} failed: ${error.response?.status || error.message}`);
        continue; // Try next endpoint
      }
    }
    
    if (!cashTransactionsFound) {
      console.log(`ℹ️ No cash/transfer transactions available from any endpoint`);
    }

    try {
      // Fetch card transactions
      console.log('📡 Fetching card transactions...');
      const cardResponse = await axios.get(`${this.baseUrl}/v2/transactions/card/primary`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        params: {
          limit: 100,
        },
        timeout: 15000
      });

      const cardTransactions = cardResponse.data.items || [];
      console.log(`✅ Found ${cardTransactions.length} card transactions`);

      for (const tx of cardTransactions) {
        const dateField = tx.posted_at_date || tx.purchased_at || tx.created_at;
        const date = new Date(dateField);
        
        // Debug date parsing for card transactions
        if (!dateField) {
          console.log(`❌ No date field found for card transaction ${tx.id}. Available fields:`, Object.keys(tx));
          continue;
        }
        
        if (isNaN(date.getTime())) {
          console.log(`❌ Invalid date "${dateField}" for card transaction ${tx.id}`);
          console.log(`   Full transaction:`, JSON.stringify(tx, null, 2).substring(0, 500));
          continue;
        }

        const amount = Math.abs(tx.amount.amount / 100);
        
        // Get merchant name
        let description = tx.merchant?.raw_descriptor || 
                         tx.merchant?.name || 
                         tx.description || 
                         'Card Transaction';

        // If memo exists, use as description priority
        if (tx.memo) {
          description = tx.memo;
        }
        
        // Skip "Payment – Thank you!" transactions
        if (description.match(/Payment\s*[–-]\s*Thank\s*you!/gi)) {
          console.log(`⚠️ Skipping "Payment - Thank you!" card transaction: ${description}`);
          continue;
        }

        const transaction = {
          id: `brex_card_${tx.id}`,
          date: date,
          amount: amount,
          currency: tx.amount.currency || 'USD',
          description: this.cleanDescription(description),
          type: 'expense' as const, // Card transactions are always expenses
          category: 'Card Transaction',
          account: 'Brex Card',
          reference: tx.id || '',
          memo: tx.external_memo || tx.memo || '',
          externalMemo: tx.external_memo || '',
          initiatedBy: 'Brex',
          paymentMethod: 'Card',
          status: tx.status || 'Finalized',
          brexData: {
            originalId: tx.id,
            type: 'card',
            merchantName: tx.merchant?.name,
            originalDescription: tx.description || '' // Store original short description
          }
        };
        
        console.log(`➕ Adding card transaction: ${date.toLocaleDateString()} - ${description} - ${transaction.type} ${amount}`);
        allTransactions.push(transaction);
      }
    } catch (error) {
      console.log(`⚠️ Failed to fetch card transactions: ${error.message}`);
    }

    // Sort transactions by date (oldest first for correct order in sheet)
    allTransactions.sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    console.log(`✅ Processed ${allTransactions.length} Brex transactions total`);
    return allTransactions;
  }

  /**
   * Create unique identifier for Brex transaction for deduplication
   */
  createUniqueKey(transaction: Transaction): string {
    // Format date as dd/mm/yy
    const dateObj = new Date(transaction.date);
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = String(dateObj.getFullYear()).slice(-2);
    const formattedDate = `${day}/${month}/${year}`;
    
    // Use original Brex ID if available
    if (transaction.brexData?.originalId) {
      return transaction.brexData.originalId;
    }
    
    // Otherwise use date + amount + memo as fallback
    const amountStr = transaction.amount.toFixed(2);
    return `${formattedDate}_${amountStr}_${transaction.memo || ''}`;
  }
}