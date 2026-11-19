import { describe, it, expect } from 'vitest';
import {
  normalizeWhatsAppPhone,
  generateFeeReminderMessage,
  buildWhatsAppUrl,
} from '../utils/whatsapp';

describe('normalizeWhatsAppPhone', () => {
  it('normalizes 11-digit BD mobile numbers with hyphens and spaces by prefixing 88', () => {
    expect(normalizeWhatsAppPhone('01711-223344')).toBe('8801711223344');
    expect(normalizeWhatsAppPhone('01812 345678')).toBe('8801812345678');
  });

  it('preserves numbers already having country code +880 or international format', () => {
    expect(normalizeWhatsAppPhone('+880 1811 000000')).toBe('8801811000000');
    expect(normalizeWhatsAppPhone('8801711223344')).toBe('8801711223344');
  });

  it('strips leading 00 international prefixes', () => {
    expect(normalizeWhatsAppPhone('008801711223344')).toBe('8801711223344');
    expect(normalizeWhatsAppPhone('00441234567890')).toBe('441234567890');
  });

  it('returns empty string for empty, undefined, or fewer than 7 digits', () => {
    expect(normalizeWhatsAppPhone('')).toBe('');
    expect(normalizeWhatsAppPhone(undefined)).toBe('');
    expect(normalizeWhatsAppPhone('123456')).toBe('');
    expect(normalizeWhatsAppPhone('abc')).toBe('');
  });
});

describe('generateFeeReminderMessage', () => {
  it('generates an English reminder with owedSince and paymentNote', () => {
    const msg = generateFeeReminderMessage({
      studentName: 'Rahim',
      contractTitle: 'Math & Physics',
      dueAmount: 5000,
      currency: '৳',
      owedSince: '2026-11-01',
      tutorName: 'Sazid Sir',
      paymentNote: 'Please clear before final exam',
      lang: 'en',
    });

    expect(msg).toContain('Rahim (Math & Physics)');
    expect(msg).toContain('Tuition fee due: ৳5000 (due since 2026-11-01)');
    expect(msg).toContain('Note: Please clear before final exam.');
    expect(msg).toContain('Thank you — Sazid Sir.');
  });

  it('generates an English reminder without owedSince and paymentNote', () => {
    const msg = generateFeeReminderMessage({
      studentName: 'Nusrat',
      dueAmount: 3500,
      lang: 'en',
    });

    expect(msg).toBe(
      'Assalamu Alaikum, this is a reminder for Nusrat. Tuition fee due: ৳3500. Thank you — Tutor.'
    );
    expect(msg).not.toContain('due since');
    expect(msg).not.toContain('Note:');
  });

  it('generates a polite Bangla reminder with owedSince and paymentNote', () => {
    const msg = generateFeeReminderMessage({
      studentName: 'তানভীর',
      contractTitle: 'ইংরেজি',
      dueAmount: 4000,
      currency: '৳',
      owedSince: '১লা নভেম্বর',
      tutorName: 'সাজিদ স্যার',
      paymentNote: 'বিকাশ নম্বর: ০১৭০০০০০০০০',
      lang: 'bn',
    });

    expect(msg).toContain('তানভীর-এর (ইংরেজি)');
    expect(msg).toContain('বকেয়া টিউশন ফি: ৳4000 (১লা নভেম্বর থেকে)');
    expect(msg).toContain('নোট: বিকাশ নম্বর: ০১৭০০০০০০০০।');
    expect(msg).toContain('ধন্যবাদ — সাজিদ স্যার।');
  });

  it('generates a Bangla reminder without owedSince and paymentNote', () => {
    const msg = generateFeeReminderMessage({
      studentName: 'তানভীর',
      dueAmount: 4000,
      lang: 'bn',
    });

    expect(msg).toBe(
      'আসসালামু আলাইকুম, তানভীর-এর বকেয়া টিউশন ফি: ৳4000। অনুগ্রহ করে পরিশোধের ব্যবস্থা করলে উপকৃত হব। ধন্যবাদ — Tutor।',
    );
  });

  it('rounds decimal due amounts properly and defaults missing currency and tutorName', () => {
    const msg = generateFeeReminderMessage({
      studentName: 'Karim',
      dueAmount: 2999.6,
      currency: undefined,
      tutorName: undefined,
    });

    expect(msg).toContain('Tuition fee due: ৳3000.');
    expect(msg).toContain('Thank you — Tutor.');
  });
});

describe('buildWhatsAppUrl', () => {
  it('builds direct WhatsApp URL with normalized BD phone', () => {
    const url = buildWhatsAppUrl('01711-223344', 'Due fee: ৳5000');
    expect(url).toBe('https://wa.me/8801711223344?text=Due%20fee%3A%20%E0%A7%B35000');
  });

  it('builds contact-picker URL when phone is undefined or invalid', () => {
    const url1 = buildWhatsAppUrl(undefined, 'Reminder text');
    expect(url1).toBe('https://wa.me/?text=Reminder%20text');

    const url2 = buildWhatsAppUrl('1234', 'Reminder text');
    expect(url2).toBe('https://wa.me/?text=Reminder%20text');
  });
});
