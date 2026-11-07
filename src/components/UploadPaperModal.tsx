import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/context';
import { callAI, EXAM_JSON_SYSTEM, examJsonPrompt, normalizeExam, extractFileText, parseAiJson } from '../services/ai';
import { uid } from '../utils/date';
import { isProUser, canSaveAiResource, FREE_TIER_MAX_SAVED_RESOURCES } from '../utils/tierLimits';
import { savePaperBlob } from '../utils/paperStorage';
import { Question } from '../types';

export function parseAnswerKeys(input: string, count: number): Record<number, number> {
  const map: Record<number, number> = {};
  if (!input || !input.trim()) return map;

  const letterToIdx = (l: string): number => {
    const code = l.toUpperCase().charCodeAt(0);
    return code >= 65 && code <= 68 ? code - 65 : 0; // A=0, B=1, C=2, D=3
  };

  // 1. Try matching numbered lines: "1. B", "1: C", "1) A", "Q1: B", "1 - B", "Answer 1: B"
  const numberedRegex = /(?:(?:q(?:uestion)?|answer)\s*)?(\d+)\s*[:.)-]\s*([a-d])/gi;
  let match: RegExpExecArray | null;
  let foundNumbered = false;

  while ((match = numberedRegex.exec(input)) !== null) {
    foundNumbered = true;
    const qNum = parseInt(match[1], 10);
    if (qNum >= 1 && qNum <= count) {
      map[qNum - 1] = letterToIdx(match[2]);
    }
  }

  if (foundNumbered && Object.keys(map).length > 0) {
    return map;
  }

  // 2. Try space or comma separated letters: "B C A D B..." or "A, B, C, D"
  const tokens = input
    .replace(/[^a-dA-D\s,]/g, ' ')
    .split(/[\s,]+/)
    .filter(t => t.length === 1 && /^[a-dA-D]$/i.test(t));

  tokens.forEach((token, idx) => {
    if (idx < count) {
      map[idx] = letterToIdx(token);
    }
  });

  return map;
}

interface UploadPaperModalProps {
  isOpen: boolean;
  initialStudentId?: string;
  onClose: () => void;
  onExamReady?: (docId: string, examId: string) => void;
}

