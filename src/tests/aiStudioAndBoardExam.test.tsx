/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { examPrompt, examMarks } from '../services/ai';
import { AIView } from '../views/AIView';
import * as context from '../store/context';

vi.mock('../services/firebase', () => ({
  app: {},
  auth: { currentUser: { email: 'tutor@test.com' } },
  db: null,
  onAuthStateChanged: vi.fn((_auth, cb) => {
    cb({ email: 'tutor@test.com' });
    return () => {};
  }),
  resetUserPassword: vi.fn(),
  googleProvider: {},
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  fetchPricingConfig: vi.fn(() => Promise.resolve({ monthlyPriceBdt: 99, freeStudentLimit: 15 })),
}));

describe('examPrompt Board & Custom Formats', () => {
  it('wires board format instructions and computes total marks accurately for board, cq, and mcq formats', () => {
    // 1. Board format: MCQ + CQ
    const boardPrompt = examPrompt({
      format: 'board',
      grade: 'HSC',
      subject: 'Physics',
      topics: 'Vector & Dynamics',
      cqCount: 8,
      cqAnswer: 5,
      mcqCount: 25,
      duration: 150,
    });
    expect(boardPrompt).toContain('25 Multiple Choice Questions (1 mark each) and 8 Creative Questions (সৃজনশীল / CQ with stimulus and a, b, c, d parts totaling 10 marks each, student answers any 5)');
    expect(boardPrompt).toContain('Total marks: 75'); // 5 * 10 + 25 = 75

    // 2. CQ format only
    const cqPrompt = examPrompt({
      format: 'cq',
      grade: 'Class 10',
      subject: 'Higher Math',
      cqCount: 6,
      cqAnswer: 4,
    });
    expect(cqPrompt).toContain('6 Creative Questions (student answers any 4, 10 marks each)');
    expect(cqPrompt).toContain('Total marks: 40'); // 4 * 10 = 40

    // 3. MCQ format only
    const mcqPrompt = examPrompt({
      format: 'mcq',
      grade: 'Class 9',
      subject: 'Biology',
      mcqCount: 30,
    });
    expect(mcqPrompt).toContain('30 Multiple Choice Questions (1 mark each)');
    expect(mcqPrompt).toContain('Total marks: 30');

    // 4. Custom format with custom marks
    const customPrompt = examPrompt({
      format: 'custom',
      subject: 'English',
      marks: 50,
      types: ['Short answer', 'Broad questions'],
    });
    expect(customPrompt).toContain('Question types: Short answer, Broad questions');
    expect(customPrompt).toContain('Total marks: 50');
  });
});

describe('AIView URL Hash Deep-Linking & Board Format Controls', () => {
  const mockNavigate = vi.fn();
  const mockStartExam = vi.fn();
  const mockUploadPaper = vi.fn();
  const mockImportDoc = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('parses #/ai/tool=exam&student=<id> to switch to exam tool and prefill student details', async () => {
    window.location.hash = '#/ai/tool=exam&student=std_chem_1';

    const mockStudent = {
      id: 'std_chem_1',
      name: 'Nafis Iqbal',
      grade: 'Class 10',
      curriculum: 'National Curriculum',
      subjects: ['Chemistry'],
    };

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        settings: { tutorName: 'Master Tutor' },
        profile: { brandTitle: 'Apex Academy' },
        students: [mockStudent],
        lessons: [],
        docs: [],
        savedResources: [],
        attempts: [],
        ai: { provider: 'gemini', keys: { gemini: 'test_key' }, models: {} },
      },
      user: { email: 'master@tutor.com' },
      billingState: null,
      saveDoc: vi.fn(),
      deleteDoc: vi.fn(),
      saveAiResource: vi.fn(),
      deleteAiResource: vi.fn(),
      toggleFavoriteAiResource: vi.fn(),
      studentName: () => 'Nafis Iqbal',
      toast: vi.fn(),
      setState: vi.fn(),
    } as any);

    render(
      <AIView
        onNavigate={mockNavigate}
        onStartExam={mockStartExam}
        onUploadPaper={mockUploadPaper}
        onImportDoc={mockImportDoc}
      />
    );

    // Exam tool tab should be active
    const examTab = screen.getByRole('button', { name: /^Exam paper$/i });
    expect(examTab).toHaveClass('active');

    // Student fields should be prefilled
    const gradeInput = screen.getByLabelText(/Class \/ Grade/i);
    expect(gradeInput).toHaveValue('Class 10');

    const subjectInput = screen.getByLabelText(/Subject \*/i);
    expect(subjectInput).toHaveValue('Chemistry');

    // Change format to board
    const formatSelect = screen.getByLabelText(/Paper format/i);
    fireEvent.change(formatSelect, { target: { value: 'board' } });

    // Expect board inputs for CQ Count, CQs to Answer, and MCQ Count to appear
    expect(screen.getByLabelText(/^CQ Count/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/CQs to Answer/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/MCQ Count/i)).toBeInTheDocument();
    // Default: 5 CQs * 10 + 25 MCQs = 75 marks
    expect(screen.getByText(/Total Board Marks: 75/i)).toBeInTheDocument();
  });
});

