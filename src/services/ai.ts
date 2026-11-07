import { AppState, Exam, Question, MCQQuestion, CQQuestion, WrittenQuestion } from '../types';
import { esc } from '../utils/date';
import { goalPlan, MoneySnapshotResult } from '../store/contracts';

export const AI_PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Free tier with a Google account. Best all-round choice, handles Bangla exceptionally well.',
    fallback: 'gemini-3.8-flash',
  },
  groq: {
    name: 'Groq',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    note: 'Free tier, ultra-fast inference with open models.',
    fallback: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    name: 'OpenRouter',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Many free models (names ending in ":free"). Free model selection changes periodically.',
    fallback: 'openrouter/free',
  },
  ollama: {
    name: 'Ollama (local, offline)',
    needsKey: false,
    keyUrl: 'https://ollama.com/download',
    note: 'Runs directly on your computer, no API key or internet required. Ensure OLLAMA_ORIGINS is configured.',
    fallback: '',
  },
};

const MODEL_CACHE_KEY = 'tuitrix_models';

export function readModelCache(): Record<string, any> {
  try {
    const c = JSON.parse(localStorage.getItem(MODEL_CACHE_KEY) || '{}');
    return c && typeof c === 'object' ? c : {};
  } catch (e) {
    return {};
  }
}

function writeModelCache(c: Record<string, any>) {
  try {
    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(c));
  } catch (e) {
    // ignore
  }
}

export function sanitizeModelId(raw: string): string {
  if (!raw) return '';
  // Strip any label text after em-dash, en-dash, or parentheses if accidentally stored
  let cleaned = String(raw).trim();
  if (cleaned.includes('—')) cleaned = cleaned.split('—')[0].trim();
  if (cleaned.includes('–')) cleaned = cleaned.split('–')[0].trim();
  if (/^auto\b/i.test(cleaned)) return '';
  cleaned = cleaned.replace(/^models\//, '').replace(/[^a-zA-Z0-9._:-]/g, '');
  return cleaned;
}

export function getDefaultModel(provider: 'gemini' | 'groq' | 'openrouter' | 'ollama'): string {
  return AI_PROVIDERS[provider]?.fallback || '';
}

export function autoModel(provider: 'gemini' | 'groq' | 'openrouter' | 'ollama', state: AppState): string {
  const userSelected = sanitizeModelId(state.ai?.models?.[provider] || '');
  if (userSelected) {
    if (provider === 'gemini' && /^gemini-2\.[05]/.test(userSelected)) {
      return 'gemini-3.8-flash';
    }
    return userSelected;
  }
  return getDefaultModel(provider);
}

export function parseAiJson(raw: string): any {
  const t = String(raw || '').trim();
  // 1. Try direct parse first
  try { return JSON.parse(t); } catch {}
  // 2. Strip markdown code fences if present
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }
  // 3. Extract outermost JSON object { ... }
  const firstBrace = t.indexOf('{');
  const lastBrace = t.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = t.slice(firstBrace, lastBrace + 1);
    try { return JSON.parse(candidate); } catch {}
  }
  // 4. Truncation recovery for questions array
  if (firstBrace !== -1 && t.includes('"questions"')) {
    const qIdx = t.indexOf('"questions"');
    const arrayStart = t.indexOf('[', qIdx);
    if (arrayStart !== -1) {
      let searchPos = t.length;
      while (searchPos > arrayStart) {
        const lastValidBrace = t.lastIndexOf('}', searchPos);
        if (lastValidBrace === -1 || lastValidBrace <= arrayStart) break;
        const candidate = t.slice(firstBrace, lastValidBrace + 1) + ']}';
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
            return parsed;
          }
        } catch {}
        searchPos = lastValidBrace - 1;
      }
    }
  }
  throw new Error('AI did not return valid JSON. Please try again or use a clearer question paper.');
}

export async function extractFileText(file: File): Promise<string> {
  if (/\.(pdf|jpe?g|png|webp|gif)$/i.test(file.name)) {
    throw new Error('For PDF or image question papers, please use the "Upload question paper" button so AI can read diagrams and questions accurately.');
  }
  if (/\.docx$/i.test(file.name)) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const view = new DataView(buf);
    let offset = 0;
    const decoder = new TextDecoder('utf-8');
    while (offset + 30 <= bytes.length) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break; // Local file header signature
      const compression = view.getUint16(offset + 8, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const fileNameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      const nameBytes = bytes.subarray(offset + 30, offset + 30 + fileNameLen);
      const entryName = decoder.decode(nameBytes);
      const dataStart = offset + 30 + fileNameLen + extraLen;
      const dataEnd = dataStart + compressedSize;
      if (entryName === 'word/document.xml' && dataEnd <= bytes.length) {
        const rawSlice = bytes.subarray(dataStart, dataEnd);
        let xmlText = '';
        if (compression === 0) {
          xmlText = decoder.decode(rawSlice);
        } else if (compression === 8 && typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          writer.write(rawSlice);
          writer.close();
          const decompressedBuf = await new Response(ds.readable).arrayBuffer();
          xmlText = decoder.decode(decompressedBuf);
        }
        if (xmlText) {
          const cleaned = xmlText
            .replace(/<\/w:p>/g, '\n')
            .replace(/<w:br[^>]*\/>/g, '\n')
            .replace(/<w:tab[^>]*\/>/g, '\t')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          if (cleaned) return cleaned;
        }
      }
      if (compressedSize === 0) break;
      offset = dataEnd;
    }
    throw new Error('Could not extract text from this .docx file. Please save as PDF or .txt and upload.');
  }
  return await file.text();
}

export async function detectGeminiBillingTier(apiKey: string): Promise<'free' | 'paid'> {
  if (!apiKey) return 'free';
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "hi" }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
    });

    if (res.ok) {
      return 'paid';
    }

    // Check if it's a quota error (limit: 0 or free tier indication)
    // 429 RESOURCE_EXHAUSTED, 403, 400, 404
    return 'free';
  } catch (err) {
    return 'free';
  }
}