export const UploadPaperModal: React.FC<UploadPaperModalProps> = ({
  isOpen,
  initialStudentId,
  onClose,
  onExamReady,
}) => {
  const { state, saveDoc, saveAiResource, saveExam, toast, billingState, user } = useStore();
  const [studentId, setStudentId] = useState(initialStudentId || '');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'instant' | 'ai'>('instant');
  const [questionCount, setQuestionCount] = useState<number>(50);
  const [duration, setDuration] = useState<number>(50);
  const [answerKeyInput, setAnswerKeyInput] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStudentId(initialStudentId || '');
      setTitle('');
      setFile(null);
      setMode('instant');
      setQuestionCount(50);
      setDuration(50);
      setAnswerKeyInput('');
      setError('');
    }
  }, [isOpen, initialStudentId]);

  const isPro = isProUser(billingState, user?.email);
  const currentSavedCount = new Set([...(state.savedResources || []).map(r => r.id), ...(state.docs || []).map(d => d.id)]).size;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      if (!title) {
        setTitle(f.name.replace(/\.[^.]+$/, ''));
      }
      const isPdfOrImg = /\.(pdf|png|jpe?g|webp)$/i.test(f.name);
      setMode(isPdfOrImg ? 'instant' : 'ai');
    }
  };

  const toDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a question paper file.');
      return;
    }

    if (!canSaveAiResource(currentSavedCount, isPro)) {
      const limitMsg = `Free Tier limit reached (${FREE_TIER_MAX_SAVED_RESOURCES} saved resources). Upgrade to Pro for unlimited saves.`;
      setError(limitMsg);
      toast(limitMsg, 'error');
      return;
    }

    setLoading(true);
    setError('');

    const isImage = /\.(png|jpe?g|webp)$/i.test(file.name);
    const isPdf = /\.pdf$/i.test(file.name);
    const examTitle = title.trim() || file.name.replace(/\.[^.]+$/, '');
    const docId = uid();
    const examId = uid();
    const now = new Date().toISOString();

    if (mode === 'instant') {
      try {
        let fullDataUrl = '';
        if (isPdf || isImage) {
          fullDataUrl = await toDataUrl(file);
          await savePaperBlob(examId, fullDataUrl);
          await savePaperBlob(docId, fullDataUrl);
        }

        const answerMap = parseAnswerKeys(answerKeyInput, questionCount);
        const questions: Question[] = Array.from({ length: questionCount }, (_, idx) => {
          const hasKey = idx in answerMap;
          const ans = hasKey ? answerMap[idx] : 0;
          return {
            id: `q${idx + 1}`,
            n: String(idx + 1),
            type: 'mcq' as const,
            stimulus: '',
            text: `Question ${idx + 1}`,
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            answer: ans,
            guessed: !hasKey,
            marks: 1,
          };
        });

        const paperMd = `# ${examTitle}\n\nOriginal question paper attached. Answer questions 1 to ${questionCount} below.`;

        saveDoc({
          id: docId,
          type: 'exam',
          title: examTitle,
          content: paperMd,
          studentId: studentId || null,
          createdAt: now,
        });

        saveAiResource({
          id: docId,
          title: examTitle,
          type: 'exam',
          classLevel: '',
          subject: '',
          topic: '',
          content: paperMd,
          studentId: studentId || null,
          createdAt: now,
          isFavorite: false,
        });

        saveExam({
          id: examId,
          docId,
          title: examTitle,
          duration,
          instructions: 'Refer to original question paper and mark answers on the OMR sheet.',
          cqChoose: 0,
          questions,
          createdAt: now,
        });

        toast(`"${examTitle}" question bank ready!`, 'success');
        onClose();
        if (onExamReady) {
          onExamReady(docId, examId);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to create instant question bank.');
      } finally {
        setLoading(false);
      }
      return;
    }

    let fullDataUrl = '';
    try {
      let textContent = '';
      let filesData: Array<{ mimeType: string; data: string }> = [];

      if (isImage || isPdf) {
        fullDataUrl = await toDataUrl(file);
        const b64 = fullDataUrl.split(',')[1] || '';
        const mime = isPdf ? 'application/pdf' : file.type || 'image/jpeg';
        filesData = [{ mimeType: mime, data: b64 }];
      } else {
        textContent = await extractFileText(file);
      }

      const prompt = examJsonPrompt(textContent || file.name);
      const res = await callAI(EXAM_JSON_SYSTEM, prompt, state, {
        temperature: 0.1,
        json: true,
        files: filesData,
        onFallback: (msg) => toast(msg, 'info'),
      });

      const parsedJson = parseAiJson(res);
      const normalized = normalizeExam(parsedJson);

      const paperMd = textContent.trim() || normalized.questions.map((q, idx) => {
        const visual = `${'stimulus' in q && q.stimulus && q.type !== 'cq' ? q.stimulus + '\n' : ''}${q.figure ? `![Figure](${q.figure})\n` : ''}`;
        if (q.type === 'mcq') {
          return `${visual}${q.n || idx + 1}. ${q.text}\n${q.options.map((o, oi) => `   (${String.fromCharCode(97 + oi)}) ${o}`).join('\n')}`;
        }
        if (q.type === 'cq') {
          return `${visual}${q.n || idx + 1}. ${q.stimulus}\n${q.parts.map(p => `   (${p.label}) ${p.text} [${p.marks}]`).join('\n')}`;
        }
        return `${visual}${q.n || idx + 1}. ${q.text} [${q.marks}]`;
      }).join('\n\n');

      if (fullDataUrl) {
        await savePaperBlob(examId, fullDataUrl);
        await savePaperBlob(docId, fullDataUrl);
      }

      saveDoc({
        id: docId,
        type: 'exam',
        title: examTitle,
        content: paperMd,
        studentId: studentId || null,
        createdAt: now,
      });

      saveAiResource({
        id: docId,
        title: examTitle,
        type: 'exam',
        classLevel: '',
        subject: '',
        topic: '',
        content: paperMd,
        studentId: studentId || null,
        createdAt: now,
        isFavorite: false,
      });

      saveExam({
        ...normalized,
        id: examId,
        docId,
        title: examTitle,
        createdAt: now,
      });

      toast(`"${examTitle}" processed successfully!`, 'success');
      onClose();

      if (onExamReady) {
        onExamReady(docId, examId);
      }
    } catch (err: any) {
      console.error(err);
      if (isPdf || isImage) {
        try {
          toast('AI extraction failed. Creating Instant Question Bank + OMR sheet instead...', 'info');
          if (fullDataUrl) {
            await savePaperBlob(examId, fullDataUrl);
            await savePaperBlob(docId, fullDataUrl);
          }
          const answerMap = parseAnswerKeys(answerKeyInput, questionCount);
          const questions: Question[] = Array.from({ length: questionCount }, (_, idx) => {
            const hasKey = idx in answerMap;
            const ans = hasKey ? answerMap[idx] : 0;
            return {
              id: `q${idx + 1}`,
              n: String(idx + 1),
              type: 'mcq' as const,
              stimulus: '',
              text: `Question ${idx + 1}`,
              options: ['Option A', 'Option B', 'Option C', 'Option D'],
              answer: ans,
              guessed: !hasKey,
              marks: 1,
            };
          });

          const paperMd = `# ${examTitle}\n\nOriginal question paper attached. Answer questions 1 to ${questionCount} below.`;

          saveDoc({
            id: docId,
            type: 'exam',
            title: examTitle,
            content: paperMd,
            studentId: studentId || null,
            createdAt: now,
          });

          saveAiResource({
            id: docId,
            title: examTitle,
            type: 'exam',
            classLevel: '',
            subject: '',
            topic: '',
            content: paperMd,
            studentId: studentId || null,
            createdAt: now,
            isFavorite: false,
          });

          saveExam({
            id: examId,
            docId,
            title: examTitle,
            duration,
            instructions: 'Refer to original question paper and mark answers on the OMR sheet.',
            cqChoose: 0,
            questions,
            createdAt: now,
          });

          toast(`"${examTitle}" question bank ready!`, 'success');
          onClose();
          if (onExamReady) {
            onExamReady(docId, examId);
          }
          return;
        } catch (fallbackErr: any) {
          setError(fallbackErr.message || 'Failed to process question paper.');
        }
      } else {
        setError(err.message || 'Failed to read and process the question paper.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Upload question paper" isOpen={isOpen} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          Question paper (PDF, photo, Word or text file) *
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.doc,.docx"
            required
            onChange={handleFileChange}
          />
        </label>
        <p className="help" style={{ margin: 0 }}>
          Upload any PDF or image question paper to instantly generate an interactive test or extract full text.
        </p>

        <div className="field">
          <label style={{ fontWeight: 600 }}>Processing Mode</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="paperMode"
                value="instant"
                checked={mode === 'instant'}
                onChange={() => setMode('instant')}
              />
              <span>
                <strong>Instant Question Bank + OMR Sheet</strong> (Recommended for PDFs — 0s wait)
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="paperMode"
                value="ai"
                checked={mode === 'ai'}
                onChange={() => setMode('ai')}
              />
              <span>
                <strong>AI Full Text Extraction</strong> (Converts text & diagrams — takes 15–35s)
              </span>
            </label>
          </div>
        </div>

        {mode === 'instant' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--card2)', padding: '12px', borderRadius: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label className="field" style={{ margin: 0 }}>
                Number of Questions
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={questionCount}
                  onChange={e => setQuestionCount(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                Time Allowed (minutes)
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={duration}
                  onChange={e => setDuration(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </label>
            </div>
            <label className="field" style={{ margin: 0 }}>
              Answer Key (optional)
              <textarea
                rows={2}
                value={answerKeyInput}
                onChange={e => setAnswerKeyInput(e.target.value)}
                placeholder="e.g. B C B C B... or 1. B, 2. C (auto-marks answers)"
                style={{ fontSize: '0.85rem' }}
              />
              <span className="help" style={{ margin: '4px 0 0' }}>
                Paste comma/space-separated letters (A-D) or numbered list. You can also set/adjust answers later.
              </span>
            </label>
          </div>
        )}

        <label className="field">
          Title
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Taken from paper if left blank"
          />
        </label>

        <label className="field">
          Student (optional)
          <select
            value={studentId}
            onChange={e => setStudentId(e.target.value)}
          >
            <option value="">— No specific student —</option>
            {state.students.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {error && <div className="notice err">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Processing paper…' : mode === 'instant' ? 'Create Question Bank (0s)' : 'Read paper with AI'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
