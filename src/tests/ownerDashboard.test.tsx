/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PricingConfig, TrxUpgradeRequest } from '../types';

let mockCurrentUser: { email: string | null } | null = { email: 'abdullahsazid109@gmail.com' };
let authListener: ((user: any) => void) | null = null;

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => null),
  doc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>();
  return {
    ...actual,
    getAuth: vi.fn(() => ({
      get currentUser() {
        return mockCurrentUser;
      },
    })),
    onAuthStateChanged: vi.fn((_auth, callback) => {
      authListener = callback;
      callback(mockCurrentUser);
      return () => {
        authListener = null;
      };
    }),
  };
});

import { fetchPlatformTelemetry, updatePricingConfig, DEFAULT_PRICING } from '../services/firebase';
import { OwnerDashboardView, formatPromoBannerText } from '../views/OwnerDashboardView';
import * as context from '../store/context';

describe('fetchPlatformTelemetry - Promo Telemetry & Approved Revenue', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('only tallies approved requests toward revenueGeneratedBdt/totalDiscountBdt and reconciles count across non-rejected requests', async () => {
    const pricingConfig: PricingConfig = {
      ...DEFAULT_PRICING,
      promoCodes: [
        {
          code: 'DISCOUNT20',
          discountType: 'percent',
          discountValue: 20,
          discountPercent: 20,
          usedCount: 1,
          active: true,
        },
      ],
    };

    // 1 approved request
    const approvedReq: TrxUpgradeRequest = {
      id: 'req_approved',
      uid: 'user_appr',
      userEmail: 'user_appr@test.com',
      userName: 'User Approved',
      method: 'bkash',
      senderPhone: '01711111111',
      trxId: 'TRX_APPR',
      amount: 100,
      planTerm: 'monthly',
      billingCycle: 'monthly',
      promoCodeUsed: 'DISCOUNT20',
      discountAmountBdt: 20,
      finalAmountBdt: 80,
      status: 'approved',
      createdAt: '2026-11-03T01:00:00Z',
    };

    // 1 pending request
    const pendingReq: TrxUpgradeRequest = {
      id: 'req_pending',
      uid: 'user_pend',
      userEmail: 'user_pend@test.com',
      userName: 'User Pending',
      method: 'bkash',
      senderPhone: '01722222222',
      trxId: 'TRX_PEND',
      amount: 100,
      planTerm: 'monthly',
      billingCycle: 'monthly',
      promoCodeUsed: 'DISCOUNT20',
      discountAmountBdt: 20,
      finalAmountBdt: 80,
      status: 'pending',
      createdAt: '2026-11-03T02:00:00Z',
    };

    // 1 rejected request
    const rejectedReq: TrxUpgradeRequest = {
      id: 'req_rejected',
      uid: 'user_rej',
      userEmail: 'user_rej@test.com',
      userName: 'User Rejected',
      method: 'bkash',
      senderPhone: '01733333333',
      trxId: 'TRX_REJ',
      amount: 100,
      planTerm: 'monthly',
      billingCycle: 'monthly',
      promoCodeUsed: 'DISCOUNT20',
      discountAmountBdt: 20,
      finalAmountBdt: 80,
      status: 'rejected',
      createdAt: '2026-11-03T03:00:00Z',
    };

    localStorage.setItem('upgrade_req_user_appr', JSON.stringify(approvedReq));
    localStorage.setItem('upgrade_req_user_pend', JSON.stringify(pendingReq));
    localStorage.setItem('upgrade_req_user_rej', JSON.stringify(rejectedReq));

    const telemetry = await fetchPlatformTelemetry(pricingConfig);

    // Total promo redemptions must exclude rejected
    expect(telemetry.totalPromoRedemptions).toBe(2);

    const promoStats = telemetry.promoUsageMap['DISCOUNT20'];
    expect(promoStats).toBeDefined();

    // Reconciled count = Math.max(configPromo?.usedCount || 0, nonRejectedCount) = Math.max(1, 2) = 2
    expect(promoStats.count).toBe(2);

    // Revenue and discount must only reflect approved requests
    expect(promoStats.revenueGeneratedBdt).toBe(80);
    expect(promoStats.totalDiscountBdt).toBe(20);
  });
});

