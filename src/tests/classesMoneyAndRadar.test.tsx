/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ClassesView } from '../views/ClassesView';
import { MoneyView } from '../views/MoneyView';
import { HomeView } from '../views/HomeView';
import * as context from '../store/context';
import { todayISO, WEEKDAYS, fmtTime } from '../utils/date';

vi.mock('../services/firebase', () => ({
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
}));

describe('ClassesView, MoneyView, and HomeView Integration Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ClassesView - Weekly Routine Slot Support & Batch Filtering', () => {
    it('displays students scheduled via s.schedule (day: 6) as well as s.scheduleDays, and filters by initialBatchFilter', () => {
      const mockStudents = [
        {
          id: 's1',
          name: 'Student Slot Sat',
          active: true,
          schedule: [{ day: 6, time: '10:00', duration: 60 }],
        },
        {
          id: 's2',
          name: 'Student Days Sat',
          active: true,
          scheduleDays: ['Sat'],
          scheduleTime: '11:00',
        },
        {
          id: 's3',
          name: 'Batch Member Student',
          active: true,
          batchId: 'b1',
        },
      ];

      const mockBatches = [
        {
          id: 'b1',
          name: 'Physics Batch A',
          active: true,
          studentIds: ['s3'],
          scheduleDays: ['Sat'],
          scheduleTime: '12:00',
        },
        {
          id: 'b2',
          name: 'Chemistry Batch B',
          active: true,
          studentIds: [],
          scheduleDays: ['Sat'],
          scheduleTime: '14:00',
        },
      ];

      const mockStore = {
        state: {
          students: mockStudents,
          batches: mockBatches,
          lessons: [],
        },
        studentName: (id: string) => mockStudents.find(s => s.id === id)?.name || id,
        billingState: null,
        user: null,
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      // 1. Render without batch filter and switch to routine view
      const { unmount } = render(
        <ClassesView
          onNavigate={vi.fn()}
          onLogLesson={vi.fn()}
        />
      );

      const routineTabBtn = screen.getByRole('button', { name: /Weekly Routine/i });
      fireEvent.click(routineTabBtn);

      // Verify that both s.schedule (day 6 = Sat) and s.scheduleDays ('Sat') are rendered
      expect(screen.getByText('Student Slot Sat')).toBeInTheDocument();
      expect(screen.getByText('Student Days Sat')).toBeInTheDocument();
      expect(screen.getByText('Physics Batch A')).toBeInTheDocument();
      expect(screen.getByText('Chemistry Batch B')).toBeInTheDocument();

      unmount();

      // 2. Render with initialBatchFilter="b1"
      render(
        <ClassesView
          initialBatchFilter="b1"
          onNavigate={vi.fn()}
          onLogLesson={vi.fn()}
        />
      );

      const routineTabBtnFiltered = screen.getByRole('button', { name: /Weekly Routine/i });
      fireEvent.click(routineTabBtnFiltered);

      // b1 is shown
      expect(screen.getByText('Physics Batch A')).toBeInTheDocument();
      // b2 should be filtered out
      expect(screen.queryByText('Chemistry Batch B')).not.toBeInTheDocument();
      // s1 and s2 (not belonging to b1) should be filtered out
      expect(screen.queryByText('Student Slot Sat')).not.toBeInTheDocument();
      expect(screen.queryByText('Student Days Sat')).not.toBeInTheDocument();
    });
  });

  describe('MoneyView - Batch Revenue Attribution & isPro Detection', () => {
    it('accurately attributes payments from students in batch.studentIds to Batch Tuition and unlocks Pro Analytics for owner email', () => {
      const today = todayISO();
      const mockStudents = [
        { id: 's1', name: 'Rahim Batch Member', active: true },
        { id: 's2', name: 'Karim Solo', active: true },
      ];

      const mockBatches = [
        { id: 'b1', name: 'HSC Batch', studentIds: ['s1'], active: true },
      ];

      const mockContracts = [
        { id: 'c1', studentId: 's1', fee: 5000, cycleType: 'months', cycleLength: 1, billingType: 'start', startDate: '2026-11-01', status: 'active', title: 'Batch Contract' },
        { id: 'c2', studentId: 's2', fee: 3000, cycleType: 'months', cycleLength: 1, billingType: 'start', startDate: '2026-11-01', status: 'active', title: 'Solo Contract' },
      ];

      const mockPayments = [
        // s1 payment has NO contractId (null) to test the fix that p.contractId is not required
        { id: 'p1', studentId: 's1', contractId: null as any, amount: 5000, date: today, method: 'bKash' },
        // s2 payment
        { id: 'p2', studentId: 's2', contractId: 'c2', amount: 3000, date: today, method: 'Cash' },
      ];

      const mockStore = {
        state: {
          students: mockStudents,
          batches: mockBatches,
          contracts: mockContracts,
          payments: mockPayments,
          expenses: [],
          goals: [],
          lessons: [],
          settings: { currency: '৳' },
        },
        money: (n: number) => `৳${Number(n).toLocaleString()}`,
        studentName: (id: string) => mockStudents.find(s => s.id === id)?.name || id,
        downloadFile: vi.fn(),
        toast: vi.fn(),
        billingState: null,
        user: { email: 'abdullahsazid109@gmail.com' },
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      const { unmount } = render(
        <MoneyView
          onNavigate={vi.fn()}
          onRecordPayment={vi.fn()}
          onAddExpense={vi.fn()}
          onAddGoal={vi.fn()}
          onDepositGoal={vi.fn()}
        />
      );

      // Verify revenue split: Batch Tuition should reflect ৳5,000 (from s1 in batch.studentIds)
      const batchLabel = screen.getByText('Batch Tuition');
      expect(batchLabel.closest('.row')).toHaveTextContent('৳5,000');
      const soloLabel = screen.getByText('1-on-1 Tuition');
      expect(soloLabel.closest('.row')).toHaveTextContent('৳3,000');

      // Verify Pro Analytics is unlocked for owner email (no "Unlock Pro Analytics" button)
      expect(screen.queryByText('Unlock Pro Analytics')).not.toBeInTheDocument();
      expect(screen.queryByText('👑 PRO')).not.toBeInTheDocument();

      unmount();

      // Test with non-owner free user to confirm lock overlay appears
      mockStore.user = { email: 'user@example.com' };
      render(
        <MoneyView
          onNavigate={vi.fn()}
          onRecordPayment={vi.fn()}
          onAddExpense={vi.fn()}
          onAddGoal={vi.fn()}
          onDepositGoal={vi.fn()}
        />
      );

      expect(screen.getByText('Unlock Pro Analytics')).toBeInTheDocument();
      expect(screen.getByText('👑 PRO')).toBeInTheDocument();
    });
  });

  describe('HomeView - Tuition Radar Resolved Schedule Times', () => {
    it('displays s.scheduleTime or batch scheduleTime and passes resolved parameters on log', () => {
      const dow = new Date().getDay();
      const dayName = WEEKDAYS[dow];

      const mockStudents = [
        {
          id: 's1',
          name: 'Direct Schedule Student',
          active: true,
          scheduleDays: [dayName],
          scheduleTime: '15:30',
        },
        {
          id: 's2',
          name: 'Batch Schedule Student',
          active: true,
        },
      ];

      const mockBatches = [
        {
          id: 'b1',
          name: 'Science Batch',
          active: true,
          studentIds: ['s2'],
          scheduleDays: [dayName],
          scheduleTime: '17:00',
        },
      ];

      const mockStore = {
        state: {
          students: mockStudents,
          batches: mockBatches,
          lessons: [],
          payments: [],
          contracts: [],
          settings: { tutorName: 'Teacher Sazid', currency: '৳' },
          savedResources: [],
        },
        money: (n: number) => `৳${n}`,
        studentName: (id: string) => mockStudents.find(s => s.id === id)?.name || id,
        saveLesson: vi.fn(),
        toast: vi.fn(),
        loadDemoData: vi.fn(),
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      const onOpenLessonModal = vi.fn();

      render(
        <HomeView
          onNavigate={vi.fn()}
          onOpenLessonModal={onOpenLessonModal}
          onOpenPaymentModal={vi.fn()}
          onOpenStudentModal={vi.fn()}
        />
      );

      // Radar should be visible
      const radarHeading = screen.getByText(/Today's Tuition Radar/i);
      expect(radarHeading).toBeInTheDocument();
      const radarCard = radarHeading.closest('.card') as HTMLElement;

      // Direct student schedule time
      expect(within(radarCard).getByText('Direct Schedule Student')).toBeInTheDocument();
      expect(within(radarCard).getByText(fmtTime('15:30'))).toBeInTheDocument();

      // Batch student schedule time resolved from batch
      expect(within(radarCard).getByText('Batch Schedule Student')).toBeInTheDocument();
      expect(within(radarCard).getByText(fmtTime('17:00'))).toBeInTheDocument();

      // Click "+1 Log Today's Class" buttons inside Radar
      const logButtons = within(radarCard).getAllByRole('button', { name: /\+1 Log Today's Class/i });
      expect(logButtons.length).toBe(2);

      // First button corresponds to s1
      fireEvent.click(logButtons[0]);
      expect(onOpenLessonModal).toHaveBeenCalledWith({
        studentId: 's1',
        time: '15:30',
        duration: 60,
      });

      // Second button corresponds to s2
      fireEvent.click(logButtons[1]);
      expect(onOpenLessonModal).toHaveBeenCalledWith({
        studentId: 's2',
        time: '17:00',
        duration: 60,
      });
    });
  });
});
