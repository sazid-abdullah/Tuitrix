import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary } from '../App';
import { StoreProvider, useStore } from '../store/context';
import * as firebaseServices from '../services/firebase';

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
}));

const ThrowError: React.FC<{ shouldThrow: boolean; message?: string }> = ({ shouldThrow, message }) => {
  if (shouldThrow) {
    throw new Error(message || 'Crash Test Error');
  }
  return <div>Normal Content Loaded</div>;
};

describe('ErrorBoundary auto-reset and onReset', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary resetKey="home:">
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Normal Content Loaded')).toBeInTheDocument();
  });

  it('renders error fallback on error and recovers cleanly when onReset is invoked', () => {
    const onReset = vi.fn();
    const { rerender } = render(
      <ErrorBoundary resetKey="home:" onReset={onReset}>
        <ThrowError shouldThrow={true} message="Test Exploded" />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong in this view')).toBeInTheDocument();
    expect(screen.getByText('Test Exploded')).toBeInTheDocument();

    // Click Reload View button
    const reloadBtn = screen.getByRole('button', { name: /Reload View/i });
    fireEvent.click(reloadBtn);

    expect(onReset).toHaveBeenCalled();
  });

  it('automatically resets hasError when resetKey prop changes', () => {
    let shouldCrash = true;
    const ComponentWithRouting = () => {
      const [route, setRoute] = useState('home');
      return (
        <div>
          <button onClick={() => { shouldCrash = false; setRoute('students'); }}>Navigate</button>
          <ErrorBoundary resetKey={`${route}:`}>
            <ThrowError shouldThrow={shouldCrash} message="Render Fail" />
          </ErrorBoundary>
        </div>
      );
    };

    render(<ComponentWithRouting />);
    expect(screen.getByText('Something went wrong in this view')).toBeInTheDocument();

    // Change route which updates resetKey
    const navBtn = screen.getByRole('button', { name: 'Navigate' });
    fireEvent.click(navBtn);

    // ErrorBoundary componentDidUpdate should reset hasError
    expect(screen.getByText('Normal Content Loaded')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong in this view')).not.toBeInTheDocument();
  });
});

describe('StoreContext debounce flush and auth switch cancellation', () => {
  let authCallback: any;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    (firebaseServices.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      authCallback = cb;
      return () => {};
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('flushes pending state to localStorage on beforeunload or pagehide', () => {
    const TestConsumer: React.FC = () => {
      const { saveStudent } = useStore();
      return (
        <button
          onClick={() => {
            saveStudent({ name: 'Emergency Student', phone: '01700000000', subjects: ['Math'] });
          }}
        >
          Add Student
        </button>
      );
    };

    render(
      <StoreProvider>
        <TestConsumer />
      </StoreProvider>
    );

    // Initial state in localStorage is default or empty
    const addBtn = screen.getByRole('button', { name: 'Add Student' });
    fireEvent.click(addBtn);

    // Before the 250ms debounce timer elapses:
    // Tab close happens (e.g. beforeunload)
    window.dispatchEvent(new Event('beforeunload'));

    const stored = JSON.parse(localStorage.getItem('tuitrix_data') || '{}');
    expect(stored.students).toBeDefined();
    expect(stored.students.some((s: any) => s.name === 'Emergency Student')).toBe(true);
  });

  it('cancels pending debounce timer on auth switch to prevent state leak', () => {
    let authUser: any = { uid: 'user_123', email: 'user@example.com' };
    (firebaseServices.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      authCallback = cb;
      cb(authUser);
      return () => {};
    });

    const TestConsumer: React.FC = () => {
      const { saveStudent } = useStore();
      return (
        <button
          onClick={() => {
            saveStudent({ name: 'User 1 Student', phone: '01800000000', subjects: ['Physics'] });
          }}
        >
          Add User Student
        </button>
      );
    };

    render(
      <StoreProvider>
        <TestConsumer />
      </StoreProvider>
    );

    // Queue a mutation
    const addBtn = screen.getByRole('button', { name: 'Add User Student' });
    fireEvent.click(addBtn);

    // Before 250ms debounce timer fires, user logs out (authCallback(null))
    act(() => {
      authCallback(null);
    });

    // Advance timers past 250ms
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Local storage should NOT have been overwritten with User 1's student data into guest mode
    const storedRaw = localStorage.getItem('tuitrix_data');
    if (storedRaw) {
      const parsed = JSON.parse(storedRaw);
      expect(parsed.students?.some((s: any) => s.name === 'User 1 Student')).toBeFalsy();
    }
  });
});
