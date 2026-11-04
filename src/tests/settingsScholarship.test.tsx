/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsView, formatBdWhatsAppNumber } from '../views/SettingsView';
import { StudentsView } from '../views/StudentsView';
import * as context from '../store/context';
import * as firebaseServices from '../services/firebase';

const mockPricing = {
  monthlyPriceBdt: 99,
  yearlyPriceBdt: 999,
  freeStudentLimit: 5,
  promoText: '⚡ Flash Sale: 100% Free Pro Scholarship Available!',
  promoCodes: [
    {
      code: 'FREE100',
      discountType: 'percent' as const,
      discountValue: 100,
      discountPercent: 100,
      active: true,
      usedCount: 0,
    },
    {
      code: 'FLAT100',
      discountType: 'flat' as const,
      discountValue: 100,
      discountPercent: 100,
      active: true,
      usedCount: 0,
    },
  ],
  bkashNumber: '01711111111',
  nagadNumber: '01722222222',
  rocketNumber: '01733333333',
  supportWhatsapp: '01700000000',
  supportEmail: 'support@tuitrix.com',
  updatedAt: Date.now(),
};

vi.mock('../services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/firebase')>();
  return {
    ...actual,
    db: null,
    auth: {
      currentUser: {
        uid: 'tutor_scholarship_user',
        email: 'scholarship@tutor.com',
        displayName: 'Scholarship Tutor',
      },
    },
    onAuthStateChanged: vi.fn((_auth, cb) => {
      cb({
        uid: 'tutor_scholarship_user',
        email: 'scholarship@tutor.com',
        displayName: 'Scholarship Tutor',
      });
      return () => {};
    }),
    fetchPricingConfig: vi.fn(() => Promise.resolve(mockPricing)),
    submitTrxUpgradeRequest: vi.fn(() => Promise.resolve({})),
    fetchPendingUpgradeRequests: vi.fn(() => Promise.resolve([])),
  };
});

describe('formatBdWhatsAppNumber', () => {
  it('correctly normalizes 11-digit BD mobile numbers by prepending 88', () => {
    expect(formatBdWhatsAppNumber('01712345678')).toBe('8801712345678');
    expect(formatBdWhatsAppNumber('01812345678')).toBe('8801812345678');
  });

  it('does not duplicate 88 if already present or international format', () => {
    expect(formatBdWhatsAppNumber('8801712345678')).toBe('8801712345678');
    expect(formatBdWhatsAppNumber('+8801712345678')).toBe('8801712345678');
  });

  it('handles empty or undefined strings cleanly', () => {
    expect(formatBdWhatsAppNumber('')).toBe('');
    expect(formatBdWhatsAppNumber(undefined)).toBe('');
  });
});

describe('SettingsView 100% Scholarship & Promo Banner', () => {
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        settings: { theme: 'dark', currency: '৳' },
        profile: { brandTitle: 'Test Academy' },
        ai: { provider: 'gemini', keys: {}, models: {} },
        students: [],
        batches: [],
        contracts: [],
        payments: [],
        lessons: [],
        docs: [],
      },
      billingState: null,
      updateSettings: vi.fn(),
      updateProfile: vi.fn(),
      updateAI: vi.fn(),
      toast: mockToast,
    } as any);
  });

  it('renders promoText banner inside #upgrade-section and activates 100% scholarship without requiring phone or TrxID', async () => {
    render(<SettingsView />);

    // 1. Verify promoText banner is rendered inside #upgrade-section
    await waitFor(() => {
      const upgradeSection = document.getElementById('upgrade-section');
      expect(upgradeSection).toBeInTheDocument();
      expect(screen.getByText('⚡ Flash Sale: 100% Free Pro Scholarship Available!')).toBeInTheDocument();
    });

    // 2. Apply 100% scholarship promo code
    const promoInput = screen.getByPlaceholderText('Enter code');
    fireEvent.change(promoInput, { target: { value: 'FREE100' } });

    const applyBtn = screen.getByRole('button', { name: 'Apply' });
    fireEvent.click(applyBtn);

    // 3. Confirm 100% scholarship activation button appears
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Activate Free Pro Scholarship Now/i })).toBeInTheDocument();
    });

    // 4. Click activate scholarship button directly without typing phone or TrxID
    const activateBtn = screen.getByRole('button', { name: /Activate Free Pro Scholarship Now/i });
    fireEvent.click(activateBtn);

    // 5. Verify submitTrxUpgradeRequest was invoked with SCHOLARSHIP fallback and FREE_SCHOLARSHIP TrxID
    await waitFor(() => {
      expect(firebaseServices.submitTrxUpgradeRequest).toHaveBeenCalledWith(
        'tutor_scholarship_user',
        'scholarship@tutor.com',
        'Scholarship Tutor',
        expect.objectContaining({
          senderPhone: 'SCHOLARSHIP',
          trxId: 'FREE_SCHOLARSHIP',
          amount: 99,
          finalAmountBdt: 0,
          discountAmountBdt: 99,
          promoCodeUsed: 'FREE100',
        })
      );
      expect(mockToast).toHaveBeenCalledWith(
        'Upgrade request submitted successfully! Waiting for verification.',
        'success'
      );
    });
  });

  it('dynamically re-evaluates active promo percentage when switching between Monthly and Yearly', async () => {
    render(<SettingsView />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter code')).toBeInTheDocument();
    });

    // Apply FLAT100 promo code (100 BDT off)
    const promoInput = screen.getByPlaceholderText('Enter code');
    fireEvent.change(promoInput, { target: { value: 'FLAT100' } });

    const applyBtn = screen.getByRole('button', { name: 'Apply' });
    fireEvent.click(applyBtn);

    // On Monthly (৳99), FLAT100 gives 100% OFF (capped)
    await waitFor(() => {
      expect(screen.getByText(/100% OFF/i)).toBeInTheDocument();
    });

    // Switch to Yearly Pro (৳999)
    const yearlyCard = screen.getByText('Yearly Pro');
    fireEvent.click(yearlyCard);

    // On Yearly (৳999), ৳100 discount corresponds to 10% OFF
    await waitFor(() => {
      expect(screen.getByText(/10% OFF/i)).toBeInTheDocument();
    });
  });
});

describe('StudentsView Guardian Phone WhatsApp Fallback', () => {
  it('renders "Send Due Card" WhatsApp button using guardianPhone when student phone is absent', () => {
    const mockStudent = {
      id: 'student_guardian_1',
      name: 'Young Student',
      phone: '', // No personal phone
      guardianPhone: '01899999999', // Guardian has phone
      active: true,
    };

    const mockContract = {
      id: 'contract_1',
      studentId: 'student_guardian_1',
      fee: 2500,
      cycleType: 'months',
      billingType: 'start',
      startDate: '2026-01-01',
      active: true,
    };

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        students: [mockStudent],
        contracts: [mockContract],
        payments: [], // No payment, full 2500 balance due
        lessons: [],
        batches: [],
      },
      money: (n: number) => `৳${n}`,
    } as any);

    render(<StudentsView onNavigate={vi.fn()} onOpenStudentModal={vi.fn()} onOpenBulkStudentModal={vi.fn()} />);

    // Check that "Send Due Card" link is rendered
    const dueCardBtn = screen.getByRole('link', { name: /Send Due Card/i });
    expect(dueCardBtn).toBeInTheDocument();

    // Verify href points to WhatsApp using guardianPhone normalized with 88
    expect(dueCardBtn).toHaveAttribute('href', expect.stringContaining('https://wa.me/8801899999999'));
  });
});