export async function fetchModelList(provider: 'gemini' | 'groq' | 'openrouter' | 'ollama', state: AppState): Promise<{ list: { id: string, name: string }[], tier?: 'free' | 'paid' }> {
  const key = (state.ai.keys[provider] || '').trim();
  let models: { id: string, name: string }[] = [];
  let tier: 'free' | 'paid' | undefined = undefined;

  if (provider === 'gemini') {
    tier = await detectGeminiBillingTier(key);

    const url = key ? `https://generativelanguage.googleapis.com/v1beta/models?key=${key}` : 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gemini API error: ${res.statusText}`);
    const d = await res.json();

    const freeTierModels = [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
      'gemini-flash-lite-latest',
      'gemma-4-31b-it',
    ];

    models = (d.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m: any) => ({
        id: String(m.name || '').replace(/^models\//, ''),
        name: String(m.displayName || m.name || '').replace(/^models\//, ''),
      }))
      .filter((m: any) => {
        const lowerName = m.name.toLowerCase();
        const lowerId = m.id.toLowerCase();
        const combined = `${lowerId} ${lowerName}`;

        // Strictly Filter Out Non-Text / Specialized Models
        if (/banana|image|imagen|veo|transcribe|tts|audio|live|robotics|custom-tools|custom tools|embedding|aqa|learnlm|\bomni\b/.test(combined)) {
          return false;
        }

        // Filter out deprecated 2.5 models
        if (/gemini-2\.5|gemini-2\.0/.test(lowerId)) {
          return false;
        }

        if (tier === 'free') {
          // Free tier constraints
          const isFreeTierModel = /flash|flash-lite|gemma/.test(lowerId);
          const isPaidOnlyPro = /gemini-3\.1-pro|gemini-3-pro|gemini-pro-latest|gemini-4-argon|exp|preview/.test(lowerId);

          if (!isFreeTierModel) return false;
          if (isPaidOnlyPro) return false;
          return true;
        } else {
          // Paid tier
          return /^gemini-/.test(m.id) || /gemma/.test(m.id);
        }
      })
      .sort((a: any, b: any) => {
        const aIndex = freeTierModels.indexOf(a.id);
        const bIndex = freeTierModels.indexOf(b.id);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.id.localeCompare(b.id);
      });
  } else {
    const urls: Record<string, string> = {
      groq: 'https://api.groq.com/openai/v1/models',
      openrouter: 'https://openrouter.ai/api/v1/models',
      ollama: 'http://localhost:11434/v1/models',
    };
    const res = await fetch(urls[provider], {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
    if (!res.ok) throw new Error(`${provider} API error: ${res.statusText}`);
    const data = (await res.json()).data || [];
    models = data
      .map((m: any) => ({ id: String(m.id), name: String(m.name || m.id) }))
      .filter((m: any) => !/whisper|tts|guard|safety|embed|playai|distil|coder/.test(m.id));
  }

  const list = models.length ? models : [{ id: AI_PROVIDERS[provider].fallback, name: AI_PROVIDERS[provider].fallback }];
  const cache = readModelCache();
  cache[provider] = { list, tier, at: Date.now() };
  writeModelCache(cache);
  return { list, tier };
}

export function extractAndPlaceholderMedia(content: string): { cleanText: string; mediaMap: Record<string, string> } {
  if (!content) return { cleanText: '', mediaMap: {} };
  const mediaMap: Record<string, string> = {};
  let counter = 0;

  // 1. Strip raw PDF binary stream...endstream noise
  let cleanText = String(content).replace(/stream[\s\S]*?endstream/gi, '');

  // 2. Replace embedded data-URI images (base64)
  cleanText = cleanText.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/g, (match) => {
    const placeholder = `__TUITRIX_MEDIA_${counter++}__`;
    mediaMap[placeholder] = match;
    return placeholder;
  });

  // 3. Replace embedded inline SVGs
  cleanText = cleanText.replace(/<svg[\s\S]*?<\/svg>/gi, (match) => {
    const placeholder = `__TUITRIX_MEDIA_${counter++}__`;
    mediaMap[placeholder] = match;
    return placeholder;
  });

  // 4. Safe truncation to at most 120,000 characters
  if (cleanText.length > 120000) {
    cleanText = cleanText.slice(0, 120000);
  }

  return { cleanText, mediaMap };
}

export function restoreMediaPlaceholders(obj: any, mediaMap: Record<string, string>): any {
  if (!obj || !mediaMap || Object.keys(mediaMap).length === 0) return obj;

  const restoreString = (str: string): string => {
    if (typeof str !== 'string' || !str.includes('__TUITRIX_MEDIA_')) return str;
    return str.replace(/__TUITRIX_MEDIA_\d+__/g, (placeholder) => mediaMap[placeholder] || placeholder);
  };

  if (typeof obj === 'string') {
    return restoreString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => restoreMediaPlaceholders(item, mediaMap));
  }

  if (typeof obj === 'object') {
    const res: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      res[key] = restoreMediaPlaceholders(obj[key], mediaMap);
    }
    return res;
  }

  return obj;
}

export function estimateInputTokens(text: string, files: Array<{ mimeType: string; data: string }> = []): number {
  const imageRegex = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/g;
  const embeddedImageMatches = (text || '').match(imageRegex) || [];
  const strippedText = (text || '').replace(imageRegex, '');
  const textTokens = Math.ceil(strippedText.length / 3) + embeddedImageMatches.length * 258;
  const fileTokens = (files || []).reduce((sum, f) => sum + Math.min(2000, Math.ceil((f.data?.length || 0) / 750)), 0);
  return textTokens + fileTokens;
}

export async function callAI(
  system: string,
  user: string,
  state: AppState,
  opts: { temperature?: number; maxTokens?: number; json?: boolean; files?: Array<{ mimeType: string; data: string }>; onFallback?: (msg: string) => void } = {}
): Promise<string> {
  if (estimateInputTokens(system + '\n' + user, opts.files) > 75000) {
    throw new Error('Input document is too large for a single AI request (>75K tokens). Please upload fewer pages or select specific topics/chapters.');
  }

  const provider = state.ai.provider;
  const key = (state.ai.keys[provider] || '').trim();
  const model = autoModel(provider, state);
  const timeoutMs = opts.files && opts.files.length > 0 ? 90000 : 45000;

  if (provider === 'gemini') {
    if (!key) throw new Error('Google Gemini API key is missing. Add your free key in Settings → AI.');

    const tryFetch = async (targetModel: string) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent`;
      const files = opts.files || [];
      const contents = [
        {
          role: 'user',
          parts: [
            ...files.map(x => ({ inlineData: { mimeType: x.mimeType, data: x.data } })),
            { text: user },
          ],
        },
      ];

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        return await fetch(url, {
          signal: controller.signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents,
            generationConfig: {
              temperature: opts.temperature ?? 0.6,
              maxOutputTokens: opts.maxTokens || (opts.json ? 32768 : 8192),
              ...(opts.json ? { responseMimeType: 'application/json' } : {}),
            },
          }),
        });
      } finally {
        clearTimeout(timer);
      }
    };

    const baseChain = [
      model,
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
      'gemma-4-31b-it',
    ];
    const hasJsonOrFiles = Boolean(opts.json || (opts.files && opts.files.length > 0));
    const filteredChain = hasJsonOrFiles ? baseChain.filter(m => !m.includes('gemma')) : baseChain;
    let chain = Array.from(new Set(filteredChain.filter(Boolean)));
    if (opts.files && opts.files.length > 0) {
      chain = chain.slice(0, 2);
    }

    let res: Response | null = null;
    for (let i = 0; i < chain.length; i++) {
      const currentModel = chain[i];
      try {
        res = await tryFetch(currentModel);
      } catch (fetchErr: any) {
        if (i < chain.length - 1) {
          const nextModel = chain[i + 1];
          opts.onFallback?.(`Switching from ${currentModel} to ${nextModel} (timed out or network error)...`);
          continue;
        }
        throw fetchErr;
      }
      if (res.ok) {
        break;
      }
      if ((res.status === 429 || res.status === 503 || res.status === 502 || res.status === 404 || res.status === 400) && i < chain.length - 1) {
        const nextModel = chain[i + 1];
        opts.onFallback?.(`Switching from ${currentModel} to ${nextModel} (rate limit or high demand)...`);
        continue;
      }
      break;
    }

    if (!res || !res.ok) {
      const err = (await res?.json().catch(() => ({}))) || {};
      if (res?.status === 429) {
        throw new Error(`Quota exceeded or model unavailable. Try switching to gemini-3.8-flash or gemini-3.5-flash. (${err.error?.message || res?.status})`);
      }
      throw new Error(err.error?.message || `Gemini API error: ${res?.status}`);
    }
    const data = await res.json();
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p: any) => p.text || '').join('');
    if (!text) throw new Error('AI returned an empty response.');
    return text;
  }

  // Fallback to OpenAI-compatible chat endpoints for Groq / OpenRouter / Ollama
  const urls: Record<string, string> = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    ollama: 'http://localhost:11434/v1/chat/completions',
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (provider === 'openrouter') headers['X-Title'] = 'Tuitrix';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(urls[provider], {
      signal: controller.signal,
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: opts.temperature ?? 0.6,
        max_tokens: opts.maxTokens || 4096,
        response_format: opts.json ? { type: 'json_object' } : undefined,
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `${provider} error: ${res.status}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('AI returned an empty response.');
  return text;
}

export function cleanDoc(text: string): string {
  const t = String(text || '').trim();
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return m ? m[1].trim() : t;
}

export function splitAnswerKey(md: string) {
  const text = String(md || '');
  const m =
    text.match(/\n\s*-{3,}\s*\n(?=\s*#{1,4}\s*(answer|answers|উত্তর))/i) ||
    text.match(
      /\n(?=[ \t]*(?:#{1,4}[ \t]*)?(?:\*\*)?[ \t]*(?:answer[ \t]*key|answers|answer[ \t]*sheet|solutions|উত্তরমালা|উত্তর)[ \t]*:?[ \t]*(?:\*\*)?[ \t]*:?[ \t]*(?:\n|$))/i
    );
  if (!m) return { paper: text, answers: '' };
  const idx = m.index ?? 0;
  return { paper: text.slice(0, idx), answers: text.slice(idx + m[0].length) };
}

export function renderMarkdown(md: string): string {
  const lines = esc(md || '').replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];

  const inline = (s: string) =>
    s
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="exam-fig" style="max-width:100%;margin:8px 0;" />')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      flushPara();
      closeList();
      continue;
    }
    if (/^```/.test(t)) {
      flushPara();
      closeList();
      const code: string[] = [];
      while (++i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i]);
      out.push(`<pre>${code.join('\n')}</pre>`);
      continue;
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara();
      closeList();
      out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushPara();
      closeList();
      out.push('<hr>');
      continue;
    }
    if (t.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      flushPara();
      closeList();
      const cells = (r: string) => r.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
      const head = cells(t);
      i++;
      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
        rows.push(cells(lines[++i]));
      }
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head
          .map(c => `<th>${c}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      );
      continue;
    }
    const ul = t.match(/^[-*+]\s+(.*)$/);
    const ol = t.match(/^(\d+)[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const type = ul ? 'ul' : 'ol';
      if (list !== type) {
        closeList();
        out.push(type === 'ol' ? `<ol start="${ol![1]}">` : '<ul>');
        list = type;
      }
      out.push(`<li>${inline(ul ? ul[1] : ol![2])}</li>`);
      continue;
    }
    if (/^&gt;\s?/.test(t)) {
      flushPara();
      closeList();
      out.push(`<blockquote>${inline(t.replace(/^&gt;\s?/, ''))}</blockquote>`);
      continue;
    }
    closeList();
    para.push(t);
  }
  flushPara();
  closeList();
  return out.join('\n');
}

export const AI_SYSTEM = `You are an experienced private tutor, teacher-trainer and board-exam paper setter. You write practical, classroom-ready material for one-to-one or small-group home tuition, mostly for students in Bangladesh (NCTB curriculum, SSC/HSC boards, English version and English medium).
Write in clean Markdown (headings, numbered lists, bold, and pipe tables where useful). No preamble or closing chit-chat: output only the document.
Match the student's class level and the named curriculum/board. Accuracy matters more than length: solve every question yourself before writing its answer, and if you are not sure an answer is correct, replace the question with one you are sure about. Never invent textbook-specific details unless source material is provided.
When writing in Bangla, use correct, natural standard Bangla (প্রমিত বাংলা) in Bangla script throughout, with the subject's usual Bangla textbook terms; keep formulas, units and symbols in standard notation.`;

export function lessonPlanPrompt(f: any): string {
  return `Create a comprehensive lesson plan for one tuition session.

- Grade/Class: ${f.grade || 'not specified'}
- Subject: ${f.subject}
- Topic: ${f.topic}
- Session length: ${f.duration || 60} minutes
- Curriculum/Board: ${f.curriculum || 'not specified'}
- Student level: ${f.level || 'average'}
- Language: ${f.language || 'English'}
${f.recent ? `- Recently covered with this student: ${f.recent}\n` : ''}${f.notes ? `- Tutor's notes: ${f.notes}\n` : ''}

Include these practical sections:
1. **Learning objectives** (3–5, measurable)
2. **Prior knowledge check** (2–3 quick questions, with expected answers)
3. **Timeline** – a table with columns: Time (min) | Activity | What the tutor does | What the student does. Times must add up to ${f.duration || 60} minutes.
4. **Key explanations & worked examples** – the actual step-by-step explanation, key definitions/formulas, and 2–4 fully worked examples from easy to exam level.
5. **Practice questions** (5–8, increasing difficulty, answers at the end of this section)
6. **Common mistakes and misconceptions** – and how to correct each one
7. **If the student struggles / finishes early** – one easier step and one challenge
8. **How this topic comes in exams** – board-style creative question and 3 MCQs with answers
9. **Homework** (short and specific)
10. **Quick check for next session** (3 recap questions)`;
}

export function examMarks(f: any): number {
  const fmt = f.format || 'custom';
  if (fmt === 'custom') return Number(f.marks) || 50;
  return (fmt !== 'mcq' ? (Number(f.cqAnswer) || 0) * 10 : 0) + (fmt !== 'cq' ? Number(f.mcqCount) || 0 : 0);
}

export function examPrompt(f: any): string {
  const fmt = f.format || 'custom';
  const marks = examMarks(f);

  let types: string;
  if (fmt === 'board') {
    types = `${f.mcqCount || 25} Multiple Choice Questions (1 mark each) and ${f.cqCount || 8} Creative Questions (সৃজনশীল / CQ with stimulus and a, b, c, d parts totaling 10 marks each, student answers any ${f.cqAnswer || 5})`;
  } else if (fmt === 'cq') {
    types = `${f.cqCount || 8} Creative Questions (student answers any ${f.cqAnswer || 5}, 10 marks each)`;
  } else if (fmt === 'mcq') {
    types = `${f.mcqCount || 25} Multiple Choice Questions (1 mark each)`;
  } else {
    types = (f.types && f.types.length ? f.types : ['Multiple choice', 'Short answer']).join(', ');
  }

  return `Create an exam paper.

- Grade/Class: ${f.grade || 'not specified'}
- Subject: ${f.subject}
- Topics covered: ${f.topics || 'Standard syllabus'}
- Curriculum/Board: ${f.curriculum || 'not specified'}
- Total marks: ${marks}
- Time allowed: ${f.duration || 60} minutes
- Difficulty: ${f.difficulty || 'mixed (easy → hard)'}
- Question types: ${types}
- Language: ${f.language || 'English'}
${f.notes ? `- Tutor's notes: ${f.notes}\n` : ''}

Rules:
- Start with a clear header: exam title, subject, class, time, total marks, and lines for student name and date.
- Group questions into sections by type with marks per question e.g. **[2]**.
- Total marks of all questions must sum to exactly ${marks}.
${f.answerKey ? '- After the paper, add a line containing only "---" and then a section titled "## Answer Key" with correct answers and step-by-step marking guidelines.' : '- Do not include answers.'}`;
}

export function worksheetPrompt(f: any): string {
  return `Create a practice worksheet.

- Grade/Class: ${f.grade || 'not specified'}
- Subject: ${f.subject}
- Topic: ${f.topic}
- Number of questions: ${f.count || 15}
- Difficulty: ${f.difficulty || 'mixed (easy → hard)'}
- Language: ${f.language || 'English'}
${f.notes ? `- Tutor's notes: ${f.notes}\n` : ''}
Start with a short "Remember" box of key formulas and rules, then numbered questions grouped from easy to hard. After a line containing only "---", add "## Answers" with solutions.`;
}

export const CHECK_SYSTEM = `You are a strict, experienced exam moderator and board examiner. You check papers that someone else wrote. You report only real problems, and you never rewrite the paper.`;

export function checkPrompt(tool: string, f: any, content: string): string {
  return `Check this ${tool === 'exam' ? 'exam paper' : 'worksheet'} before it is given to a student.
Reply in English. The first line must be exactly "VERDICT: OK" or "VERDICT: PROBLEMS".
If there are problems, provide a numbered list of issues with questions or answers.

<<<PAPER
${content}
PAPER>>>`;
}

export function parseCheck(text: string) {
  const m = String(text || '').match(/VERDICT:\s*(OK|PROBLEMS)/i);
  const report = String(text || '').replace(/^[\s\S]*?VERDICT:\s*(OK|PROBLEMS)\s*/i, '').trim();
  return { ok: !!m && m[1].toUpperCase() === 'OK' && !/\*\*Q\d/.test(report), report: m ? report : String(text || '').trim() };
}

export function revisePrompt(tool: string, f: any, content: string, instruction: string): string {
  return `Below is a ${tool === 'plan' ? 'lesson plan' : tool === 'exam' ? 'exam paper' : 'worksheet'} you wrote. Revise it according to this instruction:
${instruction}

Keep every other question, numbering and answer key in sync. Output only the complete revised document.

<<<DOCUMENT
${content}
DOCUMENT>>>`;
}

export const MONEY_SYSTEM = `You are a practical, friendly personal-finance coach for a self-employed private tutor whose income is tuition fees, which vary month to month.
Use only the figures provided and never invent numbers. Give concrete amounts and timelines in the user's currency.
Reply in clean Markdown with short headings and bullet points, under about 300 words unless asked for more. Reply in the language of the question (Bangla or English).`;

export function moneyPromptData(snap: MoneySnapshotResult, state: AppState): string {
  const L: string[] = [];
  L.push(`Currency: ${state.settings.currency || ''}`, `Today: ${snap.today}`, '', 'Money received from tuition and money spent, by month:');
  for (const x of snap.history) L.push(`- ${x.k}: income ${state.settings.currency}${x.inc}, expenses ${state.settings.currency}${x.exp}`);
  L.push(`- ${snap.current.k} (this month so far): income ${state.settings.currency}${snap.current.inc}, expenses ${state.settings.currency}${snap.current.exp}`);
  L.push(
    '',
    `Typical month: income ${state.settings.currency}${Math.round(snap.avgIncome)}, expenses ${state.settings.currency}${Math.round(snap.avgExpense)}, left over ${state.settings.currency}${Math.round(snap.avgNet)}`
  );
  const cats = Object.entries(snap.expenseByCategory).sort((a, b) => b[1] - a[1]);
  if (cats.length) {
    L.push('Typical monthly expenses by category:');
    for (const [k, v] of cats) L.push(`- ${k}: ${state.settings.currency}${Math.round(v)}`);
  }
  L.push('', `Unpaid fees students currently owe me: ${state.settings.currency}${snap.outstanding}`);
  L.push(`Expected tuition fees per month from running contracts: ${state.settings.currency}${Math.round(snap.expected.total)}`);
  L.push(`Active students: ${snap.activeStudents}`);
  if (state.goals.length) {
    L.push('', 'Savings goals:');
    for (const [i, g] of state.goals.entries()) {
      const p = goalPlan(g, snap.avgNet, snap.today);
      L.push(`- Goal ${i + 1} (${g.name}): costs ${state.settings.currency}${g.target}, saved ${state.settings.currency}${g.saved}${g.targetDate ? `, target date ${g.targetDate}` : ''}${p.perMonth ? `, needs ${state.settings.currency}${Math.ceil(p.perMonth)}/month` : ''}`);
    }
  }
  return L.join('\n');
}

export function moneyPrompt(question: string, snap: MoneySnapshotResult, state?: AppState): string {
  return `My tuition money so far:\n\n${state ? moneyPromptData(snap, state) : ''}\n\nMy question: ${question}`;
}

export const isDummyExam = (ex: any): boolean => {
  if (!ex || !Array.isArray(ex.questions) || ex.questions.length === 0) return true;
  if (ex.questions.length === 1 && /sample mcq|question text/i.test(ex.questions[0]?.text || '')) return true;
  if (ex.questions[0]?.text === 'Question 1' && ex.questions[0]?.options?.[0] === 'Option A') return true;
  return false;
};

export function renderDiagramSpecToSvgDataUri(spec: string): string | undefined {
  if (!spec || typeof spec !== 'string') return undefined;
  const s = spec.trim();

  // 1. Logic Gate: gate:TYPE(IN->OUT)
  // e.g. gate:AND(A,B->Y), gate:NOR(A,B->Y), gate:NOT(A->Y)
  const gateMatch = s.match(/^gate:\s*([a-z]+)\s*\(\s*([^->]*?)\s*(?:->\s*([^)]*?))?\s*\)$/i);
  if (gateMatch) {
    const type = gateMatch[1].toUpperCase();
    const inStr = gateMatch[2] || '';
    const outStr = gateMatch[3] || 'Y';
    const inputs = inStr.split(',').map(x => x.trim()).filter(Boolean);
    const outputs = outStr.split(',').map(x => x.trim()).filter(Boolean);
    if (outputs.length === 0) outputs.push('Y');

    const w = 260;
    const h = 110;
    let gateBody = '';
    let bubble = '';
    let xorCurve = '';
    let outputX = 160;

    switch (type) {
      case 'NOT':
        gateBody = '<polygon points="100,30 150,55 100,80" stroke="#38bdf8" stroke-width="2.5" fill="none" stroke-linejoin="round" />';
        bubble = '<circle cx="156" cy="55" r="5" stroke="#38bdf8" stroke-width="2" fill="none" />';
        outputX = 162;
        break;

      case 'AND':
        gateBody = '<path d="M 100 30 L 130 30 A 25 25 0 0 1 130 80 L 100 80 Z" stroke="#38bdf8" stroke-width="2.5" fill="none" stroke-linejoin="round" />';
        outputX = 155;
        break;

      case 'NAND':
        gateBody = '<path d="M 100 30 L 130 30 A 25 25 0 0 1 130 80 L 100 80 Z" stroke="#38bdf8" stroke-width="2.5" fill="none" stroke-linejoin="round" />';
        bubble = '<circle cx="161" cy="55" r="5" stroke="#38bdf8" stroke-width="2" fill="none" />';
        outputX = 167;
        break;

      case 'OR':
        gateBody = '<path d="M 95 30 Q 115 55 95 80 Q 135 78 158 55 Q 135 32 95 30 Z" stroke="#38bdf8" stroke-width="2.5" fill="none" stroke-linejoin="round" />';
        outputX = 158;
        break;

      case 'NOR':
        gateBody = '<path d="M 95 30 Q 115 55 95 80 Q 135 78 158 55 Q 135 32 95 30 Z" stroke="#38bdf8" stroke-width="2.5" fill="none" stroke-linejoin="round" />';
        bubble = '<circle cx="164" cy="55" r="5" stroke="#38bdf8" stroke-width="2" fill="none" />';
        outputX = 170;
        break;

      case 'XOR':
        xorCurve = '<path d="M 90 30 Q 110 55 90 80" stroke="#38bdf8" stroke-width="2.5" fill="none" />';
        gateBody = '<path d="M 98 30 Q 118 55 98 80 Q 138 78 163 55 Q 138 32 98 30 Z" stroke="#38bdf8" stroke-width="2.5" fill="none" stroke-linejoin="round" />';
        outputX = 163;
        break;

      case 'XNOR':
        xorCurve = '<path d="M 90 30 Q 110 55 90 80" stroke="#38bdf8" stroke-width="2.5" fill="none" />';
        gateBody = '<path d="M 98 30 Q 118 55 98 80 Q 138 78 163 55 Q 138 32 98 30 Z" stroke="#38bdf8" stroke-width="2.5" fill="none" stroke-linejoin="round" />';
        bubble = '<circle cx="169" cy="55" r="5" stroke="#38bdf8" stroke-width="2" fill="none" />';
        outputX = 175;
        break;

      default:
        return undefined;
    }

    let inElements = '';
    const inCount = Math.max(1, inputs.length);
    const startX = 35;
    const gateInX = (type === 'OR' || type === 'NOR') ? 104 : (type === 'XOR' || type === 'XNOR') ? 92 : 100;

    for (let i = 0; i < inCount; i++) {
      const y = inCount === 1 ? 55 : 40 + (i * 30) / (inCount - 1);
      const label = inputs[i] || (inCount === 1 ? 'A' : String.fromCharCode(65 + i));
      inElements += `<line x1="${startX}" y1="${y}" x2="${gateInX}" y2="${y}" stroke="#38bdf8" stroke-width="2" />`;
      inElements += `<text x="${startX - 6}" y="${y + 4}" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="end">${label}</text>`;
    }

    let outElements = '';
    const endX = 225;
    for (let i = 0; i < outputs.length; i++) {
      const y = outputs.length === 1 ? 55 : 42 + (i * 26) / (outputs.length - 1);
      const label = outputs[i];
      outElements += `<line x1="${outputX}" y1="${y}" x2="${endX}" y2="${y}" stroke="#38bdf8" stroke-width="2" />`;
      outElements += `<text x="${endX + 6}" y="${y + 4}" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="start">${label}</text>`;
    }

    const svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${xorCurve}${gateBody}${bubble}${inElements}${outElements}</svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // 2. IC Block: block:TITLE(IN->OUT) or block:(IN->OUT)
  const blockMatch = s.match(/^block:\s*(?:[^(]*?)\s*\(\s*([^->]*?)\s*(?:->\s*([^)]*?))?\s*\)$/i);
  if (blockMatch) {
    const inStr = blockMatch[1] || '';
    const outStr = blockMatch[2] || '';
    const inputs = inStr.split(',').map(x => x.trim()).filter(Boolean);
    const outputs = outStr.split(',').map(x => x.trim()).filter(Boolean);

    const w = 260;
    const h = 120;
    const boxX = 75;
    const boxY = 16;
    const boxW = 110;
    const boxH = 88;

    let inElements = '';
    const inCount = Math.max(1, inputs.length);
    for (let i = 0; i < inCount; i++) {
      const y = inCount === 1 ? 60 : 32 + (i * 56) / (inCount - 1);
      const label = inputs[i] || `In${i + 1}`;
      inElements += `<line x1="28" y1="${y}" x2="${boxX}" y2="${y}" stroke="#38bdf8" stroke-width="2" />`;
      inElements += `<text x="22" y="${y + 4}" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="end">${label}</text>`;
    }

    let outElements = '';
    const outCount = Math.max(1, outputs.length);
    for (let i = 0; i < outCount; i++) {
      const y = outCount === 1 ? 60 : 32 + (i * 56) / (outCount - 1);
      const label = outputs[i] || `Out${i + 1}`;
      outElements += `<line x1="${boxX + boxW}" y1="${y}" x2="232" y2="${y}" stroke="#38bdf8" stroke-width="2" />`;
      outElements += `<text x="238" y="${y + 4}" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="start">${label}</text>`;
    }

    const notch = `<path d="M ${boxX + boxW / 2 - 8} ${boxY} A 8 8 0 0 0 ${boxX + boxW / 2 + 8} ${boxY}" stroke="#38bdf8" stroke-width="2" fill="none" />`;
    const box = `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="6" stroke="#38bdf8" stroke-width="2.5" fill="#090d16" />`;
    const qMark = `<text x="${boxX + boxW / 2}" y="${boxY + boxH / 2 + 8}" fill="#38bdf8" opacity="0.6" font-family="system-ui, sans-serif" font-size="24" font-weight="bold" text-anchor="middle">?</text>`;

    const svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${box}${notch}${qMark}${inElements}${outElements}</svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // 3. 7-Segment Display: seg7:DIGIT (e.g. seg7:3)
  const seg7Match = s.match(/^seg7:\s*([0-9a-f])/i);
  if (seg7Match) {
    const d = seg7Match[1].toUpperCase();
    const map: Record<string, string[]> = {
      '0': ['a', 'b', 'c', 'd', 'e', 'f'],
      '1': ['b', 'c'],
      '2': ['a', 'b', 'g', 'e', 'd'],
      '3': ['a', 'b', 'g', 'c', 'd'],
      '4': ['f', 'g', 'b', 'c'],
      '5': ['a', 'f', 'g', 'c', 'd'],
      '6': ['a', 'f', 'g', 'e', 'c', 'd'],
      '7': ['a', 'b', 'c'],
      '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      '9': ['a', 'b', 'c', 'd', 'f', 'g'],
      'A': ['a', 'b', 'c', 'e', 'f', 'g'],
      'B': ['c', 'd', 'e', 'f', 'g'],
      'C': ['a', 'd', 'e', 'f'],
      'D': ['b', 'c', 'd', 'e', 'g'],
      'E': ['a', 'd', 'e', 'f', 'g'],
      'F': ['a', 'e', 'f', 'g'],
    };
    const active = new Set(map[d] || []);
    const onColor = '#38bdf8';
    const offColor = '#1e293b';
    const offOpacity = '0.25';

    const seg = (id: string, path: string) => {
      const isOn = active.has(id);
      return `<path d="${path}" fill="${isOn ? onColor : offColor}" opacity="${isOn ? '1' : offOpacity}" />`;
    };

    const paths = {
      a: 'M 32 18 L 88 18 L 80 26 L 40 26 Z',
      b: 'M 90 20 L 90 74 L 82 68 L 82 28 Z',
      c: 'M 90 86 L 90 140 L 82 132 L 82 92 Z',
      d: 'M 32 142 L 88 142 L 80 134 L 40 134 Z',
      e: 'M 30 86 L 30 140 L 38 132 L 38 92 Z',
      f: 'M 30 20 L 30 74 L 38 68 L 38 28 Z',
      g: 'M 34 79 L 40 75 L 80 75 L 86 79 L 80 83 L 40 83 Z',
    };

    const bg = '<rect x="14" y="8" width="92" height="144" rx="8" fill="#090d16" stroke="#334155" stroke-width="1.5" />';
    const segElements = Object.entries(paths).map(([id, p]) => seg(id, p)).join('');
    const svg = `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg">${bg}${segElements}</svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // 4. Boxes: boxes:VAL1|VAL2... or boxes:1011(8,4,2,1)
  const boxesMatch = s.match(/^boxes:\s*([^(|]+)(?:\(([^)]+)\)|(.*))?$/i);
  if (boxesMatch) {
    const rawVal = boxesMatch[1] || '';
    const weightsStr = boxesMatch[2] || '';
    const pipeRest = boxesMatch[3] || '';

    let values: string[] = [];
    let weights: string[] = [];

    if (pipeRest) {
      values = [rawVal, ...pipeRest.split('|').filter(Boolean)].map(x => x.replace(/^\|/, '').trim());
    } else if (weightsStr) {
      values = rawVal.includes('|') ? rawVal.split('|').map(x => x.trim()) : rawVal.split('');
      weights = weightsStr.split(',').map(x => x.trim());
    } else {
      values = rawVal.includes('|') ? rawVal.split('|').map(x => x.trim()) : [rawVal];
    }

    if (values.length === 0) return undefined;

    const boxSize = 42;
    const gap = 10;
    const padding = 20;
    const w = padding * 2 + values.length * boxSize + (values.length - 1) * gap;
    const h = weights.length > 0 ? 90 : 70;
    const startY = weights.length > 0 ? 34 : 14;

    let elements = '';
    for (let i = 0; i < values.length; i++) {
      const x = padding + i * (boxSize + gap);
      if (weights[i]) {
        elements += `<text x="${x + boxSize / 2}" y="22" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">${weights[i]}</text>`;
      }
      elements += `<rect x="${x}" y="${startY}" width="${boxSize}" height="${boxSize}" rx="5" stroke="#38bdf8" stroke-width="2" fill="#090d16" />`;
      elements += `<text x="${x + boxSize / 2}" y="${startY + boxSize / 2 + 6}" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="18" font-weight="bold" text-anchor="middle">${values[i]}</text>`;
    }

    const svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${elements}</svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  return undefined;
}

export function stripAnswerLeak(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/(?:\s+|\n)*(?:\*{1,2})?(?:\(?\s*(?:Answer|Ans)\s*[:.-]?\s*(?:\([a-dA-D]\)|[a-dA-D])\.?\s*\)?)(?:\*{1,2})?\s*$/i, '')
    .trim();
}

export function inferDiagramFromQuestion(q: {
  text: string;
  options?: string[];
  answer?: number;
  stimulus?: string;
  figure?: string;
}): { stimulus?: string; figure?: string } {
  let figure = q.figure;
  let stimulus = q.stimulus;

  const rawAnswerIdx = typeof q.answer === 'number' ? q.answer : 0;
  const rawOpt = (q.options && q.options[rawAnswerIdx]) ? String(q.options[rawAnswerIdx]) : '';
  const optClean = rawOpt.replace(/^[a-d][.)-]\s*/i, '').replace(/\s+gate$/i, '').trim();

  // 1. Logic gate shown: /logic gate shown/i
  if (/(?:logic\s+)?gate\s*(?:is\s*)?shown/i.test(q.text) && !figure) {
    const gateUpper = optClean.toUpperCase();
    if (/^(AND|OR|NOT|NAND|NOR|XOR|XNOR)$/.test(gateUpper)) {
      const spec = gateUpper === 'NOT' ? 'gate:NOT(A->Y)' : `gate:${gateUpper}(A,B->Y)`;
      figure = renderDiagramSpecToSvgDataUri(spec);
    }
  }

  // 2. Truth table shown: /truth table shown/i
  if (/(?:truth\s+)?table\s*(?:is\s*)?shown/i.test(q.text) && (!stimulus || !stimulus.trim())) {
    const gateUpper = optClean.toUpperCase();
    const tables: Record<string, string> = {
      AND: `| A | B | Y |\n|---|---|---|\n| 0 | 0 | 0 |\n| 0 | 1 | 0 |\n| 1 | 0 | 0 |\n| 1 | 1 | 1 |`,
      OR: `| A | B | Y |\n|---|---|---|\n| 0 | 0 | 0 |\n| 0 | 1 | 1 |\n| 1 | 0 | 1 |\n| 1 | 1 | 1 |`,
      NAND: `| A | B | Y |\n|---|---|---|\n| 0 | 0 | 1 |\n| 0 | 1 | 1 |\n| 1 | 0 | 1 |\n| 1 | 1 | 0 |`,
      NOR: `| A | B | Y |\n|---|---|---|\n| 0 | 0 | 1 |\n| 0 | 1 | 0 |\n| 1 | 0 | 0 |\n| 1 | 1 | 0 |`,
      XOR: `| A | B | Y |\n|---|---|---|\n| 0 | 0 | 0 |\n| 0 | 1 | 1 |\n| 1 | 0 | 1 |\n| 1 | 1 | 0 |`,
      XNOR: `| A | B | Y |\n|---|---|---|\n| 0 | 0 | 1 |\n| 0 | 1 | 0 |\n| 1 | 0 | 0 |\n| 1 | 1 | 1 |`,
    };
    if (tables[gateUpper]) {
      stimulus = tables[gateUpper];
    }
  }

  // 3. 7-segment display: /digit is shown on the display/i
  if (/digit\s*(?:is\s*)?shown\s*on\s*the\s*display/i.test(q.text) && !figure) {
    const digitMatch = optClean.match(/\b([0-9a-f])\b/i);
    if (digitMatch) {
      figure = renderDiagramSpecToSvgDataUri(`seg7:${digitMatch[1]}`);
    }
  }

  // 4. Digital device / flip-flop: /digital device shown|flip-flop shown/i
  if (/(?:digital\s+)?device\s*(?:is\s*)?shown|flip-flop\s*(?:is\s*)?shown/i.test(q.text) && !figure) {
    const dev = optClean.toLowerCase();
    if (dev.includes('half adder')) {
      figure = renderDiagramSpecToSvgDataUri('block:(A,B->Sum,Carry)');
    } else if (dev.includes('full adder')) {
      figure = renderDiagramSpecToSvgDataUri('block:(A,B,Cin->Sum,Cout)');
    } else if (dev.includes('encoder')) {
      figure = renderDiagramSpecToSvgDataUri('block:(I0,I1,I2,I3->Y0,Y1)');
    } else if (dev.includes('decoder')) {
      figure = renderDiagramSpecToSvgDataUri('block:(A,B->D0,D1,D2,D3)');
    } else if (dev.includes('multiplexer') || dev.includes('mux')) {
      figure = renderDiagramSpecToSvgDataUri('block:(I0,I1,I2,I3,S0,S1->Y)');
    } else if (dev.includes('demultiplexer') || dev.includes('demux')) {
      figure = renderDiagramSpecToSvgDataUri('block:(D,S0,S1->Y0,Y1,Y2,Y3)');
    } else if (dev.includes('sr flip-flop') || dev.includes('sr-ff')) {
      figure = renderDiagramSpecToSvgDataUri("block:(S,CLK,R->Q,Q')");
    } else if (dev.includes('d flip-flop') || dev.includes('d-ff')) {
      figure = renderDiagramSpecToSvgDataUri("block:(D,CLK->Q,Q')");
    } else if (dev.includes('jk flip-flop') || dev.includes('jk-ff')) {
      figure = renderDiagramSpecToSvgDataUri("block:(J,CLK,K->Q,Q')");
    } else if (dev.includes('t flip-flop') || dev.includes('t-ff')) {
      figure = renderDiagramSpecToSvgDataUri("block:(T,CLK->Q,Q')");
    }
  }

  return { stimulus, figure };
}