describe('AIView handleSaveResult & onStartExam Deterministic ID Reuse', () => {
  const mockNavigate = vi.fn();
  const mockStartExam = vi.fn();
  const mockSaveDoc = vi.fn();
  const mockSaveAiResource = vi.fn();
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('recognizes owner email as pro for unlimited resources and saves exam paper', async () => {
    let savedId: string | null = null;
    mockSaveDoc.mockImplementation((doc: any) => {
      savedId = doc.id;
      return doc.id;
    });

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        settings: { tutorName: 'Master Tutor' },
        profile: { brandTitle: 'Apex Academy' },
        students: [{ id: 'std_1', name: 'Student 1' }],
        lessons: [],
        docs: [],
        savedResources: [],
        attempts: [],
        ai: { provider: 'gemini', keys: { gemini: 'test_key' }, models: {} },
      },
      user: { email: 'abdullahsazid109@gmail.com' }, // Owner pro
      billingState: null,
      saveDoc: mockSaveDoc,
      deleteDoc: vi.fn(),
      saveAiResource: mockSaveAiResource,
      deleteAiResource: vi.fn(),
      toggleFavoriteAiResource: vi.fn(),
      studentName: () => 'Student 1',
      toast: mockToast,
      setState: vi.fn(),
    } as any);

    const aiServices = await import('../services/ai');
    vi.spyOn(aiServices, 'callAI').mockResolvedValue('## Section A: MCQs\n1. What is force?\n\n--- \n## Answer Key\n1. Newton');

    render(
      <AIView
        initialTool="exam"
        onNavigate={mockNavigate}
        onStartExam={mockStartExam}
        onUploadPaper={vi.fn()}
        onImportDoc={vi.fn()}
      />
    );

    const subjectInput = screen.getByLabelText(/Subject \*/i);
    fireEvent.change(subjectInput, { target: { value: 'Physics' } });

    const generateBtn = screen.getByRole('button', { name: /Generate exam paper/i });
    fireEvent.click(generateBtn);

    // Wait for generated result container to display "Save" button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    expect(mockSaveDoc).toHaveBeenCalled();
    expect(mockSaveAiResource).toHaveBeenCalled();
    expect(savedId).toBeTruthy();
  });

  it('clicking Start exam on unsaved generated exam invokes saveDoc and passes exact doc to onStartExam', async () => {
    let savedId: string | null = null;
    mockSaveDoc.mockImplementation((doc: any) => {
      savedId = doc.id;
      return doc.id;
    });

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        settings: { tutorName: 'Master Tutor' },
        profile: { brandTitle: 'Apex Academy' },
        students: [{ id: 'std_1', name: 'Student 1' }],
        lessons: [],
        docs: [],
        savedResources: [],
        attempts: [],
        ai: { provider: 'gemini', keys: { gemini: 'test_key' }, models: {} },
      },
      user: { email: 'abdullahsazid109@gmail.com' },
      billingState: null,
      saveDoc: mockSaveDoc,
      deleteDoc: vi.fn(),
      saveAiResource: mockSaveAiResource,
      deleteAiResource: vi.fn(),
      toggleFavoriteAiResource: vi.fn(),
      studentName: () => 'Student 1',
      toast: mockToast,
      setState: vi.fn(),
    } as any);

    // Mock callAI import dynamically for this test
    const aiServices = await import('../services/ai');
    vi.spyOn(aiServices, 'callAI').mockResolvedValue('## Section A: MCQs\n1. What is force?\n\n--- \n## Answer Key\n1. Newton');

    render(
      <AIView
        initialTool="exam"
        onNavigate={mockNavigate}
        onStartExam={mockStartExam}
        onUploadPaper={vi.fn()}
        onImportDoc={vi.fn()}
      />
    );

    const subjectInput = screen.getByLabelText(/Subject \*/i);
    fireEvent.change(subjectInput, { target: { value: 'Physics' } });

    const generateBtn = screen.getByRole('button', { name: /Generate exam paper/i });
    fireEvent.click(generateBtn);

    // Wait for generated result container to display "Start exam" button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start exam' })).toBeInTheDocument();
    });

    const startExamBtn = screen.getByRole('button', { name: 'Start exam' });
    fireEvent.click(startExamBtn);

    // 1. Verify saveDoc was called
    expect(mockSaveDoc).toHaveBeenCalled();
    expect(savedId).toBeTruthy();

    // 2. Verify onStartExam received the exact same SavedDoc with the same ID
    expect(mockStartExam).toHaveBeenCalledWith(
      expect.objectContaining({
        id: savedId,
        type: 'exam',
      })
    );
  });
});
