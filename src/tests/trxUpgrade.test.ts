import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firebaseMod from '../services/firebase';
import { submitTrxUpgradeRequest, fetchPendingUpgradeRequests, reviewUpgradeRequest, evaluatePromoCode, fetchPlatformTelemetry } from '../services/firebase';
import { PromoCode } from '../types';

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

// We force `db` to be null inside the tests so we use the local offline mock paths
// We also mock auth just in case.
vi.mock('../services/firebase', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/firebase')>();
  return {
    ...mod,
    db: null,
  };
});

// Mock localStorage for local fallback testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] || null),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('trxUpgrade functionality', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('submits an upgrade request locally when offline', async () => {
    const uid = 'test-uid';
    const email = 'test@example.com';
    const name = 'Test User';
    const payload = {
      method: 'bkash' as const,
      senderPhone: '01712345678',
      trxId: 'TRX1234567',
      amount: 99,
      finalAmountBdt: 99,
    };

    const req = await submitTrxUpgradeRequest(uid, email, name, payload);

    expect(req.uid).toBe(uid);
    expect(req.trxId).toBe(payload.trxId);
    expect(req.status).toBe('pending');

    const storedReq = JSON.parse(localStorage.getItem(`upgrade_req_${uid}`)!);
    expect(storedReq.id).toBe(req.id);
    expect(storedReq.status).toBe('pending');
  });

  it('fetches pending upgrade requests from local storage', async () => {
    const uid1 = 'uid-1';
    await submitTrxUpgradeRequest(uid1, 'user1@test.com', 'User 1', { method: 'bkash', senderPhone: '01711111111', trxId: 'TRX1', amount: 99, finalAmountBdt: 99 });
    const uid2 = 'uid-2';
    await submitTrxUpgradeRequest(uid2, 'user2@test.com', 'User 2', { method: 'nagad', senderPhone: '01722222222', trxId: 'TRX2', amount: 99, finalAmountBdt: 99 });

    const pendingReqs = await fetchPendingUpgradeRequests();

    expect(pendingReqs.length).toBe(2);
    expect(pendingReqs.map(r => r.uid)).toContain(uid1);
    expect(pendingReqs.map(r => r.uid)).toContain(uid2);
  });

  it('reviews an upgrade request and updates its status', async () => {
    const uid = 'review-uid';
    const req = await submitTrxUpgradeRequest(uid, 'review@test.com', 'Review User', { method: 'bkash', senderPhone: '01733333333', trxId: 'TRXREV', amount: 99, finalAmountBdt: 99 });

    await reviewUpgradeRequest(req.id, uid, 'approved');

    const storedReq = JSON.parse(localStorage.getItem(`upgrade_req_${uid}`)!);
    expect(storedReq.status).toBe('approved');
    expect(storedReq.reviewedAt).toBeDefined();

    const pendingReqs = await fetchPendingUpgradeRequests();
    expect(pendingReqs.find(r => r.id === req.id)).toBeUndefined();
  });

  describe('evaluatePromoCode', () => {
    it('evaluates percentage discount correctly', () => {
      const promo: PromoCode = {
        code: 'SAVE30',
        discountType: 'percent',
        discountValue: 30,
        discountPercent: 30,
        active: true,
      };

      const res = evaluatePromoCode(promo, 100);
      expect(res.valid).toBe(true);
      expect(res.discountAmount).toBe(30);
      expect(res.finalPrice).toBe(70);
      expect(res.discountPercent).toBe(30);
    });

    it('evaluates flat discount correctly and clamps to basePrice', () => {
      const promo: PromoCode = {
        code: 'FLAT50',
        discountType: 'flat',
        discountValue: 50,
        discountPercent: 50,
        active: true,
      };

      const res = evaluatePromoCode(promo, 99);
      expect(res.valid).toBe(true);
      expect(res.discountAmount).toBe(50);
      expect(res.finalPrice).toBe(49);

      // Clamps when flat discount > basePrice
      const resCapped = evaluatePromoCode(promo, 30);
      expect(resCapped.valid).toBe(true);
      expect(resCapped.discountAmount).toBe(30);
      expect(resCapped.finalPrice).toBe(0);
    });

    it('rejects inactive promo code', () => {
      const promo: PromoCode = {
        code: 'INACTIVE',
        discountType: 'percent',
        discountValue: 20,
        discountPercent: 20,
        active: false,
      };

      const res = evaluatePromoCode(promo, 99);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('no longer active');
    });

    it('rejects promo code that has exceeded maxUses', () => {
      const promo: PromoCode = {
        code: 'LIMITED',
        discountType: 'percent',
        discountValue: 20,
        discountPercent: 20,
        maxUses: 5,
        usedCount: 5,
        active: true,
      };

      const res = evaluatePromoCode(promo, 99);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('usage limit reached');
    });

    it('rejects expired promo code', () => {
      const promo: PromoCode = {
        code: 'EXPIRED',
        discountType: 'percent',
        discountValue: 20,
        discountPercent: 20,
        expiresAt: '2020-01-01',
        active: true,
      };

      const res = evaluatePromoCode(promo, 99);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('expired');
    });
  });

  describe('submitTrxUpgradeRequest promo tracking & fetchPlatformTelemetry', () => {
    it('increments promo usedCount on submit and reflects in telemetry', async () => {
      const initialPricing = {
        monthlyPriceBdt: 99,
        yearlyPriceBdt: 999,
        promoCodes: [
          { code: 'PROMO10', discountType: 'percent' as const, discountValue: 10, discountPercent: 10, usedCount: 0, active: true },
        ],
        bkashNumber: '01711111111',
        nagadNumber: '01722222222',
        rocketNumber: '01733333333',
        promoText: '',
        updatedAt: Date.now(),
      };
      localStorage.setItem('tuitrix_pricing', JSON.stringify(initialPricing));

      await submitTrxUpgradeRequest('promo-user', 'promouser@test.com', 'Promo User', {
        method: 'bkash',
        senderPhone: '01700000000',
        trxId: 'TRXPROMO1',
        amount: 99,
        promoCodeUsed: 'PROMO10',
        discountAmountBdt: 10,
        finalAmountBdt: 89,
      });

      const updatedPricing = JSON.parse(localStorage.getItem('tuitrix_pricing')!);
      const promoItem = updatedPricing.promoCodes.find((p: any) => p.code === 'PROMO10');
      expect(promoItem.usedCount).toBe(1);

      const telem = await fetchPlatformTelemetry(updatedPricing);
      expect(telem.pendingCount).toBeGreaterThanOrEqual(1);
      expect(telem.promoUsageMap['PROMO10']).toBeDefined();
      expect(telem.promoUsageMap['PROMO10'].count).toBe(1);
    });
  });
});
