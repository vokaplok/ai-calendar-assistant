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
        date: this.formatDate(new Date(charge.created * 1000)),
        amount: this.formatAmount(charge.amount, charge.currency.toUpperCase()),
        currency: charge.currency.toUpperCase(),
        description: this.cleanDescription(charge.description || 'Stripe charge'),
        type: 'income', // Stripe charges are typically income
        category: 'Payment Processing',
        account: 'Stripe',
        reference: charge.receipt_url || ''
      });
    }

    // Also fetch payouts
    console.log('📡 Fetching payouts from Stripe...');
    
    const payouts = await this.stripe.payouts.list({
      limit: 100,
    });

    console.log(`📥 Found ${payouts.data.length} payouts`);

    for (const payout of payouts.data) {
      transactions.push({
        id: `payout_${payout.id}`,
        date: this.formatDate(new Date(payout.created * 1000)),
        amount: -this.formatAmount(payout.amount, payout.currency.toUpperCase()), // Negative for payout
        currency: payout.currency.toUpperCase(),
        description: `Stripe payout - ${payout.description || 'Automatic'}`,
        type: 'expense', // Payouts are expenses
        category: 'Bank Transfer',
        account: 'Stripe',
        reference: payout.id
      });
    }

    console.log(`✅ Processed ${transactions.length} Stripe transactions`);
    return transactions;
  }
}