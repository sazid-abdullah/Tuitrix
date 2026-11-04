/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ResultView } from '../views/ResultView';
import { ExamView, isQuestionAnswered } from '../views/ExamView';
import { StoreProvider, useStore } from '../store/context';
import * as context from '../store/context';
import { Question } from '../types';

const mockPublishShared = vi.fn((attempt, exam, meta) => Promise.resolve(attempt.id));
const mockFetchShared = vi.fn((resultId) => Promise.resolve<any>(null));

vi.mock('../services/firebase', () => ({
  app: {},
  auth: { currentUser: null },
  db: null,
  onAuthStateChanged: vi.fn((_auth, cb) => {
    cb(null);
    return () => {};
  }),
  resetUserPassword: vi.fn(),
  googleProvider: {},
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  fetchPricingConfig: vi.fn(() => Promise.resolve({ monthlyPriceBdt: 99, freeStudentLimit: 15 })),
  publishSharedExamResult: (attempt: any, exam: any, meta?: any) => mockPublishShared(attempt, exam, meta),
  fetchSharedExamResult: (resultId: string) => mockFetchShared(resultId),
}));

describe('isQuestionAnswered helper', () => {
  it('correctly detects answered and unanswered states for MCQ, CQ, and Written questions', () => {
    const mcqQ: Question = {
      id: 'q_mcq',
      n: '1',
      type: 'mcq',
      text: 'What is 2+2?',
      options: ['3', '4', '5'],
      answer: 1,
      marks: 1,
    };

    const cqQ: Question = {
      id: 'q_cq',
      n: '2',
      type: 'cq',
      stimulus: 'A car is accelerating...',
      parts: [
        { label: 'a', text: 'Define acceleration', marks: 1, answer: 'Rate of velocity change' },
        { label: 'b', text: 'Calculate force', marks: 2, answer: 'F = ma' },
      ],
    };

    const writtenQ: Question = {
      id: 'q_written',
      n: '3',
      type: 'written',
      text: 'State Newton first law',
      marks: 3,
      answer: 'Inertia principle',
    };

    // MCQ: 0 is a valid answer index
    expect(isQuestionAnswered(mcqQ, { q_mcq: 0 })).toBe(true);
    expect(isQuestionAnswered(mcqQ, { q_mcq: 1 })).toBe(true);
    expect(isQuestionAnswered(mcqQ, { q_mcq: undefined })).toBe(false);
    expect(isQuestionAnswered(mcqQ, {})).toBe(false);

    // CQ: should only be answered if at least one part has non-empty text
    expect(isQuestionAnswered(cqQ, {})).toBe(false);
    expect(isQuestionAnswered(cqQ, { q_cq: {} })).toBe(false);
    expect(isQuestionAnswered(cqQ, { q_cq: { 0: '', 1: '   ' } })).toBe(false);
    expect(isQuestionAnswered(cqQ, { q_cq: { 0: 'Rate of velocity change', 1: '' } })).toBe(true);
    expect(isQuestionAnswered(cqQ, { q_cq: { 1: 'F = ma' } })).toBe(true);

    // Written: should only be answered if text is non-empty
    expect(isQuestionAnswered(writtenQ, {})).toBe(false);
    expect(isQuestionAnswered(writtenQ, { q_written: '' })).toBe(false);
    expect(isQuestionAnswered(writtenQ, { q_written: '   ' })).toBe(false);
    expect(isQuestionAnswered(writtenQ, { q_written: 'Inertia principle' })).toBe(true);
  });
});

describe('ExamView Question Overview CQ Answered Status', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('marks CQ questions as unanswered in Question Overview modal when parts are empty strings', () => {
    const mockExam = {
      id: 'exam_cq_test',
      title: 'Physics Test',
      duration: 30,
      createdAt: '2026-11-04T10:00:00Z',
      questions: [
        {
          id: 'q_cq_1',
          n: 1,
          type: 'cq' as const,
          stimulus: 'Motion problem',
          parts: [{ label: 'a', text: 'Define speed', marks: 1, answer: 'd/t' }],
        },
      ],
    };

    const mockAttempt = {
      id: 'attempt_cq_test',
      examId: 'exam_cq_test',
      title: 'Physics Attempt',
      studentId: 'std_1',
      status: 'running' as const,
      startedAt: Date.now(),
      endsAt: Date.now() + 600000,
      answers: {
        q_cq_1: { 0: '   ' }, // Only whitespace typed
      },
      flags: [],
      scoreLogged: false,
    };

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        exams: [mockExam],
        attempts: [mockAttempt],
        students: [],
      },
      saveAttempt: vi.fn(),
      toast: vi.fn(),
    } as any);

    render(<ExamView attemptId="attempt_cq_test" onNavigate={mockNavigate} />);

    // Open Questions drawer modal
    const questionsBtn = screen.getByRole('button', { name: /Questions/i });
    fireEvent.click(questionsBtn);

    // Question button 1 in overview should NOT have 'done' class
    const q1Btn = screen.getByRole('button', { name: '1' });
    expect(q1Btn).toBeInTheDocument();
    expect(q1Btn.className).not.toContain('done');
  });
});

