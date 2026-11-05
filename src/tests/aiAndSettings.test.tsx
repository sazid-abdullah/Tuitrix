/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { callAI, estimateInputTokens } from '../services/ai';
import { AIView } from '../views/AIView';
import * as context from '../store/context';
import { sanitizePlaceholder } from '../utils/auth';

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

const originalFetch = global.fetch;

describe('estimateInputTokens & Input Token Guard', () => {
  it('correctly calculates text tokens and file tokens', () => {
    // 30 characters -> 10 tokens
    expect(estimateInputTokens('123456789012345678901234567890')).toBe(10);
    // with file: 360 base64 chars -> 2 tokens
    const tokensWithFile = estimateInputTokens('123', [
      { mimeType: 'image/png', data: 'a'.repeat(360) }
    ]);
    expect(tokensWithFile).toBe(1 + 2);
  });

  it('blocks payloads over 75K tokens with explicit error', async () => {
    const hugeText = 'a'.repeat(75001 * 3);
    const mockState: any = {
      ai: {
        provider: 'gemini',
        keys: { gemini: 'fake-key' },
        models: { gemini: 'gemini-3.8-flash' },
      },
    };

    await expect(callAI('System prompt', hugeText, mockState)).rejects.toThrow(
      'Input document is too large for a single AI request (>75K tokens). Please upload fewer pages or select specific topics/chapters.'
    );
  });
});

describe('callAI Multi-Model Fallback Cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('automatically falls back from gemini-3.8-flash to gemini-3.7-flash on 429 response', async () => {
    const mockState: any = {
      ai: {
        provider: 'gemini',
        keys: { gemini: 'test-api-key' },
        models: { gemini: 'gemini-3.8-flash' },
      },
    };

    const requestedUrls: string[] = [];
    const fallbackMessages: string[] = [];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      requestedUrls.push(url);
      if (url.includes('gemini-3.8-flash')) {
        return Promise.resolve({
          ok: false,
          status: 429,
          json: () => Promise.resolve({ error: { message: 'Resource exhausted (quota limit)' } }),
        });
      }
      if (url.includes('gemini-3.7-flash')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              candidates: [
                { content: { parts: [{ text: 'Response from gemini-3.7-flash fallback' }] } },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 500 });
    });

    const result = await callAI('You are a math tutor.', 'Solve 2+2', mockState, {
      onFallback: (msg) => fallbackMessages.push(msg),
    });

    expect(result).toBe('Response from gemini-3.7-flash fallback');
    expect(requestedUrls[0]).toContain('gemini-3.8-flash');
    expect(requestedUrls[1]).toContain('gemini-3.7-flash');
    expect(fallbackMessages).toEqual([
      'Switching from gemini-3.8-flash to gemini-3.7-flash (rate limit or high demand)...',
    ]);
  });

  it('automatically falls back from gemini-3.8-flash on 503 service unavailable response', async () => {
    const mockState: any = {
      ai: {
        provider: 'gemini',
        keys: { gemini: 'test-api-key' },
        models: { gemini: 'gemini-3.8-flash' },
      },
    };

    const fallbackMessages: string[] = [];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('gemini-3.8-flash')) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: { message: 'Model overloaded' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              { content: { parts: [{ text: 'Recovered on 3.7-flash' }] } },
            ],
          }),
      });
    });

    const result = await callAI('System', 'Prompt', mockState, {
      onFallback: (msg) => fallbackMessages.push(msg),
    });

    expect(result).toBe('Recovered on 3.7-flash');
    expect(fallbackMessages.length).toBe(1);
    expect(fallbackMessages[0]).toContain('Switching from gemini-3.8-flash to gemini-3.7-flash');
  });

  it('automatically falls back on 404 or 400 deprecation/not-found error', async () => {
    const mockState: any = {
      ai: {
        provider: 'gemini',
        keys: { gemini: 'test-api-key' },
        models: { gemini: 'gemini-2.5-flash' }, // Old deprecated key/model
      },
    };

    const fallbackMessages: string[] = [];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('gemini-2.5-flash')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: { message: 'models/gemini-2.5-flash is not found' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              { content: { parts: [{ text: 'Recovered on gemini-3.8-flash' }] } },
            ],
          }),
      });
    });

    const result = await callAI('System', 'Prompt', mockState, {
      onFallback: (msg) => fallbackMessages.push(msg),
    });

    expect(result).toBe('Recovered on gemini-3.8-flash');
    expect(fallbackMessages[0]).toContain('Switching from gemini-2.5-flash to gemini-3.8-flash');
  });

  it('filters out gemma models when json mode is requested', async () => {
    const mockState: any = {
      ai: {
        provider: 'gemini',
        keys: { gemini: 'test-api-key' },
        models: { gemini: 'gemini-3.8-flash' },
      },
    };

    const requestedUrls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      requestedUrls.push(url);
      return Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: { message: 'Quota' } }),
      });
    });

    await expect(
      callAI('System', 'Prompt', mockState, { json: true })
    ).rejects.toThrow(/Quota exceeded/);

    // Should contain gemini-3.8-flash, gemini-3.7-flash, etc. but NOT gemma
    expect(requestedUrls.some((u) => u.includes('gemma'))).toBe(false);
  });
});

