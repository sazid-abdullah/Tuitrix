import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthModal } from '../components/AuthModal';
import { Navbar } from '../components/Navbar';
import * as firebaseServices from '../services/firebase';
import * as storeContext from '../store/context';

const { mockSetDoc, mockGetDoc, mockDoc, authState } = vi.hoisted(() => {
  return {
    mockSetDoc: vi.fn().mockResolvedValue(undefined),
    mockGetDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
    mockDoc: vi.fn((_db, ...parts) => parts.join('/')),
    authState: {
      currentUser: null as any,
    },
  };
});

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => null),
  initializeFirestore: vi.fn(() => null),
  doc: mockDoc,
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  onSnapshot: vi.fn().mockReturnValue(() => {}),
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('../services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/firebase')>();
  return {
    ...actual,
    auth: {
      get currentUser() {
        return authState.currentUser;
      },
    },
    db: { type: 'mock-db' },
    resetUserPassword: vi.fn().mockResolvedValue(undefined),
    googleProvider: {},
    signInWithPopup: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    onAuthStateChanged: vi.fn((_auth, callback) => {
      callback(authState.currentUser);
      return () => {};
    }),
    signOut: vi.fn(),
  };
});

vi.mock('../store/context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store/context')>();
  return {
    ...actual,
    useStore: vi.fn(() => ({
      state: { settings: { theme: 'dark' } },
      updateSettings: vi.fn(),
      billingState: null,
      isStateLoaded: true,
      syncStatus: 'local',
      toasts: [],
      toast: vi.fn(),
      dismissToast: vi.fn(),
    })),
  };
});

