/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LessonModal } from '../components/LessonModal';
import { PaymentModal } from '../components/PaymentModal';
import { PaymentReceiptModal } from '../components/PaymentReceiptModal';
import { BatchFeeModal } from '../components/BatchFeeModal';
import { StudentModal } from '../components/StudentModal';
import { BulkStudentModal } from '../components/BulkStudentModal';
import { formatBdWhatsAppNumber } from '../views/SettingsView';
import { stripUndefinedDeep } from '../services/firebase';
import * as context from '../store/context';

vi.mock('../services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/firebase')>();
  return {
    ...actual,
    app: {},
    auth: { currentUser: null },
    db: null,
    onAuthStateChanged: vi.fn(),
    resetUserPassword: vi.fn(),
    googleProvider: {},
    signInWithPopup: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
    fetchPricingConfig: vi.fn(() => Promise.resolve({ monthlyPriceBdt: 99, freeStudentLimit: 15 })),
  };
});

describe('Modal & Receipt Components (LessonModal, PaymentModal, PaymentReceiptModal, BatchFeeModal)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('LessonModal - Initial Props & Batch Mode Honor', () => {
    it('honors initialStudentId and initialBatchId correctly', () => {
      const mockStudents = [
        { id: 's1', name: 'Alice Student', active: true, subjects: ['Math'] },
        { id: 's2', name: 'Bob Student', active: true, subjects: ['Physics'] },
      ];
      const mockBatches = [
        { id: 'b1', name: 'Math Batch A', studentIds: ['s1'], active: true, subjects: ['Math'] },
      ];

      const mockStore = {
        state: {
          students: mockStudents,
          batches: mockBatches,
          contracts: [],
          lessons: [],
        },
        getStudent: (id: string) => mockStudents.find(s => s.id === id),
        studentName: (id: string) => mockStudents.find(s => s.id === id)?.name || id,
        saveLesson: vi.fn(),
        logBatchLesson: vi.fn(),
        deleteLesson: vi.fn(),
        toast: vi.fn(),
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      // 1. Render with initialStudentId="s2"
      const { rerender } = render(
        <LessonModal
          isOpen={true}
          initialStudentId="s2"
          onClose={vi.fn()}
        />
      );

      const studentSelect = screen.getByLabelText(/Student \*/i) as HTMLSelectElement;
      expect(studentSelect.value).toBe('s2');

      // 2. Re-render with initialBatchId="b1"
      rerender(
        <LessonModal
          isOpen={true}
          initialBatchId="b1"
          onClose={vi.fn()}
        />
      );

      const batchSelect = screen.getByLabelText(/Batch \*/i) as HTMLSelectElement;
      expect(batchSelect.value).toBe('b1');
    });

    it('prefills time from matching weekday slot in b.schedule or b.scheduleTime when !initialTime', () => {
      // 2026-11-14 is Saturday (day 6)
      const mockBatches = [
        {
          id: 'b1',
          name: 'Weekend Math Batch',
          studentIds: ['s1'],
          active: true,
          schedule: [{ day: 6, time: '10:30', duration: 90 }],
          scheduleTime: '15:00',
        },
      ];

      const mockStore = {
        state: {
          students: [{ id: 's1', name: 'Alice', active: true }],
          batches: mockBatches,
          contracts: [],
          lessons: [],
        },
        getStudent: () => ({ id: 's1', name: 'Alice', active: true }),
        studentName: () => 'Alice',
        saveLesson: vi.fn(),
        logBatchLesson: vi.fn(),
        deleteLesson: vi.fn(),
        toast: vi.fn(),
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      render(
        <LessonModal
          isOpen={true}
          initialBatchId="b1"
          initialDate="2026-11-14"
          onClose={vi.fn()}
        />
      );

      const timeInput = screen.getByLabelText(/Time/i) as HTMLInputElement;
      expect(timeInput.value).toBe('10:30');
    });
  });

  describe('PaymentModal - Smart Fee Suggestion', () => {
    it('suggests st.balance when not zero including advance credits without defaulting to full c.fee', () => {
      const mockStudent = { id: 's1', name: 'Student Advance', active: true };
      const mockContract = {
        id: 'c1',
        studentId: 's1',
        title: 'Advance Contract',
        fee: 4000,
        cycleType: 'months' as const,
        cycleLength: 1,
        billing: 'start' as const,
        startDate: '2026-11-01',
        status: 'active' as const,
      };

      // Payment of 6000 against 4000 fee creates an advance credit of 2000 (balance = -2000)
      const mockPayment = {
        id: 'p1',
        studentId: 's1',
        contractId: 'c1',
        amount: 6000,
        date: '2026-11-01',
      };

      const mockStore = {
        state: {
          students: [mockStudent],
          contracts: [mockContract],
          payments: [mockPayment],
          lessons: [],
          settings: { currency: '৳' },
        },
        getContract: (id: string) => (id === 'c1' ? mockContract : null),
        savePayment: vi.fn(),
        deletePayment: vi.fn(),
        money: (n: number) => `৳${n}`,
        toast: vi.fn(),
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      render(
        <PaymentModal
          isOpen={true}
          initialStudentId="s1"
          initialContractId="c1"
          onClose={vi.fn()}
        />
      );

      const amountInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;
      // Because st.balance is -2000 (!== 0), it suggests Math.abs(-2000) = 2000 instead of defaulting to 4000
      expect(amountInput.value).toBe('2000');
    });
  });

  describe('PaymentReceiptModal - Dynamic Currency Symbol', () => {
    it('renders with state.settings.currency instead of hardcoded ৳', () => {
      const mockStudent = { id: 's1', name: 'Tanvir Hossain', phone: '01711111111' };
      const mockContract = { id: 'c1', studentId: 's1', title: 'HSC Physics' };
      const mockPayment = {
        id: 'pay-778899',
        studentId: 's1',
        contractId: 'c1',
        amount: 3500,
        date: '2026-11-04',
        method: 'Nagad',
      };

      const mockStore = {
        state: {
          students: [mockStudent],
          contracts: [mockContract],
          profile: { brandTitle: 'Apex Physics Academy' },
          settings: {
            currency: 'USD',
            tutorName: 'Sazid Sir',
          },
        },
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      render(
        <PaymentReceiptModal
          isOpen={true}
          payment={mockPayment as any}
          onClose={vi.fn()}
        />
      );

      // Verify dynamic currency "USD 3500" is rendered
      expect(screen.getByText('USD 3500')).toBeInTheDocument();
      expect(screen.getByText(/Apex Physics Academy/i)).toBeInTheDocument();
      expect(screen.getByText(/Tanvir Hossain/i)).toBeInTheDocument();
    });

    it('does not render "None" when coachingName or brandTitle is "None"', () => {
      const mockStudent = { id: 's1', name: 'Tanvir Hossain', phone: '01711111111' };
      const mockContract = { id: 'c1', studentId: 's1', title: 'HSC Physics' };
      const mockPayment = {
        id: 'pay-778899',
        studentId: 's1',
        contractId: 'c1',
        amount: 3500,
        date: '2026-11-04',
        method: 'Cash',
      };

      const mockStore = {
        state: {
          students: [mockStudent],
          contracts: [mockContract],
          profile: { brandTitle: 'None' },
          settings: {
            coachingName: 'None',
            currency: '৳',
            tutorName: 'Sazid Sir',
          },
        },
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      render(
        <PaymentReceiptModal
          isOpen={true}
          payment={mockPayment as any}
          onClose={vi.fn()}
        />
      );

      expect(screen.queryByText(/None/i)).not.toBeInTheDocument();
      expect(screen.getByText('Sazid Sir')).toBeInTheDocument();
    });

    it('prepends 88 to 11-digit BD phone numbers in window.open WhatsApp URLs', () => {
      const mockStudent = { id: 's1', name: 'Tanvir Hossain', phone: '01712345678' };
      const mockContract = { id: 'c1', studentId: 's1', title: 'HSC Physics' };
      const mockPayment = {
        id: 'pay-778899',
        studentId: 's1',
        contractId: 'c1',
        amount: 3500,
        date: '2026-11-04',
        method: 'Cash',
      };

      const mockStore = {
        state: {
          students: [mockStudent],
          contracts: [mockContract],
          profile: { brandTitle: 'Apex Physics Academy' },
          settings: {
            currency: '৳',
            tutorName: 'Sazid Sir',
          },
        },
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(
        <PaymentReceiptModal
          isOpen={true}
          payment={mockPayment as any}
          onClose={vi.fn()}
        />
      );

      const waBtn = screen.getByRole('button', { name: /WhatsApp/i });
      fireEvent.click(waBtn);

      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://wa.me/8801712345678?text='),
        '_blank'
      );
    });
  });

  describe('stripUndefinedDeep', () => {
    it('removes nested undefined inside promoCodes arrays and objects', () => {
      const input = {
        monthlyPriceBdt: 99,
        promoCodes: [
          {
            code: 'PROMO1',
            discountPercent: 20,
            maxUses: undefined,
            expiresAt: undefined,
            description: 'Test Promo',
          },
          {
            code: 'PROMO2',
            discountValue: 50,
            maxUses: 10,
            nested: {
              a: 1,
              b: undefined,
            },
          },
        ],
        extra: undefined,
      };

      const cleaned = stripUndefinedDeep(input);

      expect(cleaned).toEqual({
        monthlyPriceBdt: 99,
        promoCodes: [
          {
            code: 'PROMO1',
            discountPercent: 20,
            description: 'Test Promo',
          },
          {
            code: 'PROMO2',
            discountValue: 50,
            maxUses: 10,
            nested: {
              a: 1,
            },
          },
        ],
      });
      expect('extra' in cleaned).toBe(false);
      expect('maxUses' in cleaned.promoCodes[0]).toBe(false);
      expect('expiresAt' in cleaned.promoCodes[0]).toBe(false);
    });
  });

  describe('BatchFeeModal - Valid WhatsApp Phone Link', () => {
    it('generates valid WhatsApp links containing the student formatted phone number', () => {
      const mockStudent = {
        id: 's1',
        name: 'Jannatul Ferdous',
        phone: '01812345678',
        active: true,
      };

      const mockBatch = {
        id: 'b1',
        name: 'Chemistry Batch 2026',
        studentIds: ['s1'],
        defaultFee: 2500,
        active: true,
      };

      const mockContract = {
        id: 'c1',
        studentId: 's1',
        fee: 2500,
        cycleType: 'months' as const,
        cycleLength: 1,
        billing: 'start' as const,
        startDate: '2026-11-01',
        status: 'active' as const,
        title: 'Monthly Chemistry',
      };

      const mockStore = {
        state: {
          students: [mockStudent],
          batches: [mockBatch],
          contracts: [mockContract],
          lessons: [],
          payments: [],
          promoCodes: [],
          settings: { tutorName: 'Teacher Abdullah', currency: '৳' },
        },
        money: (n: number) => `৳${n}`,
        getContract: (id: string) => (id === 'c1' ? mockContract : null),
        savePayment: vi.fn(),
        toast: vi.fn(),
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      render(
        <BatchFeeModal
          isOpen={true}
          batch={mockBatch as any}
          onClose={vi.fn()}
        />
      );

      // Due reminder link should be displayed with clean formatted WhatsApp URL
      const waLink = screen.getByTitle(/Send reminder on WhatsApp/i) as HTMLAnchorElement;
      expect(waLink).toBeInTheDocument();

      // Phone 01812345678 (11 digits starting with 01) should be formatted to 8801812345678
      expect(waLink.href).toContain('https://wa.me/8801812345678?text=');
      expect(decodeURIComponent(waLink.href)).toContain('Jannatul Ferdous');
      expect(decodeURIComponent(waLink.href)).toContain('2500');
    });

    it('supports promo codes using discountValue / discountPercent as well as value, and skips recording 0-amount payments when originalAmount === 0', () => {
      const mockStudent1 = {
        id: 's1',
        name: 'Paid Student',
        phone: '01811111111',
        active: true,
      };
      const mockStudent2 = {
        id: 's2',
        name: 'Free Student',
        phone: '01822222222',
        active: true,
      };

      const mockBatch = {
        id: 'b1',
        name: 'Chemistry Batch 2026',
        studentIds: ['s1', 's2'],
        defaultFee: 0,
        active: true,
      };

      const mockContract1 = {
        id: 'c1',
        studentId: 's1',
        fee: 2500,
        cycleType: 'months' as const,
        cycleLength: 1,
        billing: 'start' as const,
        startDate: '2026-11-01',
        status: 'active' as const,
        title: 'Monthly Chemistry',
      };

      const mockContract2 = {
        id: 'c2',
        studentId: 's2',
        fee: 0,
        cycleType: 'months' as const,
        cycleLength: 1,
        billing: 'start' as const,
        startDate: '2026-11-01',
        status: 'active' as const,
        title: 'Scholarship Chemistry',
      };

      const mockSavePayment = vi.fn();

      const mockStore = {
        state: {
          students: [mockStudent1, mockStudent2],
          batches: [mockBatch],
          contracts: [mockContract1, mockContract2],
          lessons: [],
          payments: [],
          promoCodes: [
            {
              code: 'PERCENT10',
              discountType: 'percent',
              discountPercent: 10,
              active: true,
            },
            {
              code: 'VALUE500',
              discountType: 'fixed',
              discountValue: 500,
              active: true,
            },
          ],
          settings: { tutorName: 'Teacher Abdullah', currency: '৳' },
        },
        money: (n: number) => `৳${n}`,
        getContract: (id: string) => {
          if (id === 'c1') return mockContract1;
          if (id === 'c2') return mockContract2;
          return null;
        },
        savePayment: mockSavePayment,
        toast: vi.fn(),
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      render(
        <BatchFeeModal
          isOpen={true}
          batch={mockBatch as any}
          onClose={vi.fn()}
        />
      );

      // Apply percent promo code
      const promoInput = screen.getByPlaceholderText(/e\.g\. EARLY10/i);
      fireEvent.change(promoInput, { target: { value: 'PERCENT10' } });
      fireEvent.click(screen.getByRole('button', { name: /Apply/i }));

      expect(screen.getByText(/Applied: PERCENT10 \(-10%\)/i)).toBeInTheDocument();

      // Click "Select All" (header checkbox)
      const allCheckboxes = screen.getAllByRole('checkbox');
      fireEvent.click(allCheckboxes[0]);

      // Click "Record Selected Payments"
      fireEvent.click(screen.getByRole('button', { name: /Record/i }));

      // Only student 1 with fee 2500 has payment recorded (2500 - 250 = 2250)
      // student 2 with fee 0 has originalAmount === 0, so it is skipped
      expect(mockSavePayment).toHaveBeenCalledTimes(1);
      expect(mockSavePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 's1',
          contractId: 'c1',
          amount: 2250,
          discountApplied: 250,
          promoCodeUsed: 'PERCENT10',
        })
      );

      // Verify discountValue promo also works without NaN
      mockSavePayment.mockClear();
      fireEvent.change(promoInput, { target: { value: 'VALUE500' } });
      fireEvent.click(screen.getByRole('button', { name: /Apply/i }));

      expect(screen.getByText(/Applied: VALUE500 \(-৳500\)/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Record/i }));

      expect(mockSavePayment).toHaveBeenCalledTimes(1);
      expect(mockSavePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 's1',
          contractId: 'c1',
          amount: 2000,
          discountApplied: 500,
          promoCodeUsed: 'VALUE500',
        })
      );
    });
  });

  describe('BulkStudentModal - Batch Fee Contract Creation', () => {
    it('creates fee contracts for imported students even when a Target Batch is selected', () => {
      const mockBatches = [
        { id: 'b1', name: 'Batch 1', studentIds: [], active: true },
      ];
      const mockSaveStudent = vi.fn().mockReturnValue('new-s1');
      const mockSaveContract = vi.fn();
      const mockSaveBatch = vi.fn();

      const mockStore = {
        state: {
          students: [],
          batches: mockBatches,
        },
        billingState: { plan: 'pro' },
        user: { email: 'test@tutor.com' },
        saveStudent: mockSaveStudent,
        saveContract: mockSaveContract,
        saveBatch: mockSaveBatch,
        toast: vi.fn(),
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      render(<BulkStudentModal isOpen={true} onClose={vi.fn()} />);

      // Select target batch
      const batchSelect = screen.getByLabelText(/Target Batch/i);
      fireEvent.change(batchSelect, { target: { value: 'b1' } });

      // Enter student text with fee
      const textarea = screen.getByPlaceholderText(/Tanvir Ahmed, 01712345678, 2500/i);
      fireEvent.change(textarea, { target: { value: 'Tanvir Ahmed, 01712345678, 2500' } });

      // Click import button
      fireEvent.click(screen.getByText('Import Students'));

      expect(mockSaveStudent).toHaveBeenCalledWith({
        name: 'Tanvir Ahmed',
        phone: '01712345678',
        batchId: 'b1',
        active: true,
      });

      expect(mockSaveContract).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 'new-s1',
          fee: 2500,
          cycleType: 'months',
          status: 'active',
        })
      );
    });
  });

  describe('StudentModal - Schedule Sync from scheduleDays', () => {
    it('replaces the default Saturday slot when a new student is saved with scheduleDays and scheduleTime', () => {
      const mockSaveStudent = vi.fn().mockReturnValue('student-1');

      const mockStore = {
        state: {
          students: [],
        },
        billingState: { plan: 'pro' },
        user: { email: 'test@tutor.com' },
        saveStudent: mockSaveStudent,
        toast: vi.fn(),
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      render(<StudentModal isOpen={true} onClose={vi.fn()} />);

      // Enter name
      const nameInput = screen.getByPlaceholderText("Student's full name");
      fireEvent.change(nameInput, { target: { value: 'Rahim Khan' } });

      // Toggle Sun and Tue
      const sunCheck = screen.getByLabelText('Sun');
      const tueCheck = screen.getByLabelText('Tue');
      fireEvent.click(sunCheck);
      fireEvent.click(tueCheck);

      // Enter scheduleTime
      const timeInput = screen.getByLabelText(/Schedule Time/i);
      fireEvent.change(timeInput, { target: { value: '18:30' } });

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: 'Add student' }));

      expect(mockSaveStudent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Rahim Khan',
          scheduleDays: ['Sun', 'Tue'],
          scheduleTime: '18:30',
          schedule: [
            { day: 0, time: '18:30', duration: 60 },
            { day: 2, time: '18:30', duration: 60 },
          ],
        })
      );
    });
  });

  describe('formatBdWhatsAppNumber', () => {
    it("returns '' for placeholder numbers like '017XXXXXXX' or short incomplete strings", () => {
      expect(formatBdWhatsAppNumber('017XXXXXXX')).toBe('');
      expect(formatBdWhatsAppNumber('017')).toBe('');
      expect(formatBdWhatsAppNumber('123456789')).toBe('');
      expect(formatBdWhatsAppNumber('01712345678')).toBe('8801712345678');
    });
  });
});
