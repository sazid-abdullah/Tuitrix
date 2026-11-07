/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UploadPaperModal } from '../components/UploadPaperModal';
import { ImportDocModal } from '../components/ImportDocModal';
import { ParentReportModal } from '../components/ParentReportModal';
import { StudentDetailView } from '../views/StudentDetailView';
import * as context from '../store/context';
import * as aiServices from '../services/ai';

const mockPublishSharedPortal = vi.fn((portalId: string, snapshot: any) => Promise.resolve(portalId));
const mockFetchSharedPortal = vi.fn((portalId: string) => Promise.resolve<any>(null));

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
  publishSharedParentPortal: (portalId: string, snapshot: any) => mockPublishSharedPortal(portalId, snapshot),
  fetchSharedParentPortal: (portalId: string) => mockFetchSharedPortal(portalId),
}));

describe('UploadPaperModal - Student Sync, Quota & Markdown Reconstruction', () => {
  const mockSaveDoc = vi.fn();
  const mockSaveAiResource = vi.fn();
  const mockSaveExam = vi.fn();
  const mockToast = vi.fn();
  const mockClose = vi.fn();
  const mockExamReady = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('syncs initialStudentId when reopened for a different student', () => {
    const mockStore = {
      state: {
        students: [
          { id: 's1', name: 'Rahim' },
          { id: 's2', name: 'Karim' },
        ],
        docs: [],
        savedResources: [],
      },
      saveDoc: mockSaveDoc,
      saveAiResource: mockSaveAiResource,
      saveExam: mockSaveExam,
      toast: mockToast,
      billingState: null,
      user: { email: 'tutor@test.com' },
    };
    vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

    const { rerender } = render(
      <UploadPaperModal
        isOpen={true}
        initialStudentId="s1"
        onClose={mockClose}
        onExamReady={mockExamReady}
      />
    );

    const select = screen.getByLabelText(/Student \(optional\)/i) as HTMLSelectElement;
    expect(select.value).toBe('s1');

    // Reopen/rerender with a different initialStudentId
    rerender(
      <UploadPaperModal
        isOpen={true}
        initialStudentId="s2"
        onClose={mockClose}
        onExamReady={mockExamReady}
      />
    );

    expect(select.value).toBe('s2');
  });

  it('reconstructs question Markdown when uploading an image or PDF paper', async () => {
    const mockStore = {
      state: {
        students: [{ id: 's_physics', name: 'Nafis' }],
        docs: [],
        savedResources: [],
      },
      saveDoc: mockSaveDoc,
      saveAiResource: mockSaveAiResource,
      saveExam: mockSaveExam,
      toast: mockToast,
      billingState: { plan: 'pro' }, // Pro user
      user: { email: 'pro@tutor.com' },
    };
    vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

    // Mock FileReader.prototype.readAsDataURL
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      setTimeout(() => {
        Object.defineProperty(this, 'result', {
          value: 'data:application/pdf;base64,ZHVtbXlfcGRmX2NvbnRlbnQ=',
          configurable: true,
        });
        this.onloadend?.({} as ProgressEvent<FileReader>);
      }, 0);
    });

    // Mock callAI response with structured exam JSON
    const mockExamJson = JSON.stringify({
      title: 'Physics SSC Model Test',
      duration: 75,
      questions: [
        {
          type: 'mcq',
          n: '1',
          text: 'What is the SI unit of force?',
          options: ['Joule', 'Newton', 'Pascal', 'Watt'],
          answer: 1,
          marks: 1,
        },
        {
          type: 'cq',
          n: '2',
          stimulus: 'A car accelerates uniformly from rest at 2 m/s².',
          parts: [
            { label: 'a', text: 'Define acceleration.', marks: 1 },
            { label: 'b', text: 'Calculate the velocity after 5 seconds.', marks: 3 },
          ],
        },
        {
          type: 'written',
          n: '3',
          text: 'State Newton third law of motion.',
          marks: 2,
        },
      ],
    });

    vi.spyOn(aiServices, 'callAI').mockResolvedValue(mockExamJson);

    render(
      <UploadPaperModal
        isOpen={true}
        initialStudentId="s_physics"
        onClose={mockClose}
        onExamReady={mockExamReady}
      />
    );

    const fileInput = screen.getByLabelText(/PDF, photo, Word or text file/i);
    const dummyPdf = new File(['dummy bytes'], 'exam_paper.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [dummyPdf] } });

    const form = fileInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockSaveDoc).toHaveBeenCalled();
    });

    // Verify paperMd format in saveDoc call
    const savedDocArg = mockSaveDoc.mock.calls[0][0];
    expect(savedDocArg.studentId).toBe('s_physics');
    expect(savedDocArg.content).toContain('1. What is the SI unit of force?');
    expect(savedDocArg.content).toContain('(a) Joule\n   (b) Newton\n   (c) Pascal\n   (d) Watt');
    expect(savedDocArg.content).toContain('2. A car accelerates uniformly from rest at 2 m/s².');
    expect(savedDocArg.content).toContain('(a) Define acceleration. [1]');
    expect(savedDocArg.content).toContain('(b) Calculate the velocity after 5 seconds. [3]');
    expect(savedDocArg.content).toContain('3. State Newton third law of motion. [2]');

    // Verify saveAiResource receives the exact same paperMd and studentId
    expect(mockSaveAiResource).toHaveBeenCalledWith(
      expect.objectContaining({
        content: savedDocArg.content,
        studentId: 's_physics',
      })
    );
  });

  it('extracts real questions, diagrams, and saves interactive exam with AI vision', async () => {
    const mockStore = {
      state: {
        students: [{ id: 's_ict', name: 'ICT Student' }],
        docs: [],
        savedResources: [],
      },
      saveDoc: mockSaveDoc,
      saveAiResource: mockSaveAiResource,
      saveExam: mockSaveExam,
      toast: mockToast,
      billingState: { plan: 'pro' },
      user: { email: 'tutor@test.com' },
    };
    vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

    const mockCallAI = vi.spyOn(aiServices, 'callAI').mockResolvedValue(JSON.stringify({
      title: 'HSC ICT Test',
      duration: 45,
      questions: [
        {
          type: 'mcq',
          n: '1',
          text: 'Which logic gate is shown below?',
          options: ['AND', 'OR', 'NAND', 'NOR'],
          answer: 2,
          marks: 1,
        },
      ],
    }));

    render(
      <UploadPaperModal
        isOpen={true}
        initialStudentId="s_ict"
        onClose={mockClose}
        onExamReady={mockExamReady}
      />
    );

    const fileInput = screen.getByLabelText(/PDF, photo, Word or text file/i);
    const dummyPdf = new File(['%PDF-1.4 mock stream'], 'board_paper.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [dummyPdf] } });

    const form = fileInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockCallAI).toHaveBeenCalled();
      expect(mockSaveDoc).toHaveBeenCalled();
      expect(mockSaveExam).toHaveBeenCalled();
    });

    const savedExamArg = mockSaveExam.mock.calls[0][0];
    expect(savedExamArg.questions.length).toBe(1);
    expect(savedExamArg.questions[0].answer).toBe(2);
    // Auto-synthesized figure for NAND gate
    expect(savedExamArg.questions[0].figure).toContain('data:image/svg+xml');
  });
});

