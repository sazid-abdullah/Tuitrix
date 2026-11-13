/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ResultView } from '../views/ResultView';
import { ExamView, isQuestionAnswered } from '../views/ExamView';
import { StudentDetailView } from '../views/StudentDetailView';
import { ParentReportModal } from '../components/ParentReportModal';
import { StoreProvider, useStore, purgeDummyRecords } from '../store/context';
import * as context from '../store/context';
import { Question } from '../types';

const mockPublishShared = vi.fn((attempt, exam, meta) => Promise.resolve(attempt.id));
const mockFetchShared = vi.fn((resultId) => Promise.resolve<any>(null));
const mockPublishSharedPortal = vi.fn((portalId: string, snapshot: any) => Promise.resolve(portalId));
const mockFetchSharedPortal = vi.fn((portalId: string) => Promise.resolve<any>(null));

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
  publishSharedParentPortal: (portalId: string, snapshot: any) => mockPublishSharedPortal(portalId, snapshot),
  fetchSharedParentPortal: (portalId: string) => mockFetchSharedPortal(portalId),
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

  it('renders CQ part marks without raw asterisks and renders formatted mark badges', () => {
    const mockExam = {
      id: 'exam_cq_marks_test',
      title: 'Chemistry Exam',
      duration: 30,
      createdAt: '2026-11-04T10:00:00Z',
      questions: [
        {
          id: 'q_cq_marks',
          n: 1,
          type: 'cq' as const,
          stimulus: 'Chemical Reaction',
          parts: [
            { label: 'a', text: 'Define catalyst', marks: 2, answer: 'Rate booster' },
            { label: 'b', text: 'State Le Chatelier principle', marks: 3, answer: 'Equilibrium shift' },
          ],
        },
        {
          id: 'q_mcq_opts',
          n: 2,
          type: 'mcq' as const,
          text: 'What is water formula?',
          options: ['H2O', 'CO2'],
          answer: 0,
          marks: 1,
        },
      ],
    };

    const mockAttempt = {
      id: 'attempt_cq_marks',
      examId: 'exam_cq_marks_test',
      title: 'Chemistry Attempt',
      studentId: 'std_1',
      status: 'running' as const,
      startedAt: Date.now(),
      endsAt: Date.now() + 600000,
      answers: {},
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

    render(<ExamView attemptId="attempt_cq_marks" onNavigate={mockNavigate} />);

    // Check that part marks are rendered
    expect(screen.getByText('[2 marks]')).toBeInTheDocument();
    expect(screen.getByText('[3 marks]')).toBeInTheDocument();

    // Verify raw asterisks are not present in the DOM text
    const partElements = document.querySelectorAll('.exam-part .doc');
    expect(partElements.length).toBe(2);
    expect(partElements[0].textContent).not.toContain('*[');
    expect(partElements[0].textContent).not.toContain(']*');
    expect(partElements[1].textContent).not.toContain('*[');
    expect(partElements[1].textContent).not.toContain(']*');
  });

  it('syncs existing attempt.answers when switching or hydrating attemptId', () => {
    const mockExam = {
      id: 'exam_hydration_test',
      title: 'Math Exam',
      duration: 30,
      createdAt: '2026-11-04T10:00:00Z',
      questions: [
        {
          id: 'q_cq_hydrate',
          n: 1,
          type: 'cq' as const,
          stimulus: 'Geometry',
          parts: [{ label: 'a', text: 'Calculate hypotenuse', marks: 2, answer: '5' }],
        },
      ],
    };

    const attemptA = {
      id: 'attempt_A',
      examId: 'exam_hydration_test',
      title: 'Math Attempt A',
      studentId: 'std_A',
      status: 'running' as const,
      startedAt: Date.now(),
      endsAt: Date.now() + 600000,
      answers: {
        q_cq_hydrate: { 0: 'Student A Answer' },
      },
      flags: [],
      scoreLogged: false,
    };

    const attemptB = {
      id: 'attempt_B',
      examId: 'exam_hydration_test',
      title: 'Math Attempt B',
      studentId: 'std_B',
      status: 'running' as const,
      startedAt: Date.now(),
      endsAt: Date.now() + 600000,
      answers: {
        q_cq_hydrate: { 0: 'Student B Answer' },
      },
      flags: [],
      scoreLogged: false,
    };

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: {
        exams: [mockExam],
        attempts: [attemptA, attemptB],
        students: [],
      },
      saveAttempt: vi.fn(),
      toast: vi.fn(),
    } as any);

    const { rerender } = render(<ExamView attemptId="attempt_A" onNavigate={mockNavigate} />);

    // Verify Student A's answer is present
    const textarea = screen.getByPlaceholderText(/Write your answer here or solve on test paper/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Student A Answer');

    // Switch attemptId to attempt_B
    rerender(<ExamView attemptId="attempt_B" onNavigate={mockNavigate} />);

    // Verify answers synced to Student B's answer
    expect(textarea.value).toBe('Student B Answer');
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
      expect(screen.queryByRole('button', { name: /← Back to AI Assistant/i })).not.toBeInTheDocument();

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

  describe('Header Navigation & Exit Controls', () => {
    it('navigates back to AI Assistant results from ResultView header button', () => {
      const mockNavigate = vi.fn();
      const mockState: any = {
        students: [],
        attempts: [
          {
            id: 'att_back_test',
            examId: 'ex_back_test',
            title: 'Math Model Test',
            status: 'submitted',
            startedAt: Date.now(),
            answers: {},
            marks: {},
            aiMarks: {},
          },
        ],
        exams: [{ id: 'ex_back_test', title: 'Math Exam', duration: 30, questions: [] }],
        settings: { currency: '৳' },
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

      render(<ResultView attemptId="att_back_test" onNavigate={mockNavigate} />);

      const backBtn = screen.getByRole('button', { name: /← Back to AI Assistant/i });
      expect(backBtn).toBeInTheDocument();
      fireEvent.click(backBtn);

      expect(mockNavigate).toHaveBeenCalledWith('ai', 'tool=results');
    });

    it('renders exit button in ExamView and confirms exit to AI exam studio', () => {
      const mockNavigate = vi.fn();
      const mockState: any = {
        students: [],
        attempts: [
          {
            id: 'att_exit_test',
            examId: 'ex_exit_test',
            title: 'Biology Test',
            status: 'running',
            startedAt: Date.now(),
            endsAt: Date.now() + 600000,
            answers: {},
            flags: [],
          },
        ],
        exams: [
          {
            id: 'ex_exit_test',
            title: 'Biology Test',
            duration: 10,
            questions: [
              { id: 'q1', n: '1', type: 'mcq', text: 'Cell is?', options: ['A', 'B'], answer: 0, marks: 1 },
            ],
          },
        ],
      };

      vi.spyOn(context, 'useStore').mockReturnValue({
        state: mockState,
        saveAttempt: vi.fn(),
        toast: vi.fn(),
      } as any);

      render(<ExamView attemptId="att_exit_test" onNavigate={mockNavigate} />);

      const exitBtn = screen.getByRole('button', { name: /← Exit Exam/i });
      expect(exitBtn).toBeInTheDocument();
      fireEvent.click(exitBtn);

      // Confirm modal opens
      expect(screen.getByText('Exit exam?')).toBeInTheDocument();
      const confirmBtn = screen.getByRole('button', { name: /^Exit Exam$/i });
      fireEvent.click(confirmBtn);

      expect(mockNavigate).toHaveBeenCalledWith('ai', 'tool=exam');
    });
  });

  describe('ResultView Enhancements and Live Marks Sharing', () => {
    it('renders q.figure on written and CQ questions and formats CQ part marks without asterisks', () => {
      const mockNavigate = vi.fn();
      const mockState: any = {
        students: [{ id: 'std_cq', name: 'Tanha' }],
        attempts: [
          {
            id: 'att_cq_fig',
            examId: 'ex_cq_fig',
            title: 'Physics CQ Exam',
            studentId: 'std_cq',
            status: 'submitted',
            startedAt: Date.now(),
            answers: {
              q_cq: { 0: 'Speed is distance over time', 1: 'Velocity has direction' },
              q_written: 'Energy is conserved',
            },
            marks: {},
            aiMarks: {},
          },
        ],
        exams: [
          {
            id: 'ex_cq_fig',
            title: 'Physics CQ Exam',
            duration: 30,
            questions: [
              {
                id: 'q_cq',
                n: '1',
                type: 'cq',
                figure: 'data:image/svg+xml;utf8,<svg id="cq-fig"></svg>',
                stimulus: 'Observe the diagram below',
                parts: [
                  { label: 'a', text: 'Define speed', marks: 1, answer: 'Distance / time' },
                  { label: 'b', text: 'Compare speed and velocity', marks: 2, answer: 'Velocity has vector nature' },
                ],
              },
              {
                id: 'q_written',
                n: '2',
                type: 'written',
                text: 'State principle of energy conservation',
                figure: 'data:image/svg+xml;utf8,<svg id="written-fig"></svg>',
                marks: 3,
                answer: 'Energy cannot be created or destroyed',
              },
            ],
          },
        ],
        settings: { currency: '৳', tutorName: 'Teacher' },
      };

      vi.spyOn(context, 'useStore').mockReturnValue({
        state: mockState,
        studentName: () => 'Tanha',
        saveAttempt: vi.fn(),
        deleteAttempt: vi.fn(),
        saveExam: vi.fn(),
        addExamScore: vi.fn(),
        toast: vi.fn(),
      } as any);

      const { container } = render(<ResultView attemptId="att_cq_fig" onNavigate={mockNavigate} />);

      // Figures rendered for both CQ and written questions
      const figures = container.querySelectorAll('img.exam-fig');
      expect(figures.length).toBeGreaterThanOrEqual(2);
      expect((figures[0] as HTMLImageElement).src).toContain('data:image/svg+xml');

      // CQ Part marks rendered without raw asterisks
      const partDocs = container.querySelectorAll('.exam-part > .doc');
      expect(partDocs.length).toBe(2);
      expect(partDocs[0].textContent).toContain('[1 marks]');
      expect(partDocs[0].textContent).not.toContain('*');
      expect(partDocs[1].textContent).toContain('[2 marks]');
      expect(partDocs[1].textContent).not.toContain('*');
    });

    it('publishes updated marksState and activeStudentId when handleShareResult is triggered', async () => {
      const mockNavigate = vi.fn();
      const mockToast = vi.fn();
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const mockState: any = {
        students: [{ id: 'std_marks', name: 'Zayan' }],
        attempts: [
          {
            id: 'att_share_marks',
            examId: 'ex_share_marks',
            title: 'Math Test',
            studentId: 'std_marks',
            startedAt: Date.now(),
            answers: { q1: 'x = 5' },
            marks: {},
            aiMarks: {},
          },
        ],
        exams: [
          {
            id: 'ex_share_marks',
            title: 'Math Test',
            duration: 30,
            questions: [
              { id: 'q1', n: '1', type: 'written', text: 'Solve for x', marks: 5, answer: 'x = 5' },
            ],
          },
        ],
        settings: { tutorName: 'Teacher Sir', currency: '৳' },
      };

      vi.spyOn(context, 'useStore').mockReturnValue({
        state: mockState,
        studentName: () => 'Zayan',
        saveAttempt: vi.fn(),
        deleteAttempt: vi.fn(),
        saveExam: vi.fn(),
        addExamScore: vi.fn(),
        toast: mockToast,
      } as any);

      render(<ResultView attemptId="att_share_marks" onNavigate={mockNavigate} />);

      // Fill in mark input
      const markInput = screen.getByRole('spinbutton');
      fireEvent.change(markInput, { target: { value: '4.5' } });

      // Click share
      const shareBtn = screen.getByText('🔗 Share Result Link');
      fireEvent.click(shareBtn);

      await act(async () => {});

      expect(mockPublishShared).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'att_share_marks',
          studentId: 'std_marks',
          marks: expect.objectContaining({ q1: 4.5 }),
        }),
        expect.objectContaining({ id: 'ex_share_marks' }),
        expect.objectContaining({ studentFirstName: 'Zayan', tutorName: 'Teacher Sir' })
      );
    });
  });

  describe('ExamScore Remarks Sanitization & Score Form Validation', () => {
    it('publishes 5 most recent examScores sorted descending by date with (attempt:...) stripped from remarks in ParentReportModal', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const mockStudentWithScores: any = {
        id: 'std_scores_sort',
        name: 'Sadia Jahan',
        grade: 'Class 10',
        curriculum: 'English Version',
        subjects: ['Math'],
        examScores: [
          { id: 's1', title: 'Quiz 1', subject: 'Math', date: '2026-01-05', obtainedMarks: 18, totalMarks: 20, remarks: 'Good job (attempt:att_001)' },
          { id: 's2', title: 'Quiz 2', subject: 'Math', date: '2026-03-10', obtainedMarks: 19, totalMarks: 20, remarks: 'Excellent (attempt:att_002)' },
          { id: 's3', title: 'Quiz 3', subject: 'Math', date: '2026-02-15', obtainedMarks: 15, totalMarks: 20, remarks: 'Needs revision (attempt:att_003)' },
          { id: 's4', title: 'Quiz 4', subject: 'Math', date: '2026-04-01', obtainedMarks: 20, totalMarks: 20, remarks: 'Perfect score (attempt:att_004)' },
          { id: 's5', title: 'Quiz 5', subject: 'Math', date: '2026-05-12', obtainedMarks: 17, totalMarks: 20, remarks: 'Well done (attempt:att_005)' },
          { id: 's6', title: 'Quiz 6', subject: 'Math', date: '2025-12-01', obtainedMarks: 14, totalMarks: 20, remarks: 'Oldest test (attempt:att_006)' },
        ],
      };

      const mockStore: any = {
        state: {
          settings: { tutorName: 'Teacher Rafiq', currency: '৳' },
          contracts: [],
          lessons: [],
          payments: [],
        },
        money: (n: number) => `৳${n}`,
        toast: vi.fn(),
      };
      vi.spyOn(context, 'useStore').mockReturnValue(mockStore);

      render(<ParentReportModal isOpen={true} onClose={vi.fn()} student={mockStudentWithScores} />);

      const copyPortalBtn = screen.getByText('🔗 Copy Parent Portal Link');
      fireEvent.click(copyPortalBtn);

      await act(async () => {});

      expect(mockPublishSharedPortal).toHaveBeenCalledWith(
        'std_scores_sort',
        expect.objectContaining({
          examScores: [
            expect.objectContaining({ id: 's5', date: '2026-05-12', remarks: 'Well done' }),
            expect.objectContaining({ id: 's4', date: '2026-04-01', remarks: 'Perfect score' }),
            expect.objectContaining({ id: 's2', date: '2026-03-10', remarks: 'Excellent' }),
            expect.objectContaining({ id: 's3', date: '2026-02-15', remarks: 'Needs revision' }),
            expect.objectContaining({ id: 's1', date: '2026-01-05', remarks: 'Good job' }),
          ],
        })
      );

      const publishedScores = mockPublishSharedPortal.mock.calls[0][1].examScores;
      expect(publishedScores).toHaveLength(5);
      expect(publishedScores.some((s: any) => s.id === 's6')).toBe(false);
      publishedScores.forEach((s: any) => {
        expect(s.remarks).not.toContain('attempt:');
      });
    });

    it('hides raw (attempt:...) tags when rendering exam score remarks in StudentDetailView', () => {
      const mockStudent: any = {
        id: 'std_detail_remarks',
        name: 'Abrar Fahim',
        grade: 'HSC',
        examScores: [
          {
            id: 'score_with_attempt',
            title: 'Model Test 1',
            subject: 'Physics',
            date: '2026-11-10',
            obtainedMarks: 45,
            totalMarks: 50,
            remarks: 'Completed via Interactive Exam (attempt:att_secret_123)',
          },
        ],
      };

      const mockStore: any = {
        state: {
          students: [mockStudent],
          contracts: [],
          lessons: [],
          payments: [],
          docs: [],
          attempts: [],
          batches: [],
          settings: { tutorName: 'Teacher', currency: '৳' },
        },
        getStudent: (id: string) => (id === mockStudent.id ? mockStudent : null),
        money: (n: number) => `৳${n}`,
        deleteStudent: vi.fn(),
        deleteContract: vi.fn(),
        saveContract: vi.fn(),
        saveStudent: vi.fn(),
        toast: vi.fn(),
        addExamScore: vi.fn(),
        deleteExamScore: vi.fn(),
      };
      vi.spyOn(context, 'useStore').mockReturnValue(mockStore);

      const { container } = render(
        <StudentDetailView
          studentId="std_detail_remarks"
          onNavigate={vi.fn()}
          onEditStudent={vi.fn()}
          onAddContract={vi.fn()}
          onEditContract={vi.fn()}
          onLogLesson={vi.fn()}
          onRecordPayment={vi.fn()}
          onUploadPaper={vi.fn()}
        />
      );

      expect(screen.getByText('Model Test 1')).toBeInTheDocument();
      const scoreRow = container.querySelector('.list .row');
      expect(scoreRow).toBeInTheDocument();
      expect(scoreRow?.textContent).toContain('Completed via Interactive Exam');
      expect(scoreRow?.textContent).not.toContain('attempt:att_secret_123');
    });

    it('handles empty string cleanly on obtainedMarks and totalMarks without NaN in StudentDetailView', () => {
      const mockAddExamScore = vi.fn();
      const mockStudent: any = {
        id: 'std_score_input',
        name: 'Labib',
        examScores: [],
      };

      const mockStore: any = {
        state: {
          students: [mockStudent],
          contracts: [],
          lessons: [],
          payments: [],
          docs: [],
          attempts: [],
          batches: [],
          settings: { tutorName: 'Teacher', currency: '৳' },
        },
        getStudent: (id: string) => mockStudent,
        money: (n: number) => `৳${n}`,
        deleteStudent: vi.fn(),
        deleteContract: vi.fn(),
        saveContract: vi.fn(),
        saveStudent: vi.fn(),
        toast: vi.fn(),
        addExamScore: mockAddExamScore,
        deleteExamScore: vi.fn(),
      };
      vi.spyOn(context, 'useStore').mockReturnValue(mockStore);

      render(
        <StudentDetailView
          studentId="std_score_input"
          onNavigate={vi.fn()}
          onEditStudent={vi.fn()}
          onAddContract={vi.fn()}
          onEditContract={vi.fn()}
          onLogLesson={vi.fn()}
          onRecordPayment={vi.fn()}
          onUploadPaper={vi.fn()}
        />
      );

      // Open score form
      fireEvent.click(screen.getByRole('button', { name: /Log Exam Score/i }));

      const spinButtons = screen.getAllByRole('spinbutton');
      const obtainedInput = spinButtons[0] as HTMLInputElement;
      const totalInput = spinButtons[1] as HTMLInputElement;

      // Clearing inputs should not cause NaN in value
      fireEvent.change(obtainedInput, { target: { value: '' } });
      fireEvent.change(totalInput, { target: { value: '' } });

      expect(obtainedInput.value).toBe('');
      expect(totalInput.value).toBe('');

      // Fill in valid numbers
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. Chapter 4 Quiz/i), { target: { value: 'Chapter 2 Quiz' } });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. Math/i), { target: { value: 'Chemistry' } });
      fireEvent.change(obtainedInput, { target: { value: '23.5' } });
      fireEvent.change(totalInput, { target: { value: '25' } });

      // Submit
      fireEvent.click(screen.getByRole('button', { name: /Save Score/i }));

      expect(mockAddExamScore).toHaveBeenCalledWith(
        'std_score_input',
        expect.objectContaining({
          title: 'Chapter 2 Quiz',
          subject: 'Chemistry',
          obtainedMarks: 23.5,
          totalMarks: 25,
        })
      );
    });
  });

  describe('purgeDummyRecords Startup Sanitization', () => {
    it('purges dummy Question 1 / Option A exams, matching docs, and hanging attempts', () => {
      const corruptedState = {
        exams: [
          {
            id: 'ex_dummy_omr',
            docId: 'doc_dummy_omr',
            title: 'board_paper.pdf',
            questions: [
              { id: 'q1', type: 'mcq', text: 'Question 1', options: ['Option A', 'Option B', 'Option C', 'Option D'] },
              { id: 'q2', type: 'mcq', text: 'Question 2', options: ['Option A', 'Option B', 'Option C', 'Option D'] },
            ],
          },
          {
            id: 'ex_real',
            docId: 'doc_real',
            title: 'Real Physics Exam',
            questions: [
              { id: 'q1', type: 'mcq', text: 'What is force?', options: ['Push or pull', 'Energy'], answer: 0, marks: 1 },
            ],
          },
        ],
        docs: [
          { id: 'doc_dummy_omr', title: 'board_paper.pdf', content: 'Original question paper attached. Answer questions 1 to 50 below.' },
          { id: 'doc_real', title: 'Real Physics Exam', content: 'Real content here' },
        ],
        savedResources: [
          { id: 'doc_dummy_omr', title: 'board_paper.pdf', content: 'Original question paper attached. Answer questions 1 to 50 below.' },
          { id: 'res_real', title: 'Physics Notes', content: 'Real notes' },
        ],
        attempts: [
          { id: 'mw663ngzf313', title: 'Hanging Attempt 1', examId: 'ex_dummy_omr', answers: {} },
          { id: 'att_omr_ref', title: 'board_paper.pdf', examId: 'ex_dummy_omr', answers: {} },
          { id: 'att_valid', title: 'Real Physics Exam', examId: 'ex_real', answers: {} },
        ],
      };

      const cleaned = purgeDummyRecords(corruptedState);

      // Dummy exam purged, real exam retained
      expect(cleaned.exams).toHaveLength(1);
      expect(cleaned.exams[0].id).toBe('ex_real');

      // Dummy docs and resources purged
      expect(cleaned.docs).toHaveLength(1);
      expect(cleaned.docs[0].id).toBe('doc_real');
      expect(cleaned.savedResources).toHaveLength(1);
      expect(cleaned.savedResources[0].id).toBe('res_real');

      // Hanging attempts and mw663ngzf313 purged, valid attempt retained
      expect(cleaned.attempts).toHaveLength(1);
      expect(cleaned.attempts[0].id).toBe('att_valid');
    });
  });
});