describe('ResultView AI Mark Mapping & Live Score Sync', () => {
  const mockNavigate = vi.fn();
  const mockAddExamScore = vi.fn();
  const mockSaveAttempt = vi.fn();
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockExam = {
    id: 'exam_sync_1',
    title: 'HSC Physics Exam',
    duration: 45,
    createdAt: '2026-11-04T10:00:00Z',
    questions: [
      {
        id: 'q_mcq_1',
        n: 1,
        type: 'mcq' as const,
        text: 'Unit of force?',
        options: ['Joule', 'Newton'],
        answer: 1,
        marks: 1,
      },
      {
        id: 'q_cq_1',
        n: 2,
        type: 'cq' as const,
        stimulus: 'Kinematics',
        parts: [
          { label: 'a', text: 'Define velocity', marks: 2, answer: 'Displacement / time' },
        ],
      },
      {
        id: 'q_written_1',
        n: 3,
        type: 'written' as const,
        text: 'State Newton third law',
        marks: 5,
        answer: 'Action and reaction are equal and opposite',
      },
    ],
  };

  const mockAttempt = {
    id: 'attempt_sync_1',
    examId: 'exam_sync_1',
    title: 'HSC Physics Attempt',
    studentId: 'std_sync_1',
    status: 'submitted' as const,
    startedAt: Date.now() - 3600000,
    endsAt: Date.now(),
    answers: {
      q_mcq_1: 1, // Correct MCQ -> 1 mark
      q_cq_1: { 0: 'Displacement divided by time' },
      q_written_1: 'Every action has equal opposite reaction',
    },
    marks: {},
    aiMarks: {
      'q_cq_1:0': { marks: 2, reason: 'Completely accurate definition' },
      'q_written_1:0': { marks: 4.5, reason: 'Well explained with law statement' },
    },
    scoreLogged: false,
  };

  const mockStudent = {
    id: 'std_sync_1',
    name: 'Tamim Iqbal',
    examScores: [],
    active: true,
  };

  it('populates marks for both cq and written questions on Use AI suggestions and updates Total Score', () => {
    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        exams: [mockExam],
        attempts: [mockAttempt],
        students: [mockStudent],
      },
      studentName: () => 'Tamim Iqbal',
      saveAttempt: mockSaveAttempt,
      deleteAttempt: vi.fn(),
      saveExam: vi.fn(),
      addExamScore: mockAddExamScore,
      toast: mockToast,
    } as any);

    render(<ResultView attemptId="attempt_sync_1" onNavigate={mockNavigate} />);

    // Initially: MCQ (1) + Written (0) = 1 / 8
    expect(screen.getByText('1 / 8')).toBeInTheDocument();

    // Click "Use AI suggestions"
    const useAiBtn = screen.getByRole('button', { name: /Use AI suggestions/i });
    fireEvent.click(useAiBtn);

    // Total Score should update to: 1 (MCQ) + 2 (CQ) + 4.5 (Written) = 7.5 / 8
    expect(screen.getByText('7.5 / 8')).toBeInTheDocument();

    // CQ input and Written input should be populated with AI marks
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs[0]).toHaveValue(2);
    expect(inputs[1]).toHaveValue(4.5);
  });

  it('re-syncs score to student profile on Save marks when attempt.scoreLogged is true', () => {
    const loggedAttempt = {
      ...mockAttempt,
      scoreLogged: true,
      marks: {
        'q_cq_1:0': 2,
        q_written_1: 4.5,
      },
    };

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        exams: [mockExam],
        attempts: [loggedAttempt],
        students: [mockStudent],
      },
      studentName: () => 'Tamim Iqbal',
      saveAttempt: mockSaveAttempt,
      deleteAttempt: vi.fn(),
      saveExam: vi.fn(),
      addExamScore: mockAddExamScore,
      toast: mockToast,
    } as any);

    render(<ResultView attemptId="attempt_sync_1" onNavigate={mockNavigate} />);

    // Change written question mark from 4.5 to 5
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[1], { target: { value: '5' } });

    // Click "Save marks"
    const saveBtn = screen.getByRole('button', { name: /Save marks/i });
    fireEvent.click(saveBtn);

    // Expect addExamScore to have been called with attempt.id and updated total (1 + 2 + 5 = 8)
    expect(mockAddExamScore).toHaveBeenCalledWith(
      'std_sync_1',
      expect.objectContaining({
        id: 'attempt_sync_1',
        studentId: 'std_sync_1',
        obtainedMarks: 8,
        totalMarks: 8,
        remarks: 'Completed via Interactive Exam (attempt:attempt_sync_1)',
      })
    );
  });

  it('guards handleAIMark when all typed responses are empty', () => {
    const emptyAttempt = {
      ...mockAttempt,
      answers: {
        q_mcq_1: 1,
        q_cq_1: { 0: '   ' },
        q_written_1: '',
      },
      aiMarks: {},
    };

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        exams: [mockExam],
        attempts: [emptyAttempt],
        students: [mockStudent],
      },
      studentName: () => 'Tamim Iqbal',
      saveAttempt: mockSaveAttempt,
      deleteAttempt: vi.fn(),
      saveExam: vi.fn(),
      addExamScore: mockAddExamScore,
      toast: mockToast,
    } as any);

    render(<ResultView attemptId="attempt_sync_1" onNavigate={mockNavigate} />);

    const suggestBtn = screen.getByRole('button', { name: /Suggest marks with AI/i });
    fireEvent.click(suggestBtn);

    expect(mockToast).toHaveBeenCalledWith('No typed answers to evaluate automatically.', 'info');
  });
});