describe('ImportDocModal - Free Tier canSaveAiResource Quota Enforcement', () => {
  const mockSaveDoc = vi.fn();
  const mockSaveAiResource = vi.fn();
  const mockToast = vi.fn();
  const mockClose = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks free tier user from importing when 5 saved resources exist', async () => {
    const existingResources = [
      { id: 'doc_1', title: 'Doc 1' },
      { id: 'doc_2', title: 'Doc 2' },
      { id: 'doc_3', title: 'Doc 3' },
      { id: 'doc_4', title: 'Doc 4' },
      { id: 'doc_5', title: 'Doc 5' },
    ];

    const mockStore = {
      state: {
        students: [],
        docs: existingResources,
        savedResources: existingResources,
      },
      saveDoc: mockSaveDoc,
      saveAiResource: mockSaveAiResource,
      toast: mockToast,
      billingState: null, // Free tier
      user: { email: 'freeteacher@gmail.com' },
    };
    vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

    render(<ImportDocModal isOpen={true} onClose={mockClose} />);

    const fileInput = screen.getByLabelText(/File \(Word, Markdown or text\)/i);
    const txtFile = new File(['Questions: 1. ...'], 'sample.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [txtFile] } });

    const form = fileInput.closest('form')!;
    fireEvent.submit(form);

    expect(mockToast).toHaveBeenCalledWith(
      'Free Tier limit reached (5 saved resources). Upgrade to Pro for unlimited saves.',
      'error'
    );
    expect(mockSaveDoc).not.toHaveBeenCalled();
    expect(mockSaveAiResource).not.toHaveBeenCalled();
  });

  it('allows Pro or Owner tutor to import beyond 5 saved resources', async () => {
    const existingResources = [
      { id: 'doc_1', title: 'Doc 1' },
      { id: 'doc_2', title: 'Doc 2' },
      { id: 'doc_3', title: 'Doc 3' },
      { id: 'doc_4', title: 'Doc 4' },
      { id: 'doc_5', title: 'Doc 5' },
    ];

    const mockStore = {
      state: {
        students: [{ id: 'std_10', name: 'Tamim' }],
        docs: existingResources,
        savedResources: existingResources,
      },
      saveDoc: mockSaveDoc,
      saveAiResource: mockSaveAiResource,
      toast: mockToast,
      billingState: null,
      user: { email: 'abdullahsazid109@gmail.com' }, // Owner is Pro
    };
    vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

    vi.spyOn(aiServices, 'extractFileText').mockResolvedValue('Imported text content');

    render(<ImportDocModal isOpen={true} onClose={mockClose} />);

    const fileInput = screen.getByLabelText(/File \(Word, Markdown or text\)/i);
    const txtFile = new File(['Sample text'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [txtFile] } });

    const studentSelect = screen.getByLabelText(/Student \(optional\)/i);
    fireEvent.change(studentSelect, { target: { value: 'std_10' } });

    const form = fileInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockSaveDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Imported text content',
          studentId: 'std_10',
        })
      );
    });

    expect(mockSaveAiResource).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Imported text content',
        studentId: 'std_10',
      })
    );
    expect(mockToast).toHaveBeenCalledWith('Document imported to library', 'success');
  });
});

