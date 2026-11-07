import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/context';
import { callAI, EXAM_JSON_SYSTEM, examJsonPrompt, normalizeExam, extractFileText, parseAiJson } from '../services/ai';
import { uid } from '../utils/date';
import { isProUser, canSaveAiResource, FREE_TIER_MAX_SAVED_RESOURCES } from '../utils/tierLimits';
import { savePaperBlob } from '../utils/paperStorage';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStudentId(initialStudentId || '');
      setTitle('');
      setFile(null);
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

      if (!normalized.questions || normalized.questions.length === 0) {
        throw new Error('AI could not extract valid questions from this document. Please ensure the paper has numbered questions.');
      }

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
      setError(err.message || 'Failed to read and process the question paper.');
      toast(err.message || 'Failed to process question paper with AI.', 'error');
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
          Upload any PDF or image question paper to extract full questions, diagrams, and options.
        </p>

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
            {loading ? 'Reading PDF & extracting 50 questions + diagrams with AI (10–25s)...' : 'Read paper with AI'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