export function normalizeExam(raw: any): Exam {
  const x = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const normalizeFigure = (fig: any): string | undefined => {
    if (!fig) return undefined;
    const str = String(fig).trim();
    if (!str) return undefined;
    const diagramUri = renderDiagramSpecToSvgDataUri(str);
    if (diagramUri) return diagramUri;
    if (/^<svg/i.test(str)) {
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(str);
    }
    return str;
  };
  const questions: Question[] = (Array.isArray(x.questions) ? x.questions : [])
    .filter((q: any) => q && typeof q === 'object')
    .map((q: any, i: number) => {
      let id = String(q.id || `q${i + 1}`);
      if (seen.has(id)) id = `${id}_${i}`;
      seen.add(id);
      const n = String(q.n || i + 1);
      if (q.type === 'mcq') {
        const opts = (Array.isArray(q.options) ? q.options : [])
          .map((o: any) => stripAnswerLeak(String(o || '')).trim())
          .filter(Boolean);

        const textRaw = String(q.text || '');
        let ans = typeof q.answer === 'number' ? q.answer : 0;
        if (typeof q.answer === 'string') {
          const lMatch = q.answer.match(/(?:Answer|Ans\s*[:.-]?)?\s*(?:\(([a-d])\)|([a-d]))/i);
          if (lMatch) {
            ans = (lMatch[1] || lMatch[2]).toUpperCase().charCodeAt(0) - 65;
          } else if (/^\d+$/.test(q.answer.trim())) {
            ans = parseInt(q.answer.trim(), 10);
          }
        }
        const textAnsMatch = textRaw.match(/(?:\(?\s*(?:Answer|Ans)\s*[:.-]?\s*(?:\(([a-d])\)|([a-d]))\.?\s*\)?)(?:\*{1,2})?\s*$/i);
        if (textAnsMatch && (q.answer === undefined || q.answer === 0)) {
          const letter = (textAnsMatch[1] || textAnsMatch[2]).toUpperCase();
          ans = letter.charCodeAt(0) - 65;
        }

        let text = stripAnswerLeak(textRaw);
        let stimulus = q.stimulus ? stripAnswerLeak(String(q.stimulus)) : '';
        let figure = normalizeFigure(q.figure);

        const inferred = inferDiagramFromQuestion({
          text,
          options: opts,
          answer: ans,
          stimulus,
          figure,
        });
        if (inferred.stimulus) stimulus = inferred.stimulus;
        if (inferred.figure) figure = inferred.figure;

        return {
          id,
          n,
          type: 'mcq' as const,
          stimulus: stimulus || '',
          text,
          figure,
          options: opts.length ? opts : ['Option 1', 'Option 2'],
          optionFigures: Array.isArray(q.optionFigures) ? q.optionFigures : undefined,
          answer: ans,
          guessed: !!q.guessed,
          marks: Number(q.marks) || 1,
        };
      }
      if (q.type === 'cq') {
        const parts = (Array.isArray(q.parts) ? q.parts : [])
          .map((p: any) => ({
            label: String(p.label || ''),
            text: stripAnswerLeak(String(p.text || '')),
            marks: Number(p.marks) || 1,
            answer: p.answer ? String(p.answer) : undefined,
          }))
          .filter((p: any) => p.text);
        return {
          id,
          n,
          type: 'cq' as const,
          stimulus: q.stimulus ? stripAnswerLeak(String(q.stimulus)) : '',
          figure: normalizeFigure(q.figure),
          parts: parts.length ? parts : [{ label: 'a', text: 'Answer the question', marks: 5 }],
        };
      }
      return {
        id,
        n,
        type: 'written' as const,
        stimulus: q.stimulus ? stripAnswerLeak(String(q.stimulus)) : undefined,
        text: stripAnswerLeak(String(q.text || '')),
        figure: normalizeFigure(q.figure),
        marks: Number(q.marks) || 1,
        answer: q.answer ? String(q.answer) : undefined,
      };
    });

  return {
    id: x.id || '',
    title: String(x.title || 'Exam'),
    duration: Math.max(1, Number(x.duration) || 60),
    instructions: x.instructions ? String(x.instructions) : '',
    cqChoose: Math.max(0, Number(x.cqChoose) || 0),
    questions,
  };
}

