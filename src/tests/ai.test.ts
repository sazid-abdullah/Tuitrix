import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectGeminiBillingTier, fetchModelList, sanitizeModelId, parseAiJson, extractFileText, getDefaultModel } from '../services/ai';

const mockState = {
  settings: { tutorName: '', currency: '৳' },
  ai: {
    provider: 'gemini' as const,
    keys: { gemini: 'test-key' },
    models: { gemini: '' }
  },
  students: [], lessons: [], payments: [], docs: [], goals: []
};

// Mock global fetch
const originalFetch = global.fetch;

describe('AI Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('detectGeminiBillingTier', () => {
    it('returns free on 429 quota error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429
      });
      const tier = await detectGeminiBillingTier('test-key');
      expect(tier).toBe('free');
    });

    it('returns paid on 200 OK', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200
      });
      const tier = await detectGeminiBillingTier('test-key');
      expect(tier).toBe('paid');
    });
  });

  describe('fetchModelList', () => {
    it('filters out non-text models regardless of tier', async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes(':generateContent')) {
          return Promise.resolve({ ok: true, status: 200 }); // Paid tier
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            models: [
              { name: 'models/gemini-3.5-transcribe', displayName: 'Gemini 3.5 Transcribe', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/nano-banana-2.1', displayName: 'Nano Banana', supportedGenerationMethods: ['generateContent'] }
            ]
          })
        });
      });

      const result = await fetchModelList('gemini', mockState as any);
      expect(result.tier).toBe('paid');
      expect(result.list.length).toBe(1);
      expect(result.list[0].id).toBe('gemini-3.8-flash');
    });

    it('excludes paid-only models on Free Tier', async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes(':generateContent')) {
          return Promise.resolve({ ok: false, status: 429 }); // Free tier
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            models: [
              { name: 'models/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-4-argon', displayName: 'Gemini 4 Argon', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash Lite', supportedGenerationMethods: ['generateContent'] }
            ]
          })
        });
      });

      const result = await fetchModelList('gemini', mockState as any);
      expect(result.tier).toBe('free');
      expect(result.list.length).toBe(2);
      expect(result.list.map(m => m.id).sort()).toEqual(['gemini-3.5-flash-lite', 'gemini-3.8-flash'].sort());
    });

    it('includes paid Pro models on Paid Tier', async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes(':generateContent')) {
          return Promise.resolve({ ok: true, status: 200 }); // Paid tier
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            models: [
              { name: 'models/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
            ]
          })
        });
      });

      const result = await fetchModelList('gemini', mockState as any);
      expect(result.tier).toBe('paid');
      expect(result.list.length).toBe(2);
      expect(result.list.map(m => m.id).sort()).toEqual(['gemini-3.1-pro-preview', 'gemini-3.8-flash'].sort());
    });
  });

  describe('sanitizeModelId & getDefaultModel', () => {
    it('cleans model ids properly', () => {
      expect(sanitizeModelId('models/gemini-3.8-flash')).toBe('gemini-3.8-flash');
      expect(sanitizeModelId('gemini-3.8-flash — Fast & Capable')).toBe('gemini-3.8-flash');
      expect(sanitizeModelId('llama-3.3-70b-versatile – Recommended')).toBe('llama-3.3-70b-versatile');
      expect(sanitizeModelId('auto (gemini-3.8-flash)')).toBe('');
      expect(sanitizeModelId('')).toBe('');
    });

    it('returns default fallback model for each provider', () => {
      expect(getDefaultModel('gemini')).toBe('gemini-3.8-flash');
      expect(getDefaultModel('groq')).toBe('llama-3.3-70b-versatile');
      expect(getDefaultModel('openrouter')).toBe('openrouter/free');
    });
  });

  describe('parseAiJson', () => {
    it('parses direct JSON', () => {
      expect(parseAiJson('{"title":"Exam 1","questions":[]}')).toEqual({
        title: 'Exam 1',
        questions: [],
      });
    });

    it('parses markdown code-fenced JSON', () => {
      const fenced = '```json\n{"title":"Math Test","questions":[]}\n```';
      expect(parseAiJson(fenced)).toEqual({
        title: 'Math Test',
        questions: [],
      });
    });

    it('extracts embedded JSON object surrounded by conversational text', () => {
      const raw = 'Here is your generated exam paper:\n{"title":"Physics 101"}\nHope this helps your students!';
      expect(parseAiJson(raw)).toEqual({ title: 'Physics 101' });
    });

    it('parses AI marking response with markdown fences and backticks safely', () => {
      const rawAiMarking = '```json\n{\n  "marks": [\n    { "id": "q1", "part": 0, "marks": 4, "reason": "Accurate definition of Newton`s 2nd law" }\n  ]\n}\n```';
      const parsed = parseAiJson(rawAiMarking);
      expect(parsed.marks).toBeDefined();
      expect(parsed.marks[0].marks).toBe(4);
      expect(parsed.marks[0].reason).toContain("Newton`s 2nd law");
    });

    it('throws when no valid JSON is present', () => {
      expect(() => parseAiJson('Hello, I could not generate anything.')).toThrow(
        /AI did not return valid JSON/
      );
    });
  });

  describe('extractFileText', () => {
    it('reads standard text files directly', async () => {
      const txtFile = new File(['Sample question 1: What is Force?'], 'exam.txt', {
        type: 'text/plain',
      });
      const text = await extractFileText(txtFile);
      expect(text).toBe('Sample question 1: What is Force?');
    });

    it('throws clear error on corrupted or empty .docx files', async () => {
      const badDocx = new File([new Uint8Array([0, 1, 2, 3])], 'paper.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      await expect(extractFileText(badDocx)).rejects.toThrow(/Could not extract text from this .docx file/);
    });
  });
});
