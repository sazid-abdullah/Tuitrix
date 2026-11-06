import React, { useState, useEffect, Suspense, lazy, Component, ErrorInfo, ReactNode, ComponentType } from 'react';
import { useStore } from './store/context';
import { Navbar } from './components/Navbar';
import { LegalModal } from './components/LegalModal';
import { ToastContainer } from './components/ToastContainer';
import { StudentModal } from './components/StudentModal';
import { ContractModal } from './components/ContractModal';
import { LessonModal } from './components/LessonModal';
import { PaymentModal } from './components/PaymentModal';
import { PaymentReceiptModal } from './components/PaymentReceiptModal';
import { ExpenseModal } from './components/ExpenseModal';
import { GoalModal } from './components/GoalModal';
import { GoalDepositModal } from './components/GoalDepositModal';
import { UploadPaperModal } from './components/UploadPaperModal';
import { ImportDocModal } from './components/ImportDocModal';
import { BulkStudentModal } from './components/BulkStudentModal';
import { AuthModal } from './components/AuthModal';
import { OnboardingModal } from './components/OnboardingModal';
import { auth } from './services/firebase';

import { HomeView } from './views/HomeView';
import { StudentsView } from './views/StudentsView';
import { ClassesView } from './views/ClassesView';
import { SettingsView } from './views/SettingsView';

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      try {
        sessionStorage.removeItem('tuitrix_chunk_reload');
      } catch {}
      return mod;
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      const isChunkError =
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Importing a module script failed') ||
        msg.includes('dynamically imported module');

      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem('tuitrix_chunk_reload') === '1';
      } catch {}

      if (isChunkError && !alreadyReloaded && typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('tuitrix_chunk_reload', '1');
        } catch {}
        window.location.reload();
      }
      throw err;
    }
  });
}

// Route-based code splitting for heavy views with auto-recovery on stale deployment chunks
const StudentDetailView = lazyWithRetry(() => import('./views/StudentDetailView').then(m => ({ default: m.StudentDetailView })));
const MoneyView = lazyWithRetry(() => import('./views/MoneyView').then(m => ({ default: m.MoneyView })));
const AIView = lazyWithRetry(() => import('./views/AIView').then(m => ({ default: m.AIView })));
const ExamView = lazyWithRetry(() => import('./views/ExamView').then(m => ({ default: m.ExamView })));
const ResultView = lazyWithRetry(() => import('./views/ResultView').then(m => ({ default: m.ResultView })));
const LandingView = lazyWithRetry(() => import('./views/LandingView').then(m => ({ default: m.LandingView })));
const HelpCenterView = lazyWithRetry(() => import('./views/HelpCenterView').then(m => ({ default: m.HelpCenterView })));
const OwnerDashboardView = lazyWithRetry(() => import('./views/OwnerDashboardView').then(m => ({ default: m.OwnerDashboardView })));

export interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
  resetKey?: string;
}
export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View Error Boundary caught error:', error, info);
  }
  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ maxWidth: '600px', margin: '40px auto', padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>⚠️</div>
          <h2>Something went wrong in this view</h2>
          <p className="muted small" style={{ margin: '12px 0 24px 0' }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              className="btn primary"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                if (this.props.onReset) this.props.onReset();
                else window.location.reload();
              }}
            >
              🔄 Reload View
            </button>
            <button
              className="btn outline"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.hash = '#/home';
              }}
            >
              🏠 Go Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Student, Contract, Lesson, Payment, Expense, Goal, SavedDoc } from './types';
import { fmtClock, uid } from './utils/date';
import {
  callAI,
  EXAM_JSON_SYSTEM,
  examJsonPrompt,
  normalizeExam,
  parseAiJson,
  extractAndPlaceholderMedia,
  restoreMediaPlaceholders,
} from './services/ai';