describe('StoreContext deleteExamScore resets scoreLogged on attempts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('resets attempt.scoreLogged to false when the linked score is deleted', () => {
    const TestComponent: React.FC = () => {
      const { state, saveStudent, saveAttempt, addExamScore, deleteExamScore } = useStore();

      return (
        <div>
          <button
            onClick={() => {
              saveStudent({
                id: 'std_test',
                name: 'Test Student',
                phone: '01711111111',
              });
              saveAttempt({
                id: 'att_linked_1',
                examId: 'ex_1',
                studentId: 'std_test',
                title: 'Math Quiz',
                status: 'submitted',
                startedAt: Date.now(),
                endsAt: Date.now(),
                answers: {},
                marks: {},
                aiMarks: {},
                scoreLogged: true,
              });
              addExamScore('std_test', {
                id: 'att_linked_1',
                studentId: 'std_test',
                title: 'Math Quiz',
                subject: 'Math',
                date: '2026-11-04',
                obtainedMarks: 20,
                totalMarks: 25,
                remarks: 'Completed via Interactive Exam (attempt:att_linked_1)',
              });
            }}
          >
            Setup
          </button>
          <button
            onClick={() => {
              deleteExamScore('std_test', 'att_linked_1');
            }}
          >
            Delete Score
          </button>
          <div data-testid="attempt-status">
            {state.attempts.find(a => a.id === 'att_linked_1')?.scoreLogged ? 'Logged' : 'Not Logged'}
          </div>
        </div>
      );
    };

    render(
      <StoreProvider>
        <TestComponent />
      </StoreProvider>
    );

    // Run setup
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }));
    expect(screen.getByTestId('attempt-status').textContent).toBe('Logged');

    // Delete the exam score
    fireEvent.click(screen.getByRole('button', { name: 'Delete Score' }));
    // Attempt scoreLogged should now be reset to false ('Not Logged')
    expect(screen.getByTestId('attempt-status').textContent).toBe('Not Logged');
  });

  describe('ResultView Resilient Fallbacks & Shared Result Mode', () => {
    it('synthesizes fallback Exam when attempt.examId is missing from state.exams', () => {
      const mockNavigate = vi.fn();
      const mockState: any = {
        students: [{ id: 'std_1', name: 'Tanvir Ahmed' }],
        attempts: [
          {
            id: 'att_missing_ex',
            examId: 'non_existent_exam_id',
            title: 'Biology Chapter 2 Quiz',
            studentId: 'std_1',
            status: 'submitted',
            startedAt: Date.now(),
            endsAt: Date.now(),
            answers: {},
            marks: {},
            aiMarks: {},
          },
        ],
        exams: [], // No exams matching examId!
        settings: { tutorName: 'Master Tutor', currency: '৳' },
      };

      vi.spyOn(context, 'useStore').mockReturnValue({
        state: mockState,
        studentName: () => 'Tanvir Ahmed',
        saveAttempt: vi.fn(),
        deleteAttempt: vi.fn(),
        saveExam: vi.fn(),
        addExamScore: vi.fn(),
        toast: vi.fn(),
      } as any);

      render(<ResultView attemptId="att_missing_ex" onNavigate={mockNavigate} />);

      expect(screen.queryByText('Result not found.')).not.toBeInTheDocument();
      expect(screen.getByText('Biology Chapter 2 Quiz')).toBeInTheDocument();
      expect(screen.getByText('🔗 Share Result Link')).toBeInTheDocument();
    });

    it('fetches shared result and renders in read-only mode when attempt is not in state.attempts', async () => {
      const mockNavigate = vi.fn();
      const mockState: any = {
        students: [],
        attempts: [], // Not in local attempts!
        exams: [],
        settings: { tutorName: 'Tutor', currency: '৳' },
      };

      vi.spyOn(context, 'useStore').mockReturnValue({
        state: mockState,
        studentName: () => '',
        saveAttempt: vi.fn(),
        deleteAttempt: vi.fn(),
        saveExam: vi.fn(),
        addExamScore: vi.fn(),
        toast: vi.fn(),
      } as any);

      mockFetchShared.mockResolvedValueOnce({
        id: 'att_shared_public',
        attempt: {
          id: 'att_shared_public',
          title: 'Shared Higher Math Model Test',
          startedAt: 1730000000000,
          answers: { q1: 1 },
          marks: { q2: 5 },
          aiMarks: {},
        },
        exam: {
          id: 'ex_math',
          title: 'Higher Math',
          duration: 60,
          questions: [
            { id: 'q1', n: 1, type: 'mcq', text: 'sin(90)?', options: ['0', '1'], answer: 1, marks: 1 },
            { id: 'q2', n: 2, type: 'written', text: 'Prove identity', marks: 5 },
          ],
        },
        studentFirstName: 'Rahim',
        tutorName: 'Engr. Sazid',
      });

      render(<ResultView attemptId="att_shared_public" onNavigate={mockNavigate} />);

      // Verify shared data rendered
      const title = await screen.findByText('Shared Higher Math Model Test');
      expect(title).toBeInTheDocument();
      expect(screen.getByText('Shared Result (Read-Only)')).toBeInTheDocument();
      expect(screen.getByText(/Rahim/)).toBeInTheDocument();
      expect(screen.getByText(/Tutor: Engr. Sazid/)).toBeInTheDocument();

      // Read-only controls: editing buttons should be hidden
      expect(screen.queryByText('📈 Log Score to Student Profile')).not.toBeInTheDocument();
      expect(screen.queryByText('Delete result')).not.toBeInTheDocument();
      expect(screen.queryByText('🔗 Share Result Link')).not.toBeInTheDocument();
      expect(screen.queryByText('Save marks')).not.toBeInTheDocument();

      // Print should remain available
      expect(screen.getByText('🖨️ Print')).toBeInTheDocument();
    });

    it('copies result URL to clipboard when 🔗 Share Result Link is clicked', async () => {
      const mockNavigate = vi.fn();
      const mockToast = vi.fn();
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const mockState: any = {
        students: [{ id: 'std_2', name: 'Nabila Karim' }],
        attempts: [
          {
            id: 'att_local_share',
            examId: 'ex_local_share',
            title: 'English 1st Paper',
            studentId: 'std_2',
            startedAt: Date.now(),
            answers: {},
            marks: {},
            aiMarks: {},
          },
        ],
        exams: [
          {
            id: 'ex_local_share',
            title: 'English Exam',
            duration: 30,
            questions: [],
          },
        ],
        settings: { tutorName: 'Teacher Tanvir', currency: '৳' },
      };

      vi.spyOn(context, 'useStore').mockReturnValue({
        state: mockState,
        studentName: () => 'Nabila Karim',
        saveAttempt: vi.fn(),
        deleteAttempt: vi.fn(),
        saveExam: vi.fn(),
        addExamScore: vi.fn(),
        toast: mockToast,
      } as any);

      render(<ResultView attemptId="att_local_share" onNavigate={mockNavigate} />);

      const shareBtn = screen.getByText('🔗 Share Result Link');
      fireEvent.click(shareBtn);

      await act(async () => {});

      expect(mockPublishShared).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'att_local_share' }),
        expect.objectContaining({ id: 'ex_local_share' }),
        expect.objectContaining({ studentFirstName: 'Nabila Karim', tutorName: 'Teacher Tanvir' })
      );
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('#/result/att_local_share'));
      expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/copied to clipboard/i), 'success');
    });
  });
});
