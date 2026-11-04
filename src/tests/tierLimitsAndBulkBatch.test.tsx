/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { getFreeStudentLimit, canAddStudent, isProUser, FREE_TIER_MAX_BATCHES } from '../utils/tierLimits';
import { StudentModal } from '../components/StudentModal';
import { BulkStudentModal } from '../components/BulkStudentModal';
import { BatchModal } from '../components/BatchModal';
import * as context from '../store/context';

describe('tierLimits utility functions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('reads custom freeStudentLimit from tuitrix_pricing in localStorage', () => {
    localStorage.setItem('tuitrix_pricing', JSON.stringify({ freeStudentLimit: 8 }));
    expect(getFreeStudentLimit()).toBe(8);
  });

  it('falls back to default 15 if tuitrix_pricing is not present or invalid', () => {
    expect(getFreeStudentLimit()).toBe(15);
    localStorage.setItem('tuitrix_pricing', JSON.stringify({ freeStudentLimit: -5 }));
    expect(getFreeStudentLimit()).toBe(15);
    localStorage.setItem('tuitrix_pricing', 'invalid_json');
    expect(getFreeStudentLimit()).toBe(15);
  });

  it('correctly evaluates canAddStudent based on dynamic freeStudentLimit and pro status', () => {
    localStorage.setItem('tuitrix_pricing', JSON.stringify({ freeStudentLimit: 8 }));
    // Under limit for free user
    expect(canAddStudent(7, false)).toBe(true);
    // At or over limit for free user
    expect(canAddStudent(8, false)).toBe(false);
    expect(canAddStudent(9, false)).toBe(false);
    // Over limit but pro user
    expect(canAddStudent(8, true)).toBe(true);
    expect(canAddStudent(50, true)).toBe(true);
  });

  it('recognizes owner as pro user regardless of billingState', () => {
    expect(isProUser(null, 'abdullahsazid109@gmail.com')).toBe(true);
    expect(isProUser(null, 'ABDULLAHSAZID109@GMAIL.COM')).toBe(true);
    expect(isProUser(null, 'tutor@example.com')).toBe(false);
  });
});

describe('StudentModal Free Tier Enforcement', () => {
  const mockToast = vi.fn();
  const mockSaveStudent = vi.fn().mockReturnValue('student_new_1');
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('tuitrix_pricing', JSON.stringify({ freeStudentLimit: 5 }));
  });

  it('blocks creating a new student when active student limit is reached for free user', () => {
    const existingStudents = [
      { id: '1', name: 'S1', active: true },
      { id: '2', name: 'S2', active: true },
      { id: '3', name: 'S3', active: true },
      { id: '4', name: 'S4', active: true },
      { id: '5', name: 'S5', active: true },
      { id: '6', name: 'S6_archived', active: false }, // Archived should not count
    ];

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        students: existingStudents,
        batches: [],
      },
      billingState: null,
      user: { email: 'free_tutor@example.com' },
      saveStudent: mockSaveStudent,
      toast: mockToast,
    } as any);

    render(<StudentModal isOpen={true} onClose={mockOnClose} />);

    const nameInput = screen.getByLabelText(/Name \*/i);
    fireEvent.change(nameInput, { target: { value: 'New Student Over Limit' } });

    const submitBtn = screen.getByRole('button', { name: /Add student/i });
    fireEvent.click(submitBtn);

    expect(mockToast).toHaveBeenCalledWith(
      'Free tier is limited to 5 active students. Upgrade to Pro in Settings for unlimited students.',
      'error'
    );
    expect(mockSaveStudent).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('allows saving when user is Pro even if student limit is exceeded', () => {
    const existingStudents = [
      { id: '1', name: 'S1', active: true },
      { id: '2', name: 'S2', active: true },
      { id: '3', name: 'S3', active: true },
      { id: '4', name: 'S4', active: true },
      { id: '5', name: 'S5', active: true },
    ];

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        students: existingStudents,
        batches: [],
      },
      billingState: { plan: 'pro', proUntil: Date.now() + 100000 },
      user: { email: 'pro_tutor@example.com' },
      saveStudent: mockSaveStudent,
      toast: mockToast,
    } as any);

    render(<StudentModal isOpen={true} onClose={mockOnClose} />);

    const nameInput = screen.getByLabelText(/Name \*/i);
    fireEvent.change(nameInput, { target: { value: 'Pro Student' } });

    const submitBtn = screen.getByRole('button', { name: /Add student/i });
    fireEvent.click(submitBtn);

    expect(mockSaveStudent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Pro Student' })
    );
    expect(mockToast).toHaveBeenCalledWith('Student added', 'success');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('allows editing an existing student even when active student count is at limit', () => {
    const existingStudents = [
      { id: '1', name: 'S1', active: true },
      { id: '2', name: 'S2', active: true },
      { id: '3', name: 'S3', active: true },
      { id: '4', name: 'S4', active: true },
      { id: '5', name: 'S5', active: true },
    ];

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        students: existingStudents,
        batches: [],
      },
      billingState: null,
      user: { email: 'free_tutor@example.com' },
      saveStudent: mockSaveStudent,
      toast: mockToast,
    } as any);

    const existingStudent = { id: '1', name: 'S1', active: true };
    render(<StudentModal isOpen={true} student={existingStudent} onClose={mockOnClose} />);

    const nameInput = screen.getByLabelText(/Name \*/i);
    fireEvent.change(nameInput, { target: { value: 'S1 Updated' } });

    const submitBtn = screen.getByRole('button', { name: /Edit student|Save/i });
    fireEvent.click(submitBtn);

    expect(mockSaveStudent).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', name: 'S1 Updated' })
    );
    expect(mockToast).toHaveBeenCalledWith('Student saved', 'success');
  });
});

