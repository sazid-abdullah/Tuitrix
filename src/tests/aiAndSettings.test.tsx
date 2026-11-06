/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  callAI,
  estimateInputTokens,
  autoModel,
  extractAndPlaceholderMedia,
  restoreMediaPlaceholders,
  extractFileText,
  normalizeExam,
  isDummyExam,
  examJsonPrompt,
  renderMarkdown,
  parseAiJson,
  renderDiagramSpecToSvgDataUri,
} from '../services/ai';
import { AIView } from '../views/AIView';
import { lazyWithRetry } from '../App';
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
    // with file: 1500 base64 chars -> Math.ceil(1500 / 750) = 2 tokens
    const tokensWithFile = estimateInputTokens('123', [
      { mimeType: 'image/png', data: 'a'.repeat(1500) }
    ]);
    expect(tokensWithFile).toBe(1 + 2);
    // with embedded data-URI image: 258 tokens + 1 text token = 259
    const tokensWithDataUri = estimateInputTokens('123data:image/png;base64,AAAA');
    expect(tokensWithDataUri).toBe(1 + 258);
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
        models: { gemini: 'gemini-3.8-flash' },
      },
    };

    const fallbackMessages: string[] = [];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('gemini-3.8-flash')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: { message: 'models/gemini-3.8-flash is not found' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              { content: { parts: [{ text: 'Recovered on gemini-3.7-flash' }] } },
            ],
          }),
      });
    });

    const result = await callAI('System', 'Prompt', mockState, {
      onFallback: (msg) => fallbackMessages.push(msg),
    });

    expect(result).toBe('Recovered on gemini-3.7-flash');
    expect(fallbackMessages[0]).toContain('Switching from gemini-3.8-flash to gemini-3.7-flash');
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

describe('autoModel auto-upgrades deprecated gemini-2.5 models', () => {
  it('automatically upgrades cached gemini-2.5-flash and gemini-2.0-flash to gemini-3.8-flash', () => {
    const stateWith25Flash: any = {
      ai: {
        provider: 'gemini',
        keys: { gemini: 'key' },
        models: { gemini: 'gemini-2.5-flash' },
      },
    };
    expect(autoModel('gemini', stateWith25Flash)).toBe('gemini-3.8-flash');

    const stateWith20Flash: any = {
      ai: {
        provider: 'gemini',
        keys: { gemini: 'key' },
        models: { gemini: 'gemini-2.0-flash' },
      },
    };
    expect(autoModel('gemini', stateWith20Flash)).toBe('gemini-3.8-flash');

    const stateWith35Flash: any = {
      ai: {
        provider: 'gemini',
        keys: { gemini: 'key' },
        models: { gemini: 'gemini-3.5-flash' },
      },
    };
    expect(autoModel('gemini', stateWith35Flash)).toBe('gemini-3.5-flash');
  });
});

