import { describe, it, expect } from 'vitest';
import { canAddStudent } from '../utils/tierLimits';

describe('Phase 9 Competitor Edge features', () => {

  describe('Bulk Student Parsing & Quota Logic', () => {
    it('accurately parses multi-line "Name, Phone, Fee" strings', () => {
      const text = `Tanvir Ahmed, 01712345678, 2500\nSadia Rahman, , 2000\nJohn Doe`;

      const parsedStudents = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          const parts = line.split(',').map(p => p.trim());
          return {
            name: parts[0],
            phone: parts[1] || '',
            fee: parts[2] ? parseFloat(parts[2]) : undefined,
          };
        });

      expect(parsedStudents).toHaveLength(3);
      expect(parsedStudents[0]).toEqual({ name: 'Tanvir Ahmed', phone: '01712345678', fee: 2500 });
      expect(parsedStudents[1]).toEqual({ name: 'Sadia Rahman', phone: '', fee: 2000 });
      expect(parsedStudents[2]).toEqual({ name: 'John Doe', phone: '', fee: undefined });
    });

    it('respects the 15-student Free Tier cap vs. Pro unlimited', () => {
      // Free tier: cannot add if limit reached
      expect(canAddStudent(15, false)).toBe(false);
      expect(canAddStudent(14, false)).toBe(true);

      // Pro tier: can add unlimited
      expect(canAddStudent(15, true)).toBe(true);
      expect(canAddStudent(100, true)).toBe(true);
    });
  });

  describe('Payment Receipt Text Generator', () => {
    it('produces valid English and Bangla (৳) receipt messages', () => {
      const studentName = 'Tanvir';
      const amountStr = '৳ 2,500';
      const dateStr = 'Oct 24, 2024';
      const receiptId = '#TX-REC-123456';
      const tutorName = 'Sazid';

      const generateMsg = (lang: 'en' | 'bn') => {
        if (lang === 'en') {
          return `✅ Payment Received: ${amountStr} for ${studentName} on ${dateStr}. Receipt ${receiptId}. Thank you! — ${tutorName}`;
        } else {
          return `✅ পেমেন্ট গৃহীত হয়েছে: ${studentName}-এর জন্য ${dateStr} তারিখে ${amountStr}। রশিদ ${receiptId}। ধন্যবাদ! — ${tutorName}`;
        }
      };

      const enMsg = generateMsg('en');
      expect(enMsg).toContain('✅ Payment Received: ৳ 2,500 for Tanvir');
      expect(enMsg).toContain('#TX-REC-123456');

      const bnMsg = generateMsg('bn');
      expect(bnMsg).toContain('✅ পেমেন্ট গৃহীত হয়েছে: Tanvir-এর জন্য Oct 24, 2024 তারিখে ৳ 2,500');
      expect(bnMsg).toContain('রশিদ #TX-REC-123456');
    });
  });

  describe('Weekly Routine Helper Logic', () => {
    it('groups students and batches accurately by day of the week (Sat-Fri) and sorts by time', () => {
      const BANGLA_DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      const students = [
        { id: '1', name: 'Student A', scheduleDays: ['Sat', 'Mon'], scheduleTime: '17:30', active: true },
        { id: '2', name: 'Student B', scheduleDays: ['Sun'], scheduleTime: '15:00', active: true },
      ];
      const batches = [
        { id: 'b1', name: 'Batch 1', scheduleDays: ['Sat'], scheduleTime: '16:00', active: true },
      ];

      const getScheduledItemsForDay = (day: string) => {
        const scheduledItems: { id: string; name: string; type: 'student' | 'batch'; time: string }[] = [];
        students.forEach(s => {
          if (s.scheduleDays?.includes(day)) {
            scheduledItems.push({ id: s.id, name: s.name, type: 'student', time: s.scheduleTime });
          }
        });
        batches.forEach(b => {
          if (b.scheduleDays?.includes(day)) {
            scheduledItems.push({ id: b.id, name: b.name, type: 'batch', time: b.scheduleTime });
          }
        });
        scheduledItems.sort((a, b) => a.time.localeCompare(b.time));
        return scheduledItems;
      };

      const satItems = getScheduledItemsForDay('Sat');
      expect(satItems).toHaveLength(2);
      expect(satItems[0]).toEqual({ id: 'b1', name: 'Batch 1', type: 'batch', time: '16:00' }); // Batch 1 is earlier
      expect(satItems[1]).toEqual({ id: '1', name: 'Student A', type: 'student', time: '17:30' }); // Student A is later

      const sunItems = getScheduledItemsForDay('Sun');
      expect(sunItems).toHaveLength(1);
      expect(sunItems[0].name).toBe('Student B');

      const friItems = getScheduledItemsForDay('Fri');
      expect(friItems).toHaveLength(0);
    });
  });
});