describe('BulkStudentModal Batch Linking & Limits', () => {
  const mockToast = vi.fn();
  let studentCounter = 1;
  const mockSaveStudent = vi.fn().mockImplementation((data: any) => {
    return `new_id_${studentCounter++}`;
  });
  const mockSaveBatch = vi.fn();
  const mockSaveContract = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    studentCounter = 1;
    localStorage.setItem('tuitrix_pricing', JSON.stringify({ freeStudentLimit: 10 }));
  });

  it('links imported students to target batch by updating batch.studentIds', () => {
    const existingBatch = {
      id: 'batch_alpha',
      name: 'Class 10 Physics',
      studentIds: ['existing_std_1'],
      active: true,
    };

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        students: [{ id: 'existing_std_1', name: 'Existing Student', active: true }],
        batches: [existingBatch],
      },
      billingState: null,
      user: { email: 'tutor@example.com' },
      saveStudent: mockSaveStudent,
      saveBatch: mockSaveBatch,
      saveContract: mockSaveContract,
      toast: mockToast,
    } as any);

    render(<BulkStudentModal isOpen={true} onClose={mockOnClose} />);

    // Select target batch
    const batchSelect = screen.getByLabelText(/Target Batch/i);
    fireEvent.change(batchSelect, { target: { value: 'batch_alpha' } });

    // Enter multiple students
    const textarea = screen.getByPlaceholderText(/Tanvir Ahmed/i);
    fireEvent.change(textarea, {
      target: {
        value: 'Tanvir Ahmed, 01712345678, 2500\nSadia Rahman, 01812345678, 2000',
      },
    });

    // Click Import Students
    const importBtn = screen.getByRole('button', { name: /Import Students/i });
    fireEvent.click(importBtn);

    expect(mockSaveStudent).toHaveBeenCalledTimes(2);
    expect(mockSaveStudent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Tanvir Ahmed', phone: '01712345678', batchId: 'batch_alpha' })
    );
    expect(mockSaveStudent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sadia Rahman', phone: '01812345678', batchId: 'batch_alpha' })
    );

    // Verify batch was updated with existing and new student IDs
    expect(mockSaveBatch).toHaveBeenCalledWith({
      ...existingBatch,
      studentIds: ['existing_std_1', 'new_id_1', 'new_id_2'],
    });

    expect(mockToast).toHaveBeenCalledWith('Successfully imported 2 students', 'success');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('blocks bulk import if active count + imported count exceeds freeStudentLimit', () => {
    const existingStudents = Array.from({ length: 9 }, (_, i) => ({
      id: `s_${i}`,
      name: `Student ${i}`,
      active: true,
    }));

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        students: existingStudents,
        batches: [],
      },
      billingState: null,
      user: { email: 'tutor@example.com' },
      saveStudent: mockSaveStudent,
      saveBatch: mockSaveBatch,
      saveContract: mockSaveContract,
      toast: mockToast,
    } as any);

    render(<BulkStudentModal isOpen={true} onClose={mockOnClose} />);

    const textarea = screen.getByPlaceholderText(/Tanvir Ahmed/i);
    fireEvent.change(textarea, {
      target: {
        value: 'Student 10, 01711111111\nStudent 11, 01722222222',
      },
    });

    const importBtn = screen.getByRole('button', { name: /Import Students/i });
    fireEvent.click(importBtn);

    expect(mockToast).toHaveBeenCalledWith(
      'Free tier limited to 10 students. Please upgrade to Pro to add more.',
      'error'
    );
    expect(mockSaveStudent).not.toHaveBeenCalled();
    expect(mockSaveBatch).not.toHaveBeenCalled();
  });
});