describe('OwnerDashboardView - Pricing & Free Student Limit', () => {
  const mockToast = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    mockCurrentUser = { email: 'abdullahsazid109@gmail.com' };
    vi.clearAllMocks();
    vi.spyOn(context, 'useStore').mockReturnValue({
      toast: mockToast,
    } as any);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('allows owner to update and save freeStudentLimit', async () => {
    const onNavigate = vi.fn();
    render(<OwnerDashboardView onNavigate={onNavigate} />);

    // Wait for initial data to load
    await waitFor(() => {
      expect(screen.getByText('👑 Owner Dashboard')).toBeInTheDocument();
    });

    // Switch to Tab 2: Pricing & Numbers
    const pricingTabBtn = screen.getByRole('button', { name: /2\. Pricing & Numbers/i });
    fireEvent.click(pricingTabBtn);

    // Locate the Free Tier Student Limit field
    const freeStudentLimitInput = screen.getByLabelText(/Free Tier Student Limit \*/i);
    expect(freeStudentLimitInput).toBeInTheDocument();

    // Change limit to 12
    fireEvent.change(freeStudentLimitInput, { target: { value: '12' } });

    // Submit form
    const saveBtn = screen.getByRole('button', { name: /Save Pricing & Payment Numbers/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const savedConfig = JSON.parse(localStorage.getItem('tuitrix_pricing') || '{}');
      expect(savedConfig.freeStudentLimit).toBe(12);
      expect(mockToast).toHaveBeenCalledWith(
        'Pricing configuration saved & published to cloud!',
        'success'
      );
    });
  });

  it('renders access-denied view for non-owner email', async () => {
    mockCurrentUser = { email: 'tutor@example.com' };
    const onNavigate = vi.fn();

    await act(async () => {
      render(<OwnerDashboardView onNavigate={onNavigate} />);
    });

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('This dashboard is restricted to authorized platform owners.')).toBeInTheDocument();

    const homeBtn = screen.getByRole('button', { name: /Return to Dashboard/i });
    fireEvent.click(homeBtn);
    expect(onNavigate).toHaveBeenCalledWith('home');
  });

  it('reactively switches to access-denied if auth changes to non-owner', async () => {
    mockCurrentUser = { email: 'abdullahsazid109@gmail.com' };
    const onNavigate = vi.fn();

    render(<OwnerDashboardView onNavigate={onNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('👑 Owner Dashboard')).toBeInTheDocument();
    });

    // Simulate switching accounts to a non-owner tutor
    act(() => {
      mockCurrentUser = { email: 'tutor@example.com' };
      if (authListener) {
        authListener(mockCurrentUser);
      }
    });

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });
});

describe('formatPromoBannerText', () => {
  it('formats flat and percent discounts with and without maxUses limits', () => {
    // Percent discount with limited uses
    expect(
      formatPromoBannerText({
        code: 'FLASH50',
        discountType: 'percent',
        discountPercent: 50,
        discountValue: 50,
        active: true,
        maxUses: 50,
      })
    ).toBe('🎉 CODE: "FLASH50" — 50% OFF (First 50 users)');

    // Flat discount without cap
    expect(
      formatPromoBannerText({
        code: 'EID2026',
        discountType: 'flat',
        discountValue: 150,
        discountPercent: 0,
        active: true,
      })
    ).toBe('🎉 CODE: "EID2026" — ৳150 OFF');

    // Flat discount with limited uses
    expect(
      formatPromoBannerText({
        code: 'PROMO100',
        discountType: 'flat',
        discountValue: 100,
        discountPercent: 0,
        active: true,
        maxUses: 10,
      })
    ).toBe('🎉 CODE: "PROMO100" — ৳100 OFF (First 10 users)');

    // Percent discount with maxUses 0 (unlimited)
    expect(
      formatPromoBannerText({
        code: 'WELCOME10',
        discountType: 'percent',
        discountPercent: 10,
        discountValue: 10,
        active: true,
        maxUses: 0,
      })
    ).toBe('🎉 CODE: "WELCOME10" — 10% OFF');
  });
});
