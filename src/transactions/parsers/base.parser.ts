import { ConfigService } from '@nestjs/config';

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  currency: string;
  description: string;
  type: 'income' | 'expense';
  category?: string;
  account?: string;
  reference?: string;
}

export abstract class BaseParser {
  protected config: ConfigService;

  constructor(config: ConfigService) {
    this.config = config;
  }

  /**
   * Fetch transactions from the API
   */
  abstract fetchTransactions(): Promise<Transaction[]>;

  /**
   * Test connection to the API
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Format date to ISO string
   */
  protected formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().split('T')[0];
  }

  /**
   * Format amount to number (handle cents/currency conversion)
   */
  protected formatAmount(amount: number, currency: string = 'USD'): number {
    // Stripe amounts are in cents, convert to dollars
    if (currency === 'USD' || currency === 'EUR') {
      return amount / 100;
    }
    return amount;
  }

  /**
   * Clean description text
   */
  protected cleanDescription(description: string): string {
    if (!description) return '';
    return description.trim().replace(/\s+/g, ' ');
  }
}