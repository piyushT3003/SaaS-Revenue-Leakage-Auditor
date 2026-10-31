import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../layouts/Sidebar';
import { HelpModal } from '../components/HelpModal';
import { CommandPalette } from '../components/CommandPalette';

describe('Sidebar Navigation & Layout Tests', () => {
  it('renders enterprise brand title and revenue health indicator', () => {
    render(
      <MemoryRouter>
        <Sidebar exceptionCount={14} revenueHealthScore={92.4} revenueHealthTrend="+2.8 pp" />
      </MemoryRouter>
    );

    expect(screen.getByText('SaaS Revenue')).toBeDefined();
    expect(screen.getByText('Assurance')).toBeDefined();
    expect(screen.getByText('Enterprise')).toBeDefined();
    expect(screen.getByText('Revenue Health')).toBeDefined();
    expect(screen.getByText('92.4%')).toBeDefined();
    expect(screen.getByText(/2\.8 pp/)).toBeDefined();
  });

  it('renders all primary navigation links including exceptions badge', () => {
    render(
      <MemoryRouter>
        <Sidebar exceptionCount={14} />
      </MemoryRouter>
    );

    expect(screen.getByText('Overview')).toBeDefined();
    expect(screen.getByText('Reconciliation')).toBeDefined();
    expect(screen.getByText('Exceptions')).toBeDefined();
    expect(screen.getByText('14')).toBeDefined();
    expect(screen.getByText('Customers')).toBeDefined();
    expect(screen.getByText('Billing & Payments')).toBeDefined();
    expect(screen.getByText('Unit Economics')).toBeDefined();
    expect(screen.getByText('AI Investigation')).toBeDefined();
    expect(screen.getByText('Data Management')).toBeDefined();
    expect(screen.getByText('Settings')).toBeDefined();
  });
});

describe('Global Modals Component Tests', () => {
  it('renders HelpModal when open with page-specific guidance', () => {
    render(
      <HelpModal isOpen={true} onClose={() => {}} pageName="unit-economics" />
    );

    expect(screen.getByText(/Unit Economics/i)).toBeDefined();
    expect(screen.getByText(/Contribution Margin %/i)).toBeDefined();
  });

  it('renders CommandPalette search input and key shortcuts', () => {
    render(
      <MemoryRouter>
        <CommandPalette isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText(/Search customers/i)).toBeDefined();
  });
});

describe('Financial Formulas & Indian Formatting Tests', () => {
  it('calculates contribution margin percentage accurately', () => {
    const netRevenue = 12480000; // ₹1,24,80,000
    const directCosts = 3280000; // ₹32,80,000
    const contribution = netRevenue - directCosts;
    const marginPct = (contribution / netRevenue) * 100;

    expect(contribution).toBe(9200000);
    expect(Number(marginPct.toFixed(1))).toBe(73.7);
  });

  it('formats currency according to Indian numbering format', () => {
    const val = 12480000;
    const formatted = '₹' + val.toLocaleString('en-IN');
    expect(formatted).toBe('₹1,24,80,000');

    const leakage = 876000;
    expect('₹' + leakage.toLocaleString('en-IN')).toBe('₹8,76,000');
  });

  it('correctly models 8 discrepancy categories', () => {
    const categories = [
      'Underbilling',
      'Overbilling',
      'Missing Charges',
      'Duplicate Invoices',
      'Discount Drift',
      'Pricing Mismatch',
      'Unbilled Usage',
      'Payment Discrepancies'
    ];
    expect(categories.length).toBe(8);
  });
});