describe('AIView Opt-In Check & Banner Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const baseMockState: any = {
    students: [{ id: 's1', name: 'Tanvir Ahmed', phone: '01711111111' }],
    contracts: [],
    batches: [],
    lessons: [],
    payments: [],
    docs: [],
    goals: [],
    attempts: [],
    savedResources: [],
    profile: { brandTitle: 'None', credentials: 'null' },
    settings: {
      tutorName: 'Master Tutor',
      coachingName: 'None',
      currency: '৳',
    },
    ai: {
      provider: 'gemini',
      keys: { gemini: 'api-key' },
      models: { gemini: 'gemini-3.8-flash' },
    },
    dailyAiQuota: { date: '2026-11-04', used: 0 },
    billing: { tier: 'pro', validUntil: 2000000000000 },
  };

  it('renders check with AI checkbox defaulting to false (unchecked) in exam tool', () => {
    vi.spyOn(context, 'useStore').mockReturnValue({
      state: baseMockState,
      dispatch: vi.fn(),
      saveDoc: vi.fn(),
      deleteDoc: vi.fn(),
      saveAiResource: vi.fn(),
      deleteAiResource: vi.fn(),
      toggleFavoriteResource: vi.fn(),
      consumeAiCredit: vi.fn(),
      toast: vi.fn(),
      openModal: vi.fn(),
      closeModal: vi.fn(),
    } as any);

    render(
      <AIView
        initialTool="exam"
        onNavigate={vi.fn()}
        onStartExam={vi.fn()}
        onUploadPaper={vi.fn()}
        onImportDoc={vi.fn()}
      />
    );

    const checkWithAICheckbox = screen.getByLabelText(/Verify accuracy with automated second AI check/i) as HTMLInputElement;
    expect(checkWithAICheckbox).toBeInTheDocument();
    expect(checkWithAICheckbox.checked).toBe(false);
  });

  it('renders "Verify accuracy with AI" button and shows friendly banner on rate limit', async () => {
    vi.spyOn(context, 'useStore').mockReturnValue({
      state: baseMockState,
      dispatch: vi.fn(),
      saveDoc: vi.fn(),
      deleteDoc: vi.fn(),
      saveAiResource: vi.fn(),
      deleteAiResource: vi.fn(),
      toggleFavoriteResource: vi.fn(),
      consumeAiCredit: vi.fn(),
      toast: vi.fn(),
      openModal: vi.fn(),
      closeModal: vi.fn(),
    } as any);

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Initial exam generation succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              candidates: [
                { content: { parts: [{ text: '# Math Exam\n\n1. Solve 2+2.' }] } },
              ],
            }),
        });
      }
      // Secondary check call fails with rate limit 429
      return Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: { message: 'Rate limit hit' } }),
      });
    });

    render(
      <AIView
        initialTool="exam"
        onNavigate={vi.fn()}
        onStartExam={vi.fn()}
        onUploadPaper={vi.fn()}
        onImportDoc={vi.fn()}
      />
    );

    // Fill in subject & topics
    fireEvent.change(screen.getByPlaceholderText('e.g. Physics'), { target: { value: 'Math' } });
    fireEvent.change(screen.getByPlaceholderText(/One topic per line/i), { target: { value: 'Algebra' } });

    // Submit form
    fireEvent.click(screen.getByText('Generate exam paper'));

    // Wait for generated result
    await waitFor(() => {
      expect(screen.getByText('Verify accuracy with AI')).toBeInTheDocument();
    });

    // Click "Verify accuracy with AI"
    fireEvent.click(screen.getByText('Verify accuracy with AI'));

    // Rate limit banner should appear
    await waitFor(() => {
      expect(
        screen.getByText(
          'Secondary AI check skipped due to rate limit — your generated paper below is complete and ready.'
        )
      ).toBeInTheDocument();
    });
  });

  it('sanitizes "none", "null", "undefined", "n/a" placeholder strings', () => {
    expect(sanitizePlaceholder('None')).toBe('');
    expect(sanitizePlaceholder('null')).toBe('');
    expect(sanitizePlaceholder('N/A')).toBe('');
    expect(sanitizePlaceholder('  undefined  ')).toBe('');
    expect(sanitizePlaceholder('Apex Coaching')).toBe('Apex Coaching');
  });
});
