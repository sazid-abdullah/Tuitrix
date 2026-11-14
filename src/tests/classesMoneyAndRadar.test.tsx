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
import { StudentsView, scheduleSummary } from '../views/StudentsView';
import { contractStatus, studentBalance } from '../store/contracts';
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

    it('passes time and duration to onLogLesson when clicking ✅ on a routine slot item', () => {
      const mockStudents = [
        {
          id: 's_routine',
          name: 'Routine Student',
          active: true,
          schedule: [{ day: 6, time: '09:30', duration: 90 }],
        },
      ];

      const mockBatches = [
        {
          id: 'b_routine',
          name: 'Routine Batch',
          active: true,
          studentIds: ['s_routine'],
          schedule: [{ day: 6, time: '11:15', duration: 75 }],
        },
      ];

      const mockStore = {
        state: {
          students: mockStudents,
          batches: mockBatches,
          lessons: [],
        },
        studentName: (id: string) => mockStudents.find(s => s.id === id)?.name || id,
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      const onLogLesson = vi.fn();

      render(
        <ClassesView
          onNavigate={vi.fn()}
          onLogLesson={onLogLesson}
        />
      );

      const routineTabBtn = screen.getByRole('button', { name: /Weekly Routine/i });
      fireEvent.click(routineTabBtn);

      const checkButtons = screen.getAllByRole('button', { name: '✅' });
      expect(checkButtons.length).toBeGreaterThanOrEqual(2);

      // Student check button
      fireEvent.click(checkButtons[0]);
      expect(onLogLesson).toHaveBeenCalledWith({
        studentId: 's_routine',
        time: '09:30',
        duration: 90,
      });

      // Batch check button
      fireEvent.click(checkButtons[1]);
      expect(onLogLesson).toHaveBeenCalledWith({
        batchId: 'b_routine',
        time: '11:15',
        duration: 75,
      });
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

    it('links contractId from student active contract on quick absent in HomeView', () => {
      const today = todayISO();
      const dow = new Date().getDay();
      const dayName = WEEKDAYS[dow];

      const mockStudent = {
        id: 's_absent_radar',
        name: 'Absent Radar Student',
        active: true,
        subjects: ['Math'],
        scheduleDays: [dayName],
        scheduleTime: '16:00',
      };

      const mockContracts = [
        {
          id: 'c_ended_radar',
          studentId: 's_absent_radar',
          status: 'ended',
          startDate: '2025-01-01',
        },
        {
          id: 'c_active_radar',
          studentId: 's_absent_radar',
          status: 'active',
          startDate: '2026-01-01',
        },
      ];

      const mockSaveLesson = vi.fn();

      const mockStore = {
        state: {
          students: [mockStudent],
          contracts: mockContracts,
          lessons: [],
          payments: [],
          batches: [],
          settings: { tutorName: 'Teacher', currency: '৳' },
          savedResources: [],
        },
        money: (n: number) => `৳${n}`,
        studentName: () => 'Absent Radar Student',
        saveLesson: mockSaveLesson,
        toast: vi.fn(),
        loadDemoData: vi.fn(),
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      render(
        <HomeView
          onNavigate={vi.fn()}
          onOpenLessonModal={vi.fn()}
          onOpenPaymentModal={vi.fn()}
          onOpenStudentModal={vi.fn()}
        />
      );

      const absentBtn = screen.getByRole('button', { name: /Absent/i });
      fireEvent.click(absentBtn);

      expect(mockSaveLesson).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 's_absent_radar',
          contractId: 'c_active_radar',
          status: 'absent',
          date: today,
          time: '16:00',
          subject: 'Math',
        })
      );
    });
  });

  describe('Contract Attribution, Schedule Summary & StudentsView Cycle Balance Badge', () => {
    it('credits payments with contractId: null matching studentId and contract date range in contractStatus and studentBalance', () => {
      const today = '2026-11-14';
      const contract = {
        id: 'c_unlinked',
        studentId: 'std_unlinked',
        title: 'Tuition',
        fee: 4000,
        cycleType: 'classes' as const,
        cycleLength: 4,
        billing: 'end' as const,
        startDate: '2026-11-01',
        status: 'active' as const,
      };

      const lessons = [
        { id: 'l1', studentId: 'std_unlinked', contractId: 'c_unlinked', date: '2026-11-02', status: 'taught' as const },
        { id: 'l2', studentId: 'std_unlinked', contractId: 'c_unlinked', date: '2026-11-04', status: 'taught' as const },
        { id: 'l3', studentId: 'std_unlinked', contractId: 'c_unlinked', date: '2026-11-06', status: 'taught' as const },
        { id: 'l4', studentId: 'std_unlinked', contractId: 'c_unlinked', date: '2026-11-08', status: 'taught' as const },
      ];

      // Payment has contractId: null (e.g. from BatchFeeModal or quick unassigned payment)
      const payments = [
        { id: 'p_unassigned', studentId: 'std_unlinked', contractId: null as any, amount: 4000, date: '2026-11-09' },
      ];

      const st = contractStatus(contract, lessons, payments, today);
      expect(st.completed).toBe(1);
      expect(st.billed).toBe(4000);
      expect(st.paid).toBe(4000);
      expect(st.balance).toBe(0);

      const bal = studentBalance('std_unlinked', [contract], lessons, payments);
      expect(bal).toBe(0);
    });

    it('formats scheduleDays and scheduleTime when schedule array is empty or undefined in scheduleSummary', () => {
      const studentDaysAndTime = {
        id: 's_days_time',
        name: 'Days Student',
        scheduleDays: ['Sun', 'Tue', 'Thu'],
        scheduleTime: '16:30',
      };

      const studentDaysOnly = {
        id: 's_days_only',
        name: 'Days Only Student',
        scheduleDays: ['Fri'],
      };

      const studentNoSchedule = {
        id: 's_none',
        name: 'No Schedule Student',
      };

      expect(scheduleSummary(studentDaysAndTime as any)).toBe('Sun, Tue, Thu · 4:30 PM');
      expect(scheduleSummary(studentDaysOnly as any)).toBe('Fri');
      expect(scheduleSummary(studentNoSchedule as any)).toBe('No fixed schedule');
    });

    it('displays the Owes balance badge alongside or on cycle completion when bal > 0.005 in StudentsView', () => {
      const mockStudents = [
        {
          id: 's_cycle_due',
          name: 'Cycle Due Student',
          active: true,
          grade: 'Class 9',
        },
        {
          id: 's_in_progress_due',
          name: 'Progress Due Student',
          active: true,
          grade: 'Class 10',
        },
      ];

      // Student 1: 4 classes cycle, 4 classes taught (st.completed = 1, st.progress = 0), fee = 3000, 0 paid -> bal = 3000
      // Cycle complete, payment due
      const c1 = {
        id: 'c1',
        studentId: 's_cycle_due',
        title: 'Tuition 1',
        fee: 3000,
        cycleType: 'classes' as const,
        cycleLength: 4,
        billing: 'end' as const,
        startDate: '2026-11-01',
        status: 'active' as const,
      };

      const l1 = [
        { id: 'l1', studentId: 's_cycle_due', contractId: 'c1', date: '2026-11-02', status: 'taught' as const },
        { id: 'l2', studentId: 's_cycle_due', contractId: 'c1', date: '2026-11-04', status: 'taught' as const },
        { id: 'l3', studentId: 's_cycle_due', contractId: 'c1', date: '2026-11-06', status: 'taught' as const },
        { id: 'l4', studentId: 's_cycle_due', contractId: 'c1', date: '2026-11-08', status: 'taught' as const },
      ];

      // Student 2: 4 classes cycle, 5 classes taught (st.completed = 1, 1 in cycle 2 -> progress = 25%), fee = 2000, 0 paid -> bal = 2000
      const c2 = {
        id: 'c2',
        studentId: 's_in_progress_due',
        title: 'Tuition 2',
        fee: 2000,
        cycleType: 'classes' as const,
        cycleLength: 4,
        billing: 'end' as const,
        startDate: '2026-11-01',
        status: 'active' as const,
      };

      const l2 = [
        { id: 'l2_1', studentId: 's_in_progress_due', contractId: 'c2', date: '2026-11-02', status: 'taught' as const },
        { id: 'l2_2', studentId: 's_in_progress_due', contractId: 'c2', date: '2026-11-04', status: 'taught' as const },
        { id: 'l2_3', studentId: 's_in_progress_due', contractId: 'c2', date: '2026-11-06', status: 'taught' as const },
        { id: 'l2_4', studentId: 's_in_progress_due', contractId: 'c2', date: '2026-11-08', status: 'taught' as const },
        { id: 'l2_5', studentId: 's_in_progress_due', contractId: 'c2', date: '2026-11-10', status: 'taught' as const },
      ];

      const mockStore = {
        state: {
          students: mockStudents,
          contracts: [c1, c2],
          lessons: [...l1, ...l2],
          payments: [],
          batches: [],
          settings: { tutorName: 'Teacher', currency: '৳' },
        },
        money: (n: number) => `৳${Number(n).toLocaleString()}`,
      };

      vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

      render(
        <StudentsView
          onNavigate={vi.fn()}
          onOpenStudentModal={vi.fn()}
        />
      );

      // Student 1 should render Cycle Complete AND Owes ৳3,000
      expect(screen.getByText(/🎉 Cycle Complete · Payment Due!/i)).toBeInTheDocument();
      expect(screen.getByText('Owes ৳3,000')).toBeInTheDocument();

      // Student 2 should render 1 / 4 classes progress AND Owes ৳2,000
      expect(screen.getAllByText((_content, element) => element?.textContent?.replace(/\s+/g, ' ').trim() === '1 / 4 classes').length).toBeGreaterThan(0);
      expect(screen.getByText('Owes ৳2,000')).toBeInTheDocument();
    });
  });
});