export const EXAM_JSON_SYSTEM = `You convert exam papers into JSON for an on-screen exam app. Output only valid JSON with fields "title", "duration", "instructions", "cqChoose", and "questions".`;

export function examJsonPrompt(content: string): string {
  return `Convert this exam paper into JSON format with this exact structure:
{
  "title": "Exam Title",
  "duration": 60,
  "instructions": "General instructions",
  "cqChoose": 0,
  "questions": [
    { "type": "mcq", "n": "1", "stimulus": "", "figure": "", "text": "Question text", "options": ["Option A", "Option B", "Option C", "Option D"], "answer": 0, "marks": 1 },
    { "type": "cq", "n": "2", "stimulus": "Stimulus text", "figure": "", "parts": [ { "label": "a", "text": "Part text", "marks": 2, "answer": "Model answer" } ] },
    { "type": "written", "n": "3", "stimulus": "", "figure": "", "text": "Short answer question", "marks": 3, "answer": "Model answer" }
  ]
}

CRITICAL: Extract ALL questions present in the document. Do not output placeholder questions. If no questions are found, return {"questions": []}.
NEVER include 'Answer: X' inside question text, stimulus, or options. Parse 'Answer: A/B/C/D' into the numeric "answer" index (0, 1, 2, or 3).
Keep output compact so all 50 questions fit fast: for logic gates use "figure": "gate:AND(A,B->Y)" (or OR/NOT/NAND/NOR/XOR/XNOR); for truth tables put a compact Markdown table in "stimulus"; for 7-segment displays use "figure": "seg7:3"; for device/flip-flop blocks use "figure": "block:(A,B,Cin->Sum,Cout)"; for binary/hex/octal boxes use "figure": "boxes:1011(8,4,2,1)" or "boxes:3|C".
NEVER output raw <svg> XML tags inside JSON (they waste tokens and break JSON escaping). Instead, for visual/picture questions:
- For tables (truth tables, place-value tables), put a Markdown pipe table in "stimulus".
- For logic gates, set "figure" to "gate:AND(A,B->Y)", "gate:OR(A,B->Y)", "gate:NOT(A->Y)", "gate:NAND(A,B->Y)", "gate:NOR(A,B->Y)", "gate:XOR(A,B->Y)", or "gate:XNOR(A,B->Y)" (matching the picture's gate shape and input/output labels).
- For digital device/flip-flop blocks, set "figure" to "block:(Pin1,Pin2->Out1,Out2)" listing only the visible pin labels.
- For 7-segment displays, set "figure" to "seg7:3" (with the lit digit). For number boxes, set "figure" to "boxes:3|C" or put the expression/circuit in "stimulus".

<<<PAPER
${content}
PAPER>>>`;
}

export const MARK_SYSTEM = `You are a fair, experienced board examiner marking student written and creative question answers. Output valid JSON with an array "marks" containing { "id": question_id, "part": part_index, "marks": number, "reason": "brief reason" }.`;

export function markPrompt(items: any[]): string {
  return `Mark each student answer below out of its "max" marks. Half-marks (e.g. 1.5, 2.5) are permitted.
${JSON.stringify(items, null, 2)}`;
}
