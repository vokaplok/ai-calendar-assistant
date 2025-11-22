import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { BaseParser, Transaction } from './base.parser';

@Injectable()
export class StripeParser extends BaseParser {
  private stripe: Stripe;

  constructor(config: ConfigService) {
    super(config);
    const apiKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (apiKey) {
      this.stripe = new Stripe(apiKey, { apiVersion: '2023-10-16' });
    }
  }

  /**
   * Format date with time for Stripe (like existing format: 2023-07-27 09:29:13)
   */
  private formatDateWithTime(date: Date): string {
    return date.toISOString().replace('T', ' ').slice(0, 19);
  }

  /**
   * Test Stripe API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.stripe) {
        console.log('❌ Stripe: API key not configured');
        return false;
      }

      const account = await this.stripe.accounts.retrieve();
      console.log(`✅ Stripe: Connected to account ${account.id}`);
      return true;
    } catch (error) {
      console.log(`❌ Stripe: ${error.message}`);
      return false;
    }
  }

  /**
   * Fetch transactions from Stripe
   */
  async fetchTransactions(): Promise<Transaction[]> {
    if (!this.stripe) {
      throw new Error('Stripe API key not configured');
    }

    console.log('📡 Fetching charges from Stripe...');
    
    const charges = await this.stripe.charges.list({
      limit: 100, // Adjust as needed
    });

    console.log(`📥 Found ${charges.data.length} charges`);

    const transactions: Transaction[] = [];

    for (const charge of charges.data) {
      transactions.push({
        id: charge.id,
        date: this.formatDateWithTime(new Date(charge.created * 1000)),
        amount: this.formatAmount(charge.amount, charge.currency.toUpperCase()),
        currency: charge.currency.toUpperCase(),
        description: this.cleanDescription(charge.description || 'Subscription creation'),
        type: 'income', // Stripe charges are typically income
        category: 'Payment Processing',
        account: 'Stripe',
        reference: charge.receipt_url || '',
        // Store additional Stripe-specific data for proper mapping
        stripeData: {
          fee: charge.application_fee_amount ? (charge.application_fee_amount / 100).toFixed(2) : '0.33',
          status: charge.status === 'succeeded' ? 'Paid' : charge.status,
          cardId: charge.payment_method || '',
          customerId: typeof charge.customer === 'string' ? charge.customer : '',
          customerEmail: charge.billing_details?.email || 'api_parser@generect.com',
          invoiceId: typeof charge.invoice === 'string' ? charge.invoice : '',
          captured: charge.captured ? 'TRUE' : 'FALSE'
        }
      });
    }

    // Skip payouts due to permission restrictions
    console.log('📊 Skipping payouts (requires additional permissions)');
    
    // TODO: Enable payouts when 'rak_payout_read' permission is granted

    console.log(`✅ Processed ${transactions.length} Stripe transactions`);
    return transactions;
  }
}