describe('ParentReportModal - Accurate studentBalance & Valid CSS Tokens', () => {
  const mockStudent = {
    id: 'std_report_1',
    name: 'Sarah Ahmed',
    grade: 'Class 9',
    curriculum: 'English Medium',
    subjects: ['Physics', 'Chemistry'],
    examScores: [
      {
        id: 'es_1',
        title: 'Monthly Test 1',
        subject: 'Physics',
        date: '2026-02-15',
        obtainedMarks: 85,
        totalMarks: 100,
        remarks: 'Excellent',
      },
      {
        id: 'es_2',
        title: 'Monthly Test 2',
        subject: 'Chemistry',
        date: '2026-03-10',
        obtainedMarks: 65,
        totalMarks: 100,
        remarks: 'Satisfactory',
      },
      {
        id: 'es_3',
        title: 'Quiz 1',
        subject: 'Physics',
        date: '2026-03-20',
        obtainedMarks: 50,
        totalMarks: 100,
        remarks: 'Needs revision',
      },
    ],
  };

  it('computes totalDue across all contracts via studentBalance and renders valid CSS variable colors', () => {
    // Contract 1: 4 classes cycle, fee 4000, 4 taught, 0 paid -> balance = 4000
    // Contract 2: 4 classes cycle, fee 3000, 4 taught, 0 paid -> balance = 3000
    // Total balance = 7000
    const contracts = [
      {
        id: 'c_phy',
        studentId: 'std_report_1',
        title: 'Physics Contract',
        cycleType: 'classes' as const,
        cycleLength: 4,
        fee: 4000,
        billing: 'end' as const,
        startDate: '2026-01-01',
        status: 'active' as const,
      },
      {
        id: 'c_chem',
        studentId: 'std_report_1',
        title: 'Chemistry Contract',
        cycleType: 'classes' as const,
        cycleLength: 4,
        fee: 3000,
        billing: 'end' as const,
        startDate: '2026-01-01',
        status: 'active' as const,
      },
    ];

    const lessons = [
      { id: 'l1', studentId: 'std_report_1', contractId: 'c_phy', date: '2026-01-05', status: 'taught' as const },
      { id: 'l2', studentId: 'std_report_1', contractId: 'c_phy', date: '2026-01-10', status: 'taught' as const },
      { id: 'l3', studentId: 'std_report_1', contractId: 'c_phy', date: '2026-01-15', status: 'taught' as const },
      { id: 'l4', studentId: 'std_report_1', contractId: 'c_phy', date: '2026-01-20', status: 'taught' as const },
      { id: 'l5', studentId: 'std_report_1', contractId: 'c_chem', date: '2026-01-06', status: 'taught' as const },
      { id: 'l6', studentId: 'std_report_1', contractId: 'c_chem', date: '2026-01-12', status: 'taught' as const },
      { id: 'l7', studentId: 'std_report_1', contractId: 'c_chem', date: '2026-01-18', status: 'taught' as const },
      { id: 'l8', studentId: 'std_report_1', contractId: 'c_chem', date: '2026-01-24', status: 'taught' as const },
    ];

    const mockStore = {
      state: {
        settings: { tutorName: 'Engr. Sazid' },
        contracts,
        lessons,
        payments: [],
      },
      money: (n: number) => `৳${n.toLocaleString('en-US')}`,
      toast: vi.fn(),
    };
    vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

    render(
      <ParentReportModal
        isOpen={true}
        onClose={vi.fn()}
        student={mockStudent as any}
      />
    );

    // Total Due should reflect 7,000 (sum of both contracts via studentBalance)
    expect(screen.getByText('৳7,000')).toBeInTheDocument();

    // Check valid CSS variable color tokens for exam score percentages (85%, 65%, 50%)
    const el85 = screen.getByText('85%');
    expect(el85).toHaveStyle({ color: 'var(--green)' });

    const el65 = screen.getByText('65%');
    expect(el65).toHaveStyle({ color: 'var(--yellow)' });

    const el50 = screen.getByText('50%');
    expect(el50).toHaveStyle({ color: 'var(--red)' });
  });

  it('publishes parent portal snapshot and copies link when "🔗 Copy Parent Portal Link" is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const mockStudent = {
      id: 'std_portal_1',
      name: 'Tanvir Ahmed',
      grade: 'HSC',
      curriculum: 'NCTB',
      subjects: ['Physics'],
      phone: '01711111111',
      guardianPhone: '01811111111',
      address: 'Dhanmondi, Dhaka',
      examScores: [
        { id: 'es1', title: 'Midterm', subject: 'Physics', date: '2026-02-01', obtainedMarks: 80, totalMarks: 100 }
      ],
    };

    const mockStore = {
      state: {
        settings: { tutorName: 'Engr. Sazid', currency: '৳' },
        contracts: [],
        lessons: [
          { id: 'l1', studentId: 'std_portal_1', date: '2026-02-01', status: 'taught', subject: 'Physics' }
        ],
        payments: [],
      },
      money: (n: number) => `৳${n}`,
      toast: vi.fn(),
    };
    vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

    render(
      <ParentReportModal
        isOpen={true}
        onClose={vi.fn()}
        student={mockStudent as any}
      />
    );

    const copyBtn = screen.getByText('🔗 Copy Parent Portal Link');
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(mockPublishSharedPortal).toHaveBeenCalledWith(
        'std_portal_1',
        expect.objectContaining({
          id: 'std_portal_1',
          studentFirstName: 'Tanvir',
          grade: 'HSC',
          tutorName: 'Engr. Sazid',
        })
      );
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('#/student/std_portal_1'));
      expect(mockStore.toast).toHaveBeenCalledWith('Live Parent Portal link copied!', 'success');
    });
  });

  it('renders read-only Live Parent Portal card in StudentDetailView when student is not in store', async () => {
    const mockStore = {
      state: {
        contracts: [],
        lessons: [],
        payments: [],
        docs: [],
        attempts: [],
        settings: { tutorName: 'Private Tutor' },
      },
      getStudent: vi.fn(() => undefined), // Not found in store!
      money: (n: number) => `৳${n}`,
      toast: vi.fn(),
    };
    vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

    mockFetchSharedPortal.mockResolvedValueOnce({
      id: 'std_portal_shared',
      studentFirstName: 'Sadia',
      grade: 'Class 10',
      curriculum: 'English Version',
      subjects: ['Biology', 'Chemistry'],
      tutorName: 'Dr. Nabila',
      cycleSummary: '8 / 12 Classes',
      paidTotal: 8000,
      totalDue: 2000,
      currency: '৳',
      examScores: [
        { id: 'ex1', title: 'Genetics Quiz', subject: 'Biology', date: '2026-02-10', obtainedMarks: 22, totalMarks: 25, remarks: 'Excellent' }
      ],
      lessons: [
        { id: 'les1', date: '2026-02-05', status: 'taught', subject: 'Biology', topics: 'DNA Replication', duration: 75, homework: 'Draw double helix' }
      ],
    });

    render(
      <StudentDetailView
        studentId="std_portal_shared"
        onNavigate={vi.fn()}
        onEditStudent={vi.fn()}
        onAddContract={vi.fn()}
        onEditContract={vi.fn()}
        onLogLesson={vi.fn()}
        onRecordPayment={vi.fn()}
        onUploadPaper={vi.fn()}
      />
    );

    // Wait for portal to load
    const heading = await screen.findByText('Sadia');
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('Live Parent Portal')).toBeInTheDocument();
    expect(screen.getByText(/Tutor:/)).toBeInTheDocument();
    expect(screen.getByText('Dr. Nabila')).toBeInTheDocument();
    expect(screen.getByText('8 / 12 Classes')).toBeInTheDocument();
    expect(screen.getByText('Genetics Quiz')).toBeInTheDocument();
    expect(screen.getByText('DNA Replication')).toBeInTheDocument();
    expect(screen.getByText('🖨️ Print Report')).toBeInTheDocument();

    // Verify zero editing buttons and zero phone/address fields
    expect(screen.queryByText(/Edit Student/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Delete Student/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Log Class/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Record Payment/i)).not.toBeInTheDocument();
    expect(screen.queryByText('01711111111')).not.toBeInTheDocument();
  });
});
