import { BillingState, DailyAiAdUsage } from '../types';
import { isOwnerEmail } from './auth';

export const FREE_TIER_MAX_STUDENTS = 15;
export const FREE_TIER_MAX_BATCHES = 2;
export const FREE_TIER_DAILY_AI_ADS_LIMIT = 5;

export const isProUser = (billing?: BillingState | null, userEmail?: string | null): boolean => {
  if (isOwnerEmail(userEmail)) return true;
  if (!billing) return false;

  const isProPlan = billing.plan === 'pro';
  if (!isProPlan) return false;

  if (billing.proUntil) {
    const now = Date.now();
    return now < billing.proUntil;
  }

  return true;
};

export const getFreeStudentLimit = (fallback: number = FREE_TIER_MAX_STUDENTS): number => {
  try {
    const raw = localStorage.getItem('tuitrix_pricing');
    if (raw) {
      const parsed = JSON.parse(raw);
      const limit = Number(parsed?.freeStudentLimit);
      if (!isNaN(limit) && limit > 0) {
        return limit;
      }
    }
  } catch {}
  return fallback;
};

export const canAddStudent = (currentCount: number, isPro: boolean, customLimit?: number): boolean => {
  return isPro || currentCount < (customLimit ?? getFreeStudentLimit());
};

export const canAddBatch = (currentCount: number, isPro: boolean): boolean => {
  return isPro || currentCount < FREE_TIER_MAX_BATCHES;
};

export const getDailyAiQuotaState = (usage: DailyAiAdUsage | undefined, todayStr: string) => {
  const isSameDay = usage?.date === todayStr;

  const usedToday = isSameDay ? (usage?.requestsUsedToday || 0) : 0;
  const adsWatchedToday = isSameDay ? (usage?.adsWatchedToday || 0) : 0;
  const unlockedCredits = isSameDay ? (usage?.unlockedCredits || 0) : 0;

  const remainingToday = FREE_TIER_DAILY_AI_ADS_LIMIT - usedToday;
  const canWatchAd = adsWatchedToday < FREE_TIER_DAILY_AI_ADS_LIMIT;

  return {
    usedToday,
    remainingToday,
    adCreditsAvailable: unlockedCredits,
    canWatchAd
  };
};
export const FREE_TIER_MAX_SAVED_RESOURCES = 5;
export const canSaveAiResource = (currentCount: number, isPro: boolean): boolean => { return isPro || currentCount < FREE_TIER_MAX_SAVED_RESOURCES; };
