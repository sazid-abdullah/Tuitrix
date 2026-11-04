/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { HelpCenterView } from '../views/HelpCenterView';
import { LandingView } from '../views/LandingView';
import * as context from '../store/context';
import * as firebaseServices from '../services/firebase';

const mockPricing = {
  monthlyPriceBdt: 120,
  yearlyPriceBdt: 1200,
  freeStudentLimit: 8,
  promoText: '',
  promoCodes: [],
  bkashNumber: '01712345678',
  nagadNumber: '01812345678',
  rocketNumber: '01912345678',
  supportWhatsapp: '01799999999',
  supportEmail: 'support@tuitrix.com',
  faqs: [
    {
      id: 'faq_1',
      category: 'getting_started' as const,
      qEn: 'How do I start?',
      aEn: 'Click Add Student.',
      qBn: '', // Empty Bangla: should fallback to English
      aBn: '   ', // Whitespace Bangla: should fallback to English
      sortOrder: 1,
    },
    {
      id: 'faq_2',
      category: 'billing' as const,
      qEn: 'How to pay?',
      aEn: 'Send bKash.',
      qBn: 'কীভাবে পেমেন্ট করবেন?',
      aBn: 'বিকাশে পাঠান।',
      sortOrder: 2,
    },
  ],
  updatedAt: Date.now(),
};

vi.mock('../services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/firebase')>();
  return {
    ...actual,
    db: null,
    fetchPricingConfig: vi.fn(() => Promise.resolve(mockPricing)),
  };
});

describe('HelpCenterView Bangla Fallback, Lang Toggle & WhatsApp Phone', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('falls back to English qEn/aEn when qBn/aBn is empty in Bangla mode', async () => {
    localStorage.setItem('tuitrix_lang', 'BN');
    render(<HelpCenterView onNavigate={mockNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('কীভাবে পেমেন্ট করবেন?')).toBeInTheDocument();
    });

    // faq_1 has empty/whitespace qBn, so it should display qEn 'How do I start?'
    expect(screen.getByText('How do I start?')).toBeInTheDocument();

    // Click on the accordion item to expand and verify answer fallback
    const headerBtn = screen.getByText('How do I start?').closest('button');
    expect(headerBtn).toBeInTheDocument();
    if (headerBtn) fireEvent.click(headerBtn);

    await waitFor(() => {
      expect(screen.getByText('Click Add Student.')).toBeInTheDocument();
    });
  });

  it('toggles language when .help-lang-badge button is clicked and dispatches custom event', async () => {
    localStorage.setItem('tuitrix_lang', 'EN');
    const eventSpy = vi.fn();
    window.addEventListener('tuitrix_lang_change', eventSpy);

    render(<HelpCenterView onNavigate={mockNavigate} />);

    const langBtn = screen.getByRole('button', { name: /🌐 English/i });
    expect(langBtn).toBeInTheDocument();

    act(() => {
      fireEvent.click(langBtn);
    });

    expect(localStorage.getItem('tuitrix_lang')).toBe('BN');
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'BN' })
    );

    window.removeEventListener('tuitrix_lang_change', eventSpy);
  });

  it('normalizes 11-digit 01-prefixed WhatsApp phone with 88', async () => {
    render(<HelpCenterView onNavigate={mockNavigate} />);

    await waitFor(() => {
      // In mockPricing, supportWhatsapp is '01799999999' (11 digits, starts with 01)
      const waLinks = document.querySelectorAll('a[href*="wa.me/8801799999999"]');
      expect(waLinks.length).toBeGreaterThan(0);
    });
  });
});

describe('LandingView Dynamic Limits, Navigation & FAQs', () => {
  const mockEnterApp = vi.fn();
  const mockSignIn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders dynamic freeStudentLimit and monthly price from pricingConfig', async () => {
    localStorage.setItem('tuitrix_pricing', JSON.stringify({ freeStudentLimit: 8 }));
    vi.spyOn(context, 'useStore').mockReturnValue({
      user: null,
      billingState: null,
      state: { settings: { theme: 'dark' } },
      updateSettings: vi.fn(),
    } as any);

    render(<LandingView onEnterApp={mockEnterApp} onSignIn={mockSignIn} />);

    await waitFor(() => {
      expect(screen.getByText(/Up to 8 Students & 2 Batches/i)).toBeInTheDocument();
      expect(screen.getByText(/৳120/i)).toBeInTheDocument();
    });
  });

  it('navigates to #/help cleanly when View Full Help Centre button is clicked', async () => {
    vi.spyOn(context, 'useStore').mockReturnValue({
      user: null,
      billingState: null,
      state: { settings: { theme: 'dark' } },
      updateSettings: vi.fn(),
    } as any);

    render(<LandingView onEnterApp={mockEnterApp} onSignIn={mockSignIn} />);

    const helpBtn = screen.getByRole('button', { name: /View Full Help Centre & FAQ/i });
    fireEvent.click(helpBtn);

    expect(mockEnterApp).toHaveBeenCalled();
    await waitFor(() => {
      expect(window.location.hash).toBe('#/help');
    });
  });

  it('navigates to #/settings when signed-in non-pro user clicks Get Pro via TrxID', async () => {
    vi.spyOn(context, 'useStore').mockReturnValue({
      user: { email: 'tutor@test.com' },
      billingState: null,
      state: { settings: { theme: 'dark' } },
      updateSettings: vi.fn(),
    } as any);

    render(<LandingView onEnterApp={mockEnterApp} onSignIn={mockSignIn} />);

    const proBtn = screen.getByRole('button', { name: /Get Pro via TrxID/i });
    fireEvent.click(proBtn);

    expect(mockEnterApp).toHaveBeenCalled();
    await waitFor(() => {
      expect(window.location.hash).toBe('#/settings');
    });
  });

  it('sorts FAQs and falls back to qEn/aEn when qBn is empty in Bangla mode', async () => {
    localStorage.setItem('tuitrix_lang', 'BN');
    vi.spyOn(context, 'useStore').mockReturnValue({
      user: null,
      billingState: null,
      state: { settings: { theme: 'dark' } },
      updateSettings: vi.fn(),
    } as any);

    render(<LandingView onEnterApp={mockEnterApp} onSignIn={mockSignIn} />);

    await waitFor(() => {
      // faq_2 has qBn
      expect(screen.getByText('কীভাবে পেমেন্ট করবেন?')).toBeInTheDocument();
      // faq_1 has empty qBn, should fallback to qEn
      expect(screen.getByText('How do I start?')).toBeInTheDocument();
    });
  });
});