describe('AuthModal Forgot Password Flow', () => {
  it('switches to forgot password mode and submits correctly', async () => {
    render(<AuthModal isOpen={true} onClose={() => {}} />);

    // Initially in Login mode
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();

    // Click Forgot Password link
    const forgotPasswordBtn = screen.getByRole('button', { name: 'Forgot Password?' });
    fireEvent.click(forgotPasswordBtn);

    // Now in Forgot Password mode
    expect(screen.getByRole('heading', { name: 'Forgot Password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeInTheDocument();

    // Enter email
    const emailInput = screen.getByLabelText('Email');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: 'Send Reset Link' });
    fireEvent.click(submitBtn);

    // Verify resetUserPassword called
    await waitFor(() => {
      expect(firebaseServices.resetUserPassword).toHaveBeenCalledWith('test@example.com');
    });

    // Check for success message
    await waitFor(() => {
      expect(screen.getByText('Password reset email sent! Please check your inbox (and spam folder).')).toBeInTheDocument();
    });
  });

  it('hides Google sign-in and shows Android note when running in native Capacitor Android', () => {
    const originalCapacitor = (window as any).Capacitor;
    (window as any).Capacitor = { isNativePlatform: () => true };

    try {
      render(<AuthModal isOpen={true} onClose={() => {}} />);
      expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument();
      expect(screen.getByText(/Using the Android app\? Sign in with Email & Password/i)).toBeInTheDocument();
    } finally {
      (window as any).Capacitor = originalCapacitor;
    }
  });

  it('shows Google sign-in when running on web', () => {
    const originalCapacitor = (window as any).Capacitor;
    delete (window as any).Capacitor;

    try {
      render(<AuthModal isOpen={true} onClose={() => {}} />);
      expect(screen.getByText('Continue with Google')).toBeInTheDocument();
      expect(screen.queryByText(/Using the Android app\?/i)).not.toBeInTheDocument();
    } finally {
      (window as any).Capacitor = originalCapacitor;
    }
  });
});

describe('Navbar Sync Status Badge', () => {
  const renderNavbarWithStatus = (syncStatus: string, lastSyncedAt?: string) => {
    (storeContext.useStore as any).mockReturnValue({
      state: { settings: { theme: 'dark' }, students: [], batches: [], contracts: [], payments: [] },
      updateSettings: vi.fn(),
      billingState: null,
      isStateLoaded: true,
      syncStatus,
      toasts: [],
      toast: vi.fn(),
      dismissToast: vi.fn(),
      lastSyncedAt
    });

    render(<Navbar currentRoute="home" onNavigate={() => {}} onLoginClick={() => {}} />);
  };

  it('renders correctly for synced status', () => {
    renderNavbarWithStatus('synced', new Date().toISOString());
    expect(screen.getByText('☁️ Synced')).toBeInTheDocument();
  });

  it('renders correctly for syncing status', () => {
    renderNavbarWithStatus('syncing');
    expect(screen.getByText('🔄 Syncing...')).toBeInTheDocument();
  });

  it('renders correctly for offline status', () => {
    renderNavbarWithStatus('offline');
    expect(screen.getByText('⚡ Offline (Saved Locally)')).toBeInTheDocument();
  });

  it('renders correctly for local status', () => {
    renderNavbarWithStatus('local');
    expect(screen.getByText('⚡ Saved Locally')).toBeInTheDocument();
  });

  it('renders correctly for error status', () => {
    renderNavbarWithStatus('error');
    expect(screen.getByText('⚠️ Sync Error')).toBeInTheDocument();
  });
});

describe('Firestore State Sync & undefined Sanitization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSetDoc.mockClear();
    mockGetDoc.mockClear();
    mockDoc.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    authState.currentUser = null;
    localStorage.clear();
  });

  it('strips undefined nested properties in state before setDoc is called on users/{uid}/data/appState', async () => {
    authState.currentUser = { uid: 'tutor-sync-123', email: 'tutor123@example.com' };

    const StateMutator: React.FC = () => {
      const ctx = React.useContext(storeContext.StoreContext);
      if (!ctx) return null;
      return (
        <button
          onClick={() => {
            ctx.setState(prev => ({
              ...prev,
              settings: {
                ...prev.settings,
                tutorName: 'Master Instructor',
                undefSetting: undefined as any,
              },
              students: [
                {
                  id: 'student-1',
                  name: 'Student One',
                  active: true,
                  phone: '01711111111',
                  undefProp: undefined as any,
                  nestedMeta: {
                    level: 8,
                    undefNested: undefined as any,
                  },
                } as any,
              ],
            }));
          }}
        >
          Inject Undefined State
        </button>
      );
    };

    render(
      <storeContext.StoreProvider>
        <StateMutator />
      </storeContext.StoreProvider>
    );

    // Initial load will settle and clear isInitialRemoteLoadRef
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Initial migration/upload should have occurred
    const initialAppStateCall = mockSetDoc.mock.calls.find(c => c[0] === 'users/tutor-sync-123/data/appState');
    expect(initialAppStateCall).toBeDefined();

    // Now trigger state update containing undefined nested properties
    const mutateBtn = screen.getByRole('button', { name: 'Inject Undefined State' });
    fireEvent.click(mutateBtn);

    // Advance 250ms debounce timer to trigger Firestore sync
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    // Locate the latest setDoc call to users/{uid}/data/appState
    const appStateCalls = mockSetDoc.mock.calls.filter(c => c[0] === 'users/tutor-sync-123/data/appState');
    expect(appStateCalls.length).toBeGreaterThanOrEqual(1);
    const lastPayload = appStateCalls[appStateCalls.length - 1][1];

    // Verify valid properties were preserved
    expect(lastPayload.settings.tutorName).toBe('Master Instructor');
    expect(lastPayload.students[0].name).toBe('Student One');
    expect(lastPayload.students[0].nestedMeta.level).toBe(8);

    // Verify undefined properties were stripped
    expect('undefSetting' in lastPayload.settings).toBe(false);
    expect('undefProp' in lastPayload.students[0]).toBe(false);
    expect('undefNested' in lastPayload.students[0].nestedMeta).toBe(false);

    // Deep check that no property in lastPayload is undefined
    const checkNoUndefined = (obj: any): boolean => {
      if (obj === undefined) return false;
      if (obj === null || typeof obj !== 'object') return true;
      for (const [_, val] of Object.entries(obj)) {
        if (val === undefined) return false;
        if (!checkNoUndefined(val)) return false;
      }
      return true;
    };
    expect(checkNoUndefined(lastPayload)).toBe(true);

    // Verify root tutor metadata was also written
    const rootUserCalls = mockSetDoc.mock.calls.filter(c => c[0] === 'users/tutor-sync-123');
    expect(rootUserCalls.length).toBeGreaterThanOrEqual(1);
    const lastRootPayload = rootUserCalls[rootUserCalls.length - 1][1];
    expect(lastRootPayload).toEqual(
      expect.objectContaining({
        email: 'tutor123@example.com',
        tutorName: 'Master Instructor',
        studentCount: 1,
      })
    );
    expect(checkNoUndefined(lastRootPayload)).toBe(true);
  });

  it('strips undefined nested properties on initial state migration/upload', async () => {
    authState.currentUser = { uid: 'migrating-tutor-999', email: 'migration@test.com' };
    localStorage.setItem(
      'tuitrix_data',
      JSON.stringify({
        version: 1,
        settings: { tutorName: 'Migrated Tutor', currency: '৳', lastBackup: null, theme: 'dark' },
        profile: { credentials: '', brandTitle: '', showPrintHeader: true, showPrintWatermark: true },
        ai: { provider: 'gemini', models: {}, keys: {} },
        students: [{ id: 's99', name: 'Migrated Student', active: true, createdAt: '2026-11-13' }],
        batches: [],
        lessons: [],
        contracts: [],
        payments: [],
        expenses: [],
        docs: [],
        savedResources: [],
        goals: [],
        exams: [],
        attempts: [],
        promoCodes: [],
      })
    );

    render(
      <storeContext.StoreProvider>
        <div>Migration Ready</div>
      </storeContext.StoreProvider>
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const calls = mockSetDoc.mock.calls.filter(c => c[0] === 'users/migrating-tutor-999/data/appState');
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const uploadedData = calls[0][1];
    expect(uploadedData.settings.tutorName).toBe('Migrated Tutor');
    expect(uploadedData.students[0].name).toBe('Migrated Student');

    const checkNoUndefined = (obj: any): boolean => {
      if (obj === undefined) return false;
      if (obj === null || typeof obj !== 'object') return true;
      for (const [_, val] of Object.entries(obj)) {
        if (val === undefined) return false;
        if (!checkNoUndefined(val)) return false;
      }
      return true;
    };
    expect(checkNoUndefined(uploadedData)).toBe(true);

    const rootCalls = mockSetDoc.mock.calls.filter(c => c[0] === 'users/migrating-tutor-999');
    expect(rootCalls.length).toBeGreaterThanOrEqual(1);
    expect(rootCalls[0][1]).toEqual(
      expect.objectContaining({
        email: 'migration@test.com',
        tutorName: 'Migrated Tutor',
        studentCount: 1,
      })
    );
  });
});