export const App: React.FC = () => {
  const { state, isStateLoaded, saveAttempt, saveExam, saveDoc, saveAiResource, toast } = useStore();

  // Route state parsed from location.hash
  const [route, setRoute] = useState<string>('home');
  const [routeParam, setRouteParam] = useState<string>('');


  const parseHash = () => {
    const h = window.location.hash.replace(/^#\/?/, '') || 'home';
    const [path, queryString] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    const r = parts[0] || 'home';
    const validRoutes = ['home', 'students', 'student', 'classes', 'money', 'ai', 'exam', 'result', 'settings', 'landing', 'help', 'owner'];
    let matchedRoute = validRoutes.includes(r) ? r : 'home';
    const param = parts[1] || (queryString ? `?${queryString}` : '');
    if (matchedRoute === 'home' && r !== 'home') {
       window.location.hash = '#/home';
    }
    setRoute(matchedRoute);
    setRouteParam(param);
  };

  useEffect(() => {
    parseHash();

    // Handle URL query parameters for PWA shortcut deep-linking
    const query = new URLSearchParams(window.location.search);
    const view = query.get('view');
    const action = query.get('action');

    if (view) {
      // Need a small timeout to let react mount if this triggers route state changes
      setTimeout(() => navigate(view), 0);
      window.history.replaceState(null, '', window.location.pathname);
    } else if (action === 'log-class') {
      setTimeout(() => {
        setLessonOpts({});
        setSelectedLesson(null);
        setLessonModalOpen(true);
      }, 0);
      window.history.replaceState(null, '', window.location.pathname);
    }

    window.addEventListener('hashchange', parseHash);
    return () => window.removeEventListener('hashchange', parseHash);
  }, []);

  const navigate = (newRoute: string, param?: string) => {
    const hash = param ? `#/${newRoute}/${param}` : `#/${newRoute}`;
    if (window.location.hash !== hash) {
      window.history.pushState(null, '', hash);
      parseHash();
    }
  };

  // Modal states
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [contractStudentId, setContractStudentId] = useState('');
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [fromNewStudent, setFromNewStudent] = useState(false);

  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [lessonOpts, setLessonOpts] = useState<{
    studentId?: string;
    batchId?: string;
    date?: string;
    time?: string;
    duration?: number;
    status?: any;
  }>({});

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [paymentOpts, setPaymentOpts] = useState<{
    studentId?: string;
    contractId?: string;
  }>({});

  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositGoalId, setDepositGoalId] = useState('');

  const [uploadPaperModalOpen, setUploadPaperModalOpen] = useState(false);
  const [uploadStudentId, setUploadStudentId] = useState('');

  const [importDocModalOpen, setImportDocModalOpen] = useState(false);
  const [bulkStudentModalOpen, setBulkStudentModalOpen] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [showLanding, setShowLanding] = useState<boolean>(false);
  const [legalTab, setLegalTab] = useState<'privacy' | 'terms' | 'billing' | 'security' | null>(null);

  useEffect(() => {
    const isFirstTime = localStorage.getItem('tuitrix_entered_app') !== 'true';
    const query = new URLSearchParams(window.location.search);
    const isLandingQuery = query.get('landing') === '1' || window.location.hash.includes('?landing=1');
    const legalQuery = query.get('legal');
    const hashRoute = window.location.hash.replace(/^#\/?/, '').split('/')[0];
    const isExplicitDeepLink = Boolean(hashRoute && hashRoute !== 'home' && hashRoute !== 'landing');

    if (legalQuery && ['privacy', 'terms', 'billing', 'security'].includes(legalQuery)) {
      setLegalTab(legalQuery as any);
    }

    if (isLandingQuery || (!isAuthenticated && isFirstTime && !isExplicitDeepLink)) {
      setShowLanding(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let unsubscribe = () => {};
    if (auth) {
      unsubscribe = auth.onAuthStateChanged((user) => {
        setIsAuthenticated(!!user);
      });
    }
    return () => unsubscribe();
  }, []);


  const handleEnterApp = () => {
    localStorage.setItem('tuitrix_entered_app', 'true');
    setShowLanding(false);
    navigate('home');

    // Remove ?landing=1 from URL if present
    const query = new URLSearchParams(window.location.search);
    if (query.get('landing') === '1') {
       window.history.replaceState(null, '', window.location.pathname);
    }
    if (window.location.hash.includes('?landing=1')) {
       window.location.hash = window.location.hash.replace('?landing=1', '');
    }
  };

  // Auto-clean any orphaned running attempts
  useEffect(() => {
    if (!isStateLoaded) return;
    const now = Date.now();
    const orphans = state.attempts.filter(
      a => a.status === 'running' && (!state.exams.some(e => e.id === a.examId) || a.endsAt <= now)
    );
    if (orphans.length > 0) {
      orphans.forEach(a => {
        saveAttempt({
          ...a,
          status: 'submitted',
          submittedAt: a.submittedAt || now,
        });
      });
    }
  }, [isStateLoaded, state.attempts, state.exams, saveAttempt]);

  const requiresOnboarding = isStateLoaded && isAuthenticated && (!state.profile || !state.profile.brandTitle);

  // Check for running exams strictly
  const runningExam = state.attempts.find(
    a => a.status === 'running' && a.endsAt > Date.now() && state.exams.some(e => e.id === a.examId)
  );

  if (showLanding) {
    return (
      <>
        <Suspense fallback={null}>
          <LandingView
            onEnterApp={handleEnterApp}
            onSignIn={() => {
              handleEnterApp();
              setAuthModalOpen(true);
            }}
          />
        </Suspense>
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
        <LegalModal isOpen={!!legalTab} initialTab={legalTab || 'privacy'} onClose={() => setLegalTab(null)} />
      </>
    );
  }



  return (
    <>
      <Navbar currentRoute={route} onNavigate={navigate} onLoginClick={() => setAuthModalOpen(true)} />

      <main id="view" tabIndex={-1}>
        <ErrorBoundary resetKey={`${route}:${routeParam}`} onReset={() => parseHash()}>
          <Suspense fallback={<div className="card" style={{ margin: '40px auto', padding: '32px', textAlign: 'center', color: 'var(--muted)' }}><span className="sync-dot" style={{ display: 'inline-block', marginRight: '8px' }}></span>Loading view...</div>}>
            {runningExam && route !== 'exam' && (
          <div className="notice warn" style={{ marginBottom: '16px' }}>
            An exam is currently in progress: <b>{runningExam.title}</b> (
            {fmtClock(runningExam.endsAt - Date.now())} remaining).{' '}
            <a
              href={`#/exam/${runningExam.id}`}
              onClick={e => {
                e.preventDefault();
                navigate('exam', runningExam.id);
              }}
            >
              Go back to the exam
            </a>
            <button
              type="button"
              className="btn xs ghost"
              style={{ marginLeft: '10px' }}
              onClick={() => {
                saveAttempt({ ...runningExam, status: 'submitted', submittedAt: Date.now() });
                toast('Exam session ended', 'info');
              }}
            >
              End exam
            </button>
          </div>
        )}

        {route === 'home' && (
          <HomeView
            onNavigate={navigate}
            onOpenLessonModal={opts => {
              setSelectedLesson(opts.lesson || null);
              setLessonOpts(opts);
              setLessonModalOpen(true);
            }}
            onOpenPaymentModal={opts => {
              setSelectedPayment(null);
              setPaymentOpts(opts);
              setPaymentModalOpen(true);
            }}
            onOpenStudentModal={() => {
              setSelectedStudent(null);
              setStudentModalOpen(true);
            }}
          />
        )}

        {route === 'students' && (
          <StudentsView
            onNavigate={navigate}
            onOpenBulkStudentModal={() => setBulkStudentModalOpen(true)}
            onOpenStudentModal={() => {
              setSelectedStudent(null);
              setStudentModalOpen(true);
            }}
          />
        )}

        {route === 'student' && (
          <StudentDetailView
            studentId={routeParam}
            onNavigate={navigate}
            onShowReceipt={payment => {
              setSelectedPayment(payment);
              setReceiptModalOpen(true);
            }}
            onEditStudent={s => {
              setSelectedStudent(s);
              setStudentModalOpen(true);
            }}
            onAddContract={sid => {
              setContractStudentId(sid);
              setSelectedContract(null);
              setFromNewStudent(false);
              setContractModalOpen(true);
            }}
            onEditContract={c => {
              setContractStudentId(c.studentId);
              setSelectedContract(c);
              setFromNewStudent(false);
              setContractModalOpen(true);
            }}
            onLogLesson={opts => {
              setSelectedLesson(opts.lesson || null);
              setLessonOpts({ studentId: opts.studentId });
              setLessonModalOpen(true);
            }}
            onRecordPayment={opts => {
              setSelectedPayment(opts.payment || null);
              setPaymentOpts(opts);
              setPaymentModalOpen(true);
            }}
            onUploadPaper={sid => {
              setUploadStudentId(sid);
              setUploadPaperModalOpen(true);
            }}
          />
        )}

        {route === 'classes' && (
          <ClassesView
            initialStudentFilter={routeParam.startsWith('student=') ? routeParam.split('=')[1] : ''}
            initialBatchFilter={routeParam.startsWith('batch=') ? routeParam.split('=')[1] : ''}
            onNavigate={navigate}
            onLogLesson={opts => {
              setSelectedLesson(opts.lesson || null);
              setLessonOpts(opts);
              setLessonModalOpen(true);
            }}
          />
        )}

        {route === 'money' && (
          <MoneyView
            onNavigate={navigate}
            onShowReceipt={payment => {
              setSelectedPayment(payment);
              setReceiptModalOpen(true);
            }}
            onRecordPayment={opts => {
              setSelectedPayment(opts?.payment || null);
              setPaymentOpts(opts || {});
              setPaymentModalOpen(true);
            }}
            onAddExpense={exp => {
              setSelectedExpense(exp || null);
              setExpenseModalOpen(true);
            }}
            onAddGoal={g => {
              setSelectedGoal(g || null);
              setGoalModalOpen(true);
            }}
            onDepositGoal={gid => {
              setDepositGoalId(gid);
              setDepositModalOpen(true);
            }}
          />
        )}

        {route === 'ai' && (
          <AIView
            onNavigate={navigate}
            onStartExam={async (doc: SavedDoc) => {
              try {
                if (doc.content?.trim().startsWith('%PDF-')) {
                  toast("This document contains raw binary PDF data. Please upload it via 'Upload question paper' so AI Vision can extract all questions.", 'error');
                  return;
                }

                const isDummyExam = (ex: any) => {
                  if (!ex || !Array.isArray(ex.questions) || ex.questions.length === 0) return true;
                  if (ex.questions.length === 1 && /sample mcq|question text/i.test(ex.questions[0]?.text || '')) return true;
                  return false;
                };
                let existingExam = state.exams.find(e => 
                  (e.docId === doc.id || e.id === doc.id || (e.title && e.title.trim() === doc.title.trim())) && !isDummyExam(e)
                );
                if (!existingExam) {
                  toast('Preparing interactive exam questions with AI…', 'info');
                  const { cleanText, mediaMap } = extractAndPlaceholderMedia(doc.content);
                  const rawJson = await callAI(EXAM_JSON_SYSTEM, examJsonPrompt(cleanText), state, {
                    temperature: 0.1,
                    json: true,
                    onFallback: (msg) => toast(msg, 'info'),
                  });
                  const parsed = normalizeExam(restoreMediaPlaceholders(parseAiJson(rawJson), mediaMap));
                  if (parsed.questions.length === 0) {
                    throw new Error('AI could not extract valid questions from this document. Please ensure the paper has numbered questions.');
                  }
                  const newExam = {
                    ...parsed,
                    id: uid(),
                    docId: doc.id,
                    title: doc.title,
                    createdAt: new Date().toISOString(),
                  };
                  saveExam(newExam);
                  existingExam = newExam;
                }

                const now = Date.now();
                const duration = existingExam.duration || 60;
                const attemptId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                const newAttempt = {
                  id: attemptId,
                  examId: existingExam.id,
                  title: doc.title,
                  studentId: doc.studentId || null,
                  startedAt: now,
                  endsAt: now + duration * 60000,
                  submittedAt: null,
                  auto: false,
                  status: 'running' as const,
                  answers: {},
                  marks: {},
                  aiMarks: {},
                };

                saveAttempt(newAttempt);
                navigate('exam', attemptId);
              } catch (err: any) {
                console.error('Failed to start exam:', err);
                toast(err.message || 'Failed to start exam', 'error');
              }
            }}
            onUploadPaper={() => {
              setUploadStudentId('');
              setUploadPaperModalOpen(true);
            }}
            onImportDoc={() => setImportDocModalOpen(true)}
          />
        )}

        {route === 'exam' && (
          <ExamView attemptId={routeParam} onNavigate={navigate} />
        )}

        {route === 'result' && (
          <ResultView attemptId={routeParam} onNavigate={navigate} />
        )}

        {route === 'settings' && <SettingsView />}

        {route === 'landing' && (
          <LandingView
            onEnterApp={handleEnterApp}
            onSignIn={() => {
              handleEnterApp();
              setAuthModalOpen(true);
            }}
            embedded={true}
          />
        )}

        {route === 'help' && (
          <HelpCenterView onNavigate={navigate} />
        )}

        {route === 'owner' && (
          <OwnerDashboardView onNavigate={navigate} />
        )}
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Global Modals */}
      <OnboardingModal
        isOpen={requiresOnboarding && !['settings', 'owner', 'help', 'landing'].includes(route)}
      />
      <StudentModal
        isOpen={studentModalOpen}
        student={selectedStudent}
        onClose={() => setStudentModalOpen(false)}
        onStudentSaved={(id, isNew) => {
          if (isNew) {
            navigate('student', id);
            setContractStudentId(id);
            setSelectedContract(null);
            setFromNewStudent(true);
            setContractModalOpen(true);
          }
        }}
      />

      <ContractModal
        isOpen={contractModalOpen}
        studentId={contractStudentId}
        contract={selectedContract}
        fromNewStudent={fromNewStudent}
        onClose={() => setContractModalOpen(false)}
      />

      <LessonModal
        isOpen={lessonModalOpen}
        lesson={selectedLesson}
        initialStudentId={lessonOpts.studentId}
        initialBatchId={lessonOpts.batchId}
        initialDate={lessonOpts.date}
        initialTime={lessonOpts.time}
        initialDuration={lessonOpts.duration}
        initialStatus={lessonOpts.status}
        onClose={() => setLessonModalOpen(false)}
      />

      <PaymentModal
        isOpen={paymentModalOpen}
        payment={selectedPayment}
        initialStudentId={paymentOpts.studentId}
        initialContractId={paymentOpts.contractId}
        onClose={() => setPaymentModalOpen(false)}
      />

      <PaymentReceiptModal
        isOpen={receiptModalOpen}
        payment={selectedPayment}
        onClose={() => setReceiptModalOpen(false)}
      />

      <ExpenseModal
        isOpen={expenseModalOpen}
        expense={selectedExpense}
        onClose={() => setExpenseModalOpen(false)}
      />

      <GoalModal
        isOpen={goalModalOpen}
        goal={selectedGoal}
        onClose={() => setGoalModalOpen(false)}
      />

      <GoalDepositModal
        isOpen={depositModalOpen}
        goalId={depositGoalId}
        onClose={() => setDepositModalOpen(false)}
      />

      <UploadPaperModal
        isOpen={uploadPaperModalOpen}
        initialStudentId={uploadStudentId}
        onClose={() => setUploadPaperModalOpen(false)}
        onExamReady={(docId, examId) => {
          navigate('ai', 'tool=library');
        }}
      />

      <ImportDocModal
        isOpen={importDocModalOpen}
        onClose={() => setImportDocModalOpen(false)}
      />

      <BulkStudentModal
        isOpen={bulkStudentModalOpen}
        onClose={() => setBulkStudentModalOpen(false)}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />

      <LegalModal
        isOpen={!!legalTab}
        initialTab={legalTab || 'privacy'}
        onClose={() => setLegalTab(null)}
      />

      <ToastContainer />
    </>
  );
};