describe('Media Placeholder Extraction & Restoration on 50-MCQ Picture Papers', () => {
  it('shrinks a 50-MCQ paper with embedded base64 images to under 5,000 tokens and restores all images', () => {
    // Generate 50 MCQs with embedded base64 images (~1,000 chars base64 each -> >50,000 chars of base64)
    const questionsText = Array.from({ length: 50 }, (_, i) => {
      const dummyBase64 = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP${'8'.repeat(1000)}z8=`;
      return `Q${i + 1}. Look at diagram: ${dummyBase64}\nWhat is the value in diagram ${i + 1}?\nA) 1\nB) 2\nC) 3\nD) 4\nAnswer: A\n`;
    }).join('\n');

    const fullContent = `Physics 50-MCQ Model Test\n\n${questionsText}\nstream\nBinaryGarbageStreamData\nendstream`;

    // Raw content token estimate is large
    const rawTokens = estimateInputTokens(fullContent);
    expect(rawTokens).toBeGreaterThan(12000);

    // Extract placeholders
    const { cleanText, mediaMap } = extractAndPlaceholderMedia(fullContent);

    // Media map must hold all 50 images
    expect(Object.keys(mediaMap).length).toBe(50);
    // Clean text must not have raw PDF binary noise
    expect(cleanText).not.toContain('BinaryGarbageStreamData');
    // Token estimate for the cleaned text sent to AI should be well under 5,000 tokens
    const cleanTokens = estimateInputTokens(cleanText);
    expect(cleanTokens).toBeLessThan(5000);

    // Mock parsed exam JSON output from AI that contains placeholders
    const parsedExam = {
      title: 'Physics 50-MCQ Model Test',
      questions: Array.from({ length: 50 }, (_, i) => ({
        id: `q${i + 1}`,
        type: 'mcq',
        text: `Look at diagram: __TUITRIX_MEDIA_${i}__\nWhat is the value in diagram ${i + 1}?`,
        options: ['1', '2', '3', '4'],
        answer: 0,
      })),
    };

    // Restore media placeholders
    const restored = restoreMediaPlaceholders(parsedExam, mediaMap);

    // Verify all 50 questions have their original base64 images intact
    expect(restored.questions.length).toBe(50);
    for (let i = 0; i < 50; i++) {
      expect(restored.questions[i].text).toContain('data:image/png;base64,');
      expect(restored.questions[i].text).not.toContain(`__TUITRIX_MEDIA_${i}__`);
    }
  });
});

describe('extractFileText PDF and Image Guard', () => {
  it('throws helpful message when PDF or image files are selected', async () => {
    const pdfFile = new File(['%PDF-1.4 binary content'], 'exam.pdf', { type: 'application/pdf' });
    await expect(extractFileText(pdfFile)).rejects.toThrow(
      'For PDF or image question papers, please use the "Upload question paper" button so AI can read diagrams and questions accurately.'
    );

    const pngFile = new File(['png bytes'], 'diagram.png', { type: 'image/png' });
    await expect(extractFileText(pngFile)).rejects.toThrow(
      'For PDF or image question papers, please use the "Upload question paper" button so AI can read diagrams and questions accurately.'
    );
  });
});

describe('Exam Invalidation & normalizeExam Guards', () => {
  it('correctly detects dummy placeholder exams via isDummyExam', () => {
    // Falsy or malformed exam structures
    expect(isDummyExam(null)).toBe(true);
    expect(isDummyExam(undefined)).toBe(true);
    expect(isDummyExam({})).toBe(true);
    expect(isDummyExam({ questions: null })).toBe(true);
    expect(isDummyExam({ questions: [] })).toBe(true);
    expect(isDummyExam({ questions: 'invalid' })).toBe(true);

    // Dummy exams with sample MCQ or placeholder question text
    expect(
      isDummyExam({
        questions: [{ id: 'q1', type: 'mcq', text: 'Sample MCQ question text' }],
      })
    ).toBe(true);
    expect(
      isDummyExam({
        questions: [{ id: 'q1', type: 'mcq', text: 'Question text' }],
      })
    ).toBe(true);
    expect(
      isDummyExam({
        questions: [{ id: 'q1', type: 'mcq', text: 'sample mcq 1' }],
      })
    ).toBe(true);
    expect(
      isDummyExam({
        questions: [{ id: 'q1', type: 'mcq', text: 'Question Text Here' }],
      })
    ).toBe(true);

    // Valid real questions should NOT be flagged as dummy
    expect(
      isDummyExam({
        questions: [
          {
            id: 'q1',
            type: 'mcq',
            text: 'What is Newton’s Second Law of Motion?',
            options: ['F=ma', 'E=mc^2', 'V=IR', 'P=IV'],
          },
        ],
      })
    ).toBe(false);

    expect(
      isDummyExam({
        questions: [
          { id: 'q1', type: 'mcq', text: 'Sample MCQ question text' },
          { id: 'q2', type: 'mcq', text: 'Real Question 2' },
        ],
      })
    ).toBe(false);
  });

  it('rejects stale dummy exams from the cache in onStartExam matching logic', () => {
    const dummyExam = {
      id: 'exam-dummy-1',
      docId: 'doc-101',
      title: 'Physics Chapter 1',
      questions: [{ id: 'q1', type: 'mcq', text: 'Sample MCQ question text' }],
    };

    const doc = {
      id: 'doc-101',
      title: 'Physics Chapter 1',
      content: '1. What is force?\nA) Push or pull\nB) Velocity\nC) Mass\nD) Acceleration',
      type: 'exam',
      studentId: null,
      createdAt: '2026-11-06T12:00:00.000Z',
    };

    const state = {
      exams: [dummyExam],
    };

    const isDummy = (ex: any) => {
      if (!ex || !Array.isArray(ex.questions) || ex.questions.length === 0) return true;
      if (ex.questions.length === 1 && /sample mcq|question text/i.test(ex.questions[0]?.text || '')) return true;
      return false;
    };

    let existingExam = state.exams.find(
      (e) =>
        (e.docId === doc.id || e.id === doc.id || (e.title && e.title.trim() === doc.title.trim())) &&
        !isDummy(e)
    );

    // Cache lookup must ignore dummy exam so re-parsing is triggered
    expect(existingExam).toBeUndefined();

    // Now populate with a valid parsed exam
    const validExam = {
      id: 'exam-valid-1',
      docId: 'doc-101',
      title: 'Physics Chapter 1',
      questions: [
        {
          id: 'q1',
          type: 'mcq',
          text: 'What is force?',
          options: ['Push or pull', 'Velocity', 'Mass', 'Acceleration'],
        },
      ],
    };

    state.exams.push(validExam);

    existingExam = state.exams.find(
      (e) =>
        (e.docId === doc.id || e.id === doc.id || (e.title && e.title.trim() === doc.title.trim())) &&
        !isDummy(e)
    );

    expect(existingExam).toBeDefined();
    expect(existingExam?.id).toBe('exam-valid-1');
  });

  it('verifies normalizeExam does not manufacture questions from empty input', () => {
    expect(normalizeExam({}).questions).toEqual([]);
    expect(normalizeExam(null).questions).toEqual([]);
    expect(normalizeExam(undefined).questions).toEqual([]);
    expect(normalizeExam({ questions: [] }).questions).toEqual([]);
    expect(normalizeExam({ questions: null }).questions).toEqual([]);
    expect(normalizeExam({ questions: undefined }).questions).toEqual([]);
    expect(normalizeExam({ title: 'Mock Exam', questions: [] }).questions).toEqual([]);
    expect(normalizeExam({ questions: [{}] }).questions.length).toBe(1);
  });

  it('examJsonPrompt explicitly instructs AI to extract all questions and return empty array if none found', () => {
    const prompt = examJsonPrompt('Any document text');
    expect(prompt).toContain(
      'CRITICAL: Extract ALL questions present in the document. Do not output placeholder questions. If no questions are found, return {"questions": []}.'
    );
  });

  it('rejects raw binary %PDF- document content with friendly error toast', () => {
    const toastMock = vi.fn();
    const pdfDoc = {
      id: 'doc-pdf',
      title: 'Physics Test',
      content: '%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<...>>',
      type: 'exam',
      createdAt: new Date().toISOString(),
    };

    // Simulate onStartExam guard
    if (pdfDoc.content?.trim().startsWith('%PDF-')) {
      toastMock(
        "This document contains raw binary PDF data. Please upload it via 'Upload question paper' so AI Vision can extract all questions.",
        'error'
      );
    }

    expect(toastMock).toHaveBeenCalledWith(
      "This document contains raw binary PDF data. Please upload it via 'Upload question paper' so AI Vision can extract all questions.",
      'error'
    );
  });

  it('throws error when AI extraction yields zero questions instead of saving empty exam', () => {
    const parsedExam = normalizeExam({ title: 'Empty Extracted Exam', questions: [] });
    expect(() => {
      if (parsedExam.questions.length === 0) {
        throw new Error(
          'AI could not extract valid questions from this document. Please ensure the paper has numbered questions.'
        );
      }
    }).toThrow(
      'AI could not extract valid questions from this document. Please ensure the paper has numbered questions.'
    );
  });

  it('converts inline <svg> strings in q.figure into data:image/svg+xml;utf8,... data URIs and preserves stimulus Markdown tables', () => {
    const rawSvg = '<svg viewBox="0 0 260 110" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" stroke="#38bdf8" fill="none" /><text x="50" y="55" fill="#e2e8f0">AND Gate</text></svg>';
    const truthTableStimulus = '| A | B | Output |\n|---|---|--------|\n| 0 | 0 | 0      |\n| 0 | 1 | 0      |\n| 1 | 0 | 0      |\n| 1 | 1 | 1      |';

    const rawExam = {
      title: 'Digital Logic Exam',
      duration: 45,
      questions: [
        {
          id: 'q1',
          type: 'mcq',
          stimulus: truthTableStimulus,
          figure: rawSvg,
          text: 'Which logic gate is depicted above?',
          options: ['AND', 'OR', 'NOT', 'XOR'],
          answer: 0,
        },
        {
          id: 'q2',
          type: 'cq',
          stimulus: truthTableStimulus,
          figure: `  ${rawSvg}  `,
          parts: [
            { label: 'a', text: 'Define the gate operation.', marks: 2 },
          ],
        },
        {
          id: 'q3',
          type: 'written',
          stimulus: truthTableStimulus,
          figure: 'https://example.com/gate.png',
          text: 'Explain circuit behavior.',
          marks: 4,
        },
      ],
    };

    const normalized = normalizeExam(rawExam);

    // Verify q1 MCQ:
    const q1 = normalized.questions[0] as any;
    expect(q1.stimulus).toBe(truthTableStimulus);
    expect(q1.figure).toBe(`data:image/svg+xml;utf8,${encodeURIComponent(rawSvg)}`);

    // Verify q2 CQ:
    const q2 = normalized.questions[1] as any;
    expect(q2.stimulus).toBe(truthTableStimulus);
    expect(q2.figure).toBe(`data:image/svg+xml;utf8,${encodeURIComponent(rawSvg)}`);

    // Verify q3 Written:
    const q3 = normalized.questions[2] as any;
    expect(q3.stimulus).toBe(truthTableStimulus);
    expect(q3.figure).toBe('https://example.com/gate.png');
  });

  it('renders markdown images with exam-fig class and max-width style in renderMarkdown', () => {
    const md = 'Here is the diagram:\n\n![Logic Gate](data:image/svg+xml;utf8,%3Csvg%3E%3C%2Fsvg%3E)\n\nAnswer the question.';
    const html = renderMarkdown(md);
    expect(html).toContain('<img src="data:image/svg+xml;utf8,%3Csvg%3E%3C%2Fsvg%3E" alt="Logic Gate" class="exam-fig" style="max-width:100%;margin:8px 0;" />');
  });

  it('examJsonPrompt includes figure in structure and instructions for compact diagram specs', () => {
    const prompt = examJsonPrompt('Logic gate test');
    expect(prompt).toContain('"figure": ""');
    expect(prompt).toContain(
      'NEVER output raw <svg> XML tags inside JSON (they waste tokens and break JSON escaping). Instead, for visual/picture questions:'
    );
    expect(prompt).toContain(
      'For tables (truth tables, place-value tables), put a Markdown pipe table in "stimulus".'
    );
    expect(prompt).toContain(
      'For logic gates, set "figure" to "gate:AND(A,B->Y)", "gate:OR(A,B->Y)", "gate:NOT(A->Y)", "gate:NAND(A,B->Y)", "gate:NOR(A,B->Y)", "gate:XOR(A,B->Y)", or "gate:XNOR(A,B->Y)"'
    );
    expect(prompt).toContain(
      'For digital device/flip-flop blocks, set "figure" to "block:(Pin1,Pin2->Out1,Out2)"'
    );
    expect(prompt).toContain(
      'For 7-segment displays, set "figure" to "seg7:3" (with the lit digit). For number boxes, set "figure" to "boxes:3|C"'
    );
  });

  describe('Compact Diagram Spec Renderer (renderDiagramSpecToSvgDataUri)', () => {
    it('renders gate:AND(A,B->Y) without leaking the text "AND" inside the SVG', () => {
      const uri = renderDiagramSpecToSvgDataUri('gate:AND(A,B->Y)');
      expect(uri).toBeDefined();
      expect(uri).toMatch(/^data:image\/svg\+xml;utf8,/);

      const decodedSvg = decodeURIComponent(uri!.replace('data:image/svg+xml;utf8,', ''));
      expect(decodedSvg).toContain('viewBox="0 0 260 110"');
      expect(decodedSvg).toContain('>A<');
      expect(decodedSvg).toContain('>B<');
      expect(decodedSvg).toContain('>Y<');
      // Crucial: The gate type "AND" must NOT be printed as text inside the SVG
      expect(decodedSvg).not.toMatch(/>\s*AND\s*</i);
      expect(decodedSvg).not.toContain('text>AND');
    });

    it('renders all standard logic gates properly', () => {
      const gates = ['OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR'];
      for (const g of gates) {
        const uri = renderDiagramSpecToSvgDataUri(`gate:${g}(A,B->Y)`);
        expect(uri).toBeDefined();
        const decoded = decodeURIComponent(uri!.replace('data:image/svg+xml;utf8,', ''));
        // Verify gate label is not leaked in text
        expect(decoded).not.toContain(`>${g}<`);
      }
    });

    it('renders IC block without printing the device answer name in the box', () => {
      const uri = renderDiagramSpecToSvgDataUri('block:FullAdder(A,B,Cin->Sum,Cout)');
      expect(uri).toBeDefined();
      const decoded = decodeURIComponent(uri!.replace('data:image/svg+xml;utf8,', ''));
      expect(decoded).toContain('viewBox="0 0 260 120"');
      expect(decoded).toContain('>A<');
      expect(decoded).toContain('>Sum<');
      expect(decoded).toContain('>Cout<');
      // Must not leak the device name
      expect(decoded).not.toContain('FullAdder');
    });

    it('renders 7-segment display for numeric digits', () => {
      const uri = renderDiagramSpecToSvgDataUri('seg7:3');
      expect(uri).toBeDefined();
      const decoded = decodeURIComponent(uri!.replace('data:image/svg+xml;utf8,', ''));
      expect(decoded).toContain('viewBox="0 0 120 160"');
      // Lit segments should use #38bdf8
      expect(decoded).toContain('fill="#38bdf8"');
    });

    it('renders digit boxes for boxes:3|C and boxes:1011(8,4,2,1)', () => {
      const uri1 = renderDiagramSpecToSvgDataUri('boxes:3|C');
      expect(uri1).toBeDefined();
      const decoded1 = decodeURIComponent(uri1!.replace('data:image/svg+xml;utf8,', ''));
      expect(decoded1).toContain('>3<');
      expect(decoded1).toContain('>C<');

      const uri2 = renderDiagramSpecToSvgDataUri('boxes:1011(8,4,2,1)');
      expect(uri2).toBeDefined();
      const decoded2 = decodeURIComponent(uri2!.replace('data:image/svg+xml;utf8,', ''));
      expect(decoded2).toContain('>8<');
      expect(decoded2).toContain('>1<');
    });

    it('returns undefined for invalid or unrecognized specs', () => {
      expect(renderDiagramSpecToSvgDataUri('')).toBeUndefined();
      expect(renderDiagramSpecToSvgDataUri('unknown:something')).toBeUndefined();
      expect(renderDiagramSpecToSvgDataUri('https://example.com/img.png')).toBeUndefined();
    });
  });

  describe('parseAiJson Truncated Array Recovery', () => {
    it('recovers completed questions from partially truncated JSON response', () => {
      const truncatedRaw = `\`\`\`json
{
  "title": "SSC Physics 2026",
  "duration": 60,
  "instructions": "Answer all questions",
  "cqChoose": 0,
  "questions": [
    {
      "type": "mcq",
      "n": "1",
      "stimulus": "",
      "figure": "gate:AND(A,B->Y)",
      "text": "What is the output when A=1, B=1?",
      "options": ["0", "1", "High-Z", "Undefined"],
      "answer": 1,
      "marks": 1
    },
    {
      "type": "mcq",
      "n": "2",
      "stimulus": "",
      "figure": "",
      "text": "Which logic gate performs inversion?",
      "options": ["OR", "AND", "NOT", "XOR"],
      "answer": 2,
      "marks": 1
    },
    {
      "type": "cq",
      "n": "3",
      "stimulus": "A student builds a combinational logic circuit.",
      "parts": [
        { "label": "a", "text": "What is a universal gate?", "marks": 1, "answer": "NAND and NOR gates." },
        { "label": "b", "text": "Explain De Morgan laws.", "marks": 2, "answer": "De Morgan theorem statements." }
      ]
    },
    {
      "type": "mcq",
      "n": "4",
      "stimulus": "",
      "figure": "seg7:7",
      "text": "Truncated mid-sentence and missing braces...`;

      const result = parseAiJson(truncatedRaw);
      expect(result).toBeDefined();
      expect(result.title).toBe('SSC Physics 2026');
      expect(Array.isArray(result.questions)).toBe(true);
      // All 3 completed questions must be cleanly recovered!
      expect(result.questions.length).toBe(3);
      expect(result.questions[0].n).toBe('1');
      expect(result.questions[1].n).toBe('2');
      expect(result.questions[2].n).toBe('3');
      expect(result.questions[2].parts.length).toBe(2);
    });
  });

  describe('lazyWithRetry Auto-Recovery', () => {
    beforeEach(() => {
      sessionStorage.clear();
      vi.restoreAllMocks();
    });

    it('loads component successfully and clears tuitrix_chunk_reload', async () => {
      sessionStorage.setItem('tuitrix_chunk_reload', '1');
      const DummyComponent = () => React.createElement('div', null, 'Loaded');
      const factory = vi.fn().mockResolvedValue({ default: DummyComponent });

      const LazyComp = lazyWithRetry(factory);
      const { container } = render(
        React.createElement(React.Suspense, { fallback: 'Loading...' }, React.createElement(LazyComp))
      );

      await waitFor(() => {
        expect(container.textContent).toContain('Loaded');
      });
      expect(sessionStorage.getItem('tuitrix_chunk_reload')).toBeNull();
    });

    it('reloads page on chunk loading error when reload flag is not set', async () => {
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { ...window.location, reload: reloadMock },
        writable: true,
      });

      const chunkError = new Error('Failed to fetch dynamically imported module: ./chunk-xyz.js');
      const factory = vi.fn().mockRejectedValue(chunkError);

      const LazyComp = lazyWithRetry(factory);

      render(
        React.createElement(
          'div',
          null,
          React.createElement(React.Suspense, { fallback: 'Loading...' }, React.createElement(LazyComp))
        )
      );

      await waitFor(() => {
        expect(sessionStorage.getItem('tuitrix_chunk_reload')).toBe('1');
        expect(reloadMock).toHaveBeenCalled();
      });
    });
  });
});