describe('BatchModal Free Tier Limit Enforcement', () => {
  const mockToast = vi.fn();
  const mockSaveBatch = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks creating a 3rd active batch for free tier user while allowing edit', () => {
    const existingBatches = [
      { id: 'b1', name: 'Batch 1', active: true, studentIds: [] },
      { id: 'b2', name: 'Batch 2', active: true, studentIds: [] },
      { id: 'b3_archived', name: 'Batch 3', active: false, studentIds: [] },
    ];

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        students: [],
        batches: existingBatches,
      },
      billingState: null,
      user: { email: 'free_tutor@example.com' },
      saveBatch: mockSaveBatch,
      deleteBatch: vi.fn(),
      toast: mockToast,
    } as any);

    render(<BatchModal isOpen={true} onClose={mockOnClose} />);

    const nameInput = screen.getByLabelText(/Batch Name \*/i);
    fireEvent.change(nameInput, { target: { value: 'Batch 3 Active' } });

    const submitBtn = screen.getByRole('button', { name: /Create batch/i });
    fireEvent.click(submitBtn);

    expect(mockToast).toHaveBeenCalledWith(
      `Free tier is limited to ${FREE_TIER_MAX_BATCHES} active batches. Upgrade to Pro in Settings for unlimited batches.`,
      'error'
    );
    expect(mockSaveBatch).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('allows creating a 3rd batch if user is Pro', () => {
    const existingBatches = [
      { id: 'b1', name: 'Batch 1', active: true, studentIds: [] },
      { id: 'b2', name: 'Batch 2', active: true, studentIds: [] },
    ];

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        students: [],
        batches: existingBatches,
      },
      billingState: { plan: 'pro', proUntil: Date.now() + 100000 },
      user: { email: 'pro_tutor@example.com' },
      saveBatch: mockSaveBatch,
      deleteBatch: vi.fn(),
      toast: mockToast,
    } as any);

    render(<BatchModal isOpen={true} onClose={mockOnClose} />);

    const nameInput = screen.getByLabelText(/Batch Name \*/i);
    fireEvent.change(nameInput, { target: { value: 'Batch 3 Active' } });

    const submitBtn = screen.getByRole('button', { name: /Create batch/i });
    fireEvent.click(submitBtn);

    expect(mockSaveBatch).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Batch 3 Active' })
    );
    expect(mockToast).toHaveBeenCalledWith('Batch created', 'success');
    expect(mockOnClose).toHaveBeenCalled();
  });
});
