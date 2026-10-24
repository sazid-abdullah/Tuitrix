import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';
import { App } from '../App';
import { LegalModal } from '../components/LegalModal';
import { StoreProvider } from '../store/context';
import * as firebaseServices from '../services/firebase';

vi.mock('../services/firebase', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    auth: {
      currentUser: { uid: 'test-uid' },
      onAuthStateChanged: vi.fn(() => vi.fn()),
    },
    db: {},
    deleteTutorAccountAndData: vi.fn(() => Promise.resolve()),
  };
});

describe('Legal & Compliance Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: {
        search: '',
        hash: '',
        pathname: '/',
        origin: 'http://localhost'
      },
      writable: true
    });
  });

  it('renders LegalModal with Privacy Policy correctly', () => {
    render(<LegalModal isOpen={true} initialTab="privacy" onClose={vi.fn()} />);

    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    expect(screen.getByText(/NEVER transmits student names/)).toBeInTheDocument();
  });

  it('renders LegalModal with Terms of Service correctly', () => {
    render(<LegalModal isOpen={true} initialTab="terms" onClose={vi.fn()} />);

    const termsHeadings = screen.getAllByText('Terms of Service');
    expect(termsHeadings.length).toBeGreaterThan(0);
    expect(screen.getByText(/Free Tier Quotas/)).toBeInTheDocument();
  });

  it('renders LegalModal with Billing & Refund correctly', () => {
    render(<LegalModal isOpen={true} initialTab="billing" onClose={vi.fn()} />);

    expect(screen.getByText('Billing & Refund Policy')).toBeInTheDocument();
    expect(screen.getByText(/bKash, Nagad, and Rocket TrxID/)).toBeInTheDocument();
  });

  it('renders LegalModal with Security correctly', () => {
    render(<LegalModal isOpen={true} initialTab="security" onClose={vi.fn()} />);

    expect(screen.getByText('Security & Data Protection')).toBeInTheDocument();
    expect(screen.getByText(/Encryption in Transit/)).toBeInTheDocument();
  });

  it('URL query parameters route to the correct Legal tab', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?legal=terms',
        hash: '',
        pathname: '/'
      },
      writable: true
    });

    await act(async () => {
      render(
        <StoreProvider>
          <App />
        </StoreProvider>
      );
    });

    const termsHeadings = screen.getAllByText('Terms of Service');
    expect(termsHeadings.length).toBeGreaterThan(0);
  });
});
