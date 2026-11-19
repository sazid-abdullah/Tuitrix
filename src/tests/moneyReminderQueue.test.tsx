/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoneyView } from '../views/MoneyView';
import * as context from '../store/context';

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

describe('MoneyView Bulk WhatsApp Fee Reminder Queue', () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    window.open = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders overdue contracts, opens queue, sends sequential reminders in BN with payment note, and supports copy', () => {
    const mockStudents = [
      { id: 's1', name: 'Rahim Ahmed', phone: '01711-223344', active: true },
      { id: 's2', name: 'Nusrat Jahan', guardianPhone: '01812-334455', active: true },
    ];

    const mockContracts = [
      {
        id: 'c1',
        studentId: 's1',
        title: 'Math Special',
        fee: 5000,
        cycleType: 'months' as const,
        cycleLength: 1,
        billing: 'start' as const,
        startDate: '2026-11-01',
        status: 'active' as const,
      },
      {
        id: 'c2',
        studentId: 's2',
        title: 'Physics HSC',
        fee: 4000,
        cycleType: 'months' as const,
        cycleLength: 1,
        billing: 'start' as const,
        startDate: '2026-11-01',
        status: 'active' as const,
      },
    ];

    const mockStore = {
      state: {
        students: mockStudents,
        batches: [],
        contracts: mockContracts,
        payments: [],
        expenses: [],
        goals: [],
        lessons: [],
        settings: { currency: '৳', tutorName: 'Sazid Sir' },
      },
      money: (n: number) => `৳${Number(n).toLocaleString()}`,
      studentName: (id: string) => mockStudents.find(s => s.id === id)?.name || id,
      downloadFile: vi.fn(),
      toast: vi.fn(),
      billingState: null,
      user: { email: 'tutor@test.com' },
    };

    vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

    render(
      <MoneyView
        onNavigate={vi.fn()}
        onRecordPayment={vi.fn()}
        onAddExpense={vi.fn()}
        onAddGoal={vi.fn()}
        onDepositGoal={vi.fn()}
      />
    );

    // Initial state: "Who owes you" has WhatsApp Queue (2) button
    const queueToggleBtn = screen.getByRole('button', { name: /WhatsApp Queue \(2\)/i });
    expect(queueToggleBtn).toBeInTheDocument();

    // Click to open queue
    fireEvent.click(queueToggleBtn);
    expect(screen.getByText('Hide Queue')).toBeInTheDocument();

    // Initial progress
    expect(screen.getByText('Sent 0 / 2')).toBeInTheDocument();

    // Switch language to BN
    const bnBtn = screen.getByRole('button', { name: 'BN' });
    fireEvent.click(bnBtn);

    // Enter payment note
    const noteInput = screen.getByPlaceholderText(/Optional: bKash\/Nagad number or payment note/i);
    fireEvent.change(noteInput, { target: { value: 'bKash Personal: 01700000000' } });

    // Send Next (1st click - Rahim Ahmed with ৳5000 due)
    const sendNextBtn = screen.getByRole('button', { name: 'Send Next' });
    fireEvent.click(sendNextBtn);

    expect(window.open).toHaveBeenCalledTimes(1);
    const firstCallUrl = (window.open as any).mock.calls[0][0];
    expect(firstCallUrl).toContain('https://wa.me/8801711223344?text=');
    const decodedFirst = decodeURIComponent(firstCallUrl);
    expect(decodedFirst).toContain('Rahim Ahmed');
    expect(decodedFirst).toContain('Math Special');
    expect(decodedFirst).toContain('৳5000');
    expect(decodedFirst).toContain('বকেয়া টিউশন ফি');
    expect(decodedFirst).toContain('bKash Personal: 01700000000');
    expect(decodedFirst).toContain('Sazid Sir');

    // Progress updates to 1 / 2
    expect(screen.getByText('Sent 1 / 2')).toBeInTheDocument();

    // Send Next (2nd click - Nusrat Jahan with ৳4000 due)
    fireEvent.click(sendNextBtn);

    expect(window.open).toHaveBeenCalledTimes(2);
    const secondCallUrl = (window.open as any).mock.calls[1][0];
    expect(secondCallUrl).toContain('https://wa.me/8801812334455?text=');
    const decodedSecond = decodeURIComponent(secondCallUrl);
    expect(decodedSecond).toContain('Nusrat Jahan');
    expect(decodedSecond).toContain('Physics HSC');
    expect(decodedSecond).toContain('৳4000');
    expect(decodedSecond).toContain('বকেয়া টিউশন ফি');

    // Progress updates to 2 / 2 and Send Next is disabled
    expect(screen.getByText('Sent 2 / 2')).toBeInTheDocument();
    expect(sendNextBtn).toBeDisabled();

    // Verify Copy button functionality
    const copyButtons = screen.getAllByRole('button', { name: 'Copy' });
    expect(copyButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(copyButtons[0]);

    expect(writeTextMock).toHaveBeenCalled();
    const copiedText = writeTextMock.mock.calls[0][0];
    expect(copiedText).toContain('Rahim Ahmed');
    expect(copiedText).toContain('৳5000');
  });
});
