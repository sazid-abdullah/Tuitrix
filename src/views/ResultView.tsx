import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/context';
import { fmtDate, fmtN, uid, todayISO } from '../utils/date';
import { renderMarkdown, callAI, MARK_SYSTEM, markPrompt, parseAiJson } from '../services/ai';
import { publishSharedExamResult, fetchSharedExamResult } from '../services/firebase';
import { ConfirmModal } from '../components/ConfirmModal';
import { Question, Exam } from '../types';

interface ResultViewProps {
  attemptId: string;
  onNavigate: (route: string, param?: string) => void;
}

export const ResultView: React.FC<ResultViewProps> = ({ attemptId, onNavigate }) => {
  const { state, studentName, saveAttempt, deleteAttempt, saveExam, addExamScore, toast } = useStore();

  const localAttempt = state.attempts.find(a => a.id === attemptId);
  const [sharedData, setSharedData] = useState<{
    id?: string;
    attempt: any;
    exam: any;
    studentFirstName?: string;
    tutorName?: string;
  } | null>(null);
  const [loadingShared, setLoadingShared] = useState<boolean>(!localAttempt);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (localAttempt) {
      setLoadingShared(false);
      return;
    }
    let isMounted = true;
    setLoadingShared(true);
    fetchSharedExamResult(attemptId)
      .then(data => {
        if (isMounted) {
          if (data) {
            setSharedData(data);
          }
          setLoadingShared(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoadingShared(false);
      });
    return () => {
      isMounted = false;
    };
  }, [attemptId, localAttempt]);

  const attempt = localAttempt || sharedData?.attempt || null;
  const isReadOnly = !state.attempts.some(a => a.id === attemptId);

  const resolvedExam = useMemo<Exam | null>(() => {
    if (!attempt) return null;
    const found = state.exams.find(e => e.id === attempt.examId);
    if (found) return found;
    if (sharedData?.exam) return sharedData.exam as Exam;
    // Synthesize fallback Exam object from attempt
    return {
      id: attempt.examId || attempt.id,
      title: attempt.title || 'Exam',
      duration: 60,
      instructions: '',
      cqChoose: 0,
      questions: ((attempt as any).questions || []) as Question[],
    };
  }, [attempt, state.exams, sharedData]);

  const exam = resolvedExam;

  const [marksState, setMarksState] = useState<Record<string, any>>(attempt?.marks || {});
  const [aiMarks, setAiMarks] = useState<Record<string, { marks: number; reason: string }>>(
    attempt?.aiMarks || {}
  );
  const [aiBusy, setAiBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(attempt?.studentId || '');

  useEffect(() => {
    if (attempt) {
      setMarksState(attempt.marks || {});
      setAiMarks(attempt.aiMarks || {});
      setSelectedStudentId(attempt.studentId || '');
    }
  }, [attempt?.id]);

  if (loadingShared) {
    return (
      <div className="card empty" style={{ textAlign: 'center', padding: '40px' }}>
        <span className="spinner" style={{ marginRight: '8px' }} /> Loading result…
      </div>
    );
  }

  if (!attempt || !exam) {
    return (
      <div className="card empty">
        Result not found.{' '}
        <a
          href="#/ai?tool=results"
          onClick={e => {
            e.preventDefault();
            onNavigate('ai', 'tool=results');
          }}
        >
          All results
        </a>
      </div>
    );
  }

  const activeStudentId = attempt.studentId || selectedStudentId;
  const targetStudent = state.students.find(s => s.id === activeStudentId);

  const mcqs = exam.questions.filter(q => q.type === 'mcq');
  const wqs = exam.questions.filter(q => q.type !== 'mcq');

  // Build lookup of maximum marks for CQ parts and written questions
  const maxMarksMap: Record<string, number> = {};
  for (const q of wqs) {
    if (q.type === 'cq') {
      q.parts.forEach((p, idx) => {
        maxMarksMap[`${q.id}:${idx}`] = Number(p.marks) || 0;
      });
    } else {
      maxMarksMap[`${q.id}:0`] = Number(q.marks) || 0;
      maxMarksMap[q.id] = Number(q.marks) || 0;
    }
  }

  // Clamps marks to valid bounds [0, max]
  const clampMark = (val: any, max: number): number | '' => {
    if (val === '' || val === null || val === undefined) return '';
    const num = Number(val);
    if (isNaN(num)) return 0;
    return Math.max(0, Math.min(num, max));
  };

  // Calculate scores
  let mcqGot = 0;
  let mcqRight = 0;
  for (const q of mcqs) {
    if (q.type === 'mcq' && q.answer != null && attempt.answers[q.id] === q.answer) {
      mcqGot += q.marks || 1;
      mcqRight++;
    }
  }

  let writtenGot = 0;
  let pendingCount = 0;
  for (const q of wqs) {
    if (q.type === 'cq') {
      for (let i = 0; i < q.parts.length; i++) {
        const m = marksState[`${q.id}:${i}`];
        if (m !== undefined && m !== '') {
          const clamped = clampMark(m, q.parts[i].marks);
          writtenGot += typeof clamped === 'number' ? clamped : 0;
        } else {
          pendingCount++;
        }
      }
    } else {
      const m = marksState[q.id];
      if (m !== undefined && m !== '') {
        const clamped = clampMark(m, q.marks);
        writtenGot += typeof clamped === 'number' ? clamped : 0;
      } else {
        pendingCount++;
      }
    }
  }

  const totalMax = exam.questions.reduce((sum, q) => {
    if (q.type === 'cq') {
      return sum + q.parts.reduce((pSum, p) => pSum + p.marks, 0);
    }
    return sum + (q.marks || 1);
  }, 0);

  const totalScore = mcqGot + writtenGot;

  const isScoreLogged = Boolean(
    attempt.scoreLogged ||
    (targetStudent && targetStudent.examScores?.some(s =>
      s.id === attempt.id ||
      s.remarks?.includes(`attempt:${attempt.id}`) ||
      (s.title === attempt.title && s.totalMarks === totalMax && s.obtainedMarks === totalScore)
    ))
  );

  const handleAIMark = async () => {
    if (aiBusy) return;
    setAiBusy(true);

    try {
      const items: any[] = [];
      for (const q of wqs) {
        if (q.type === 'cq') {
          items.push({
            id: q.id,
            stimulus: q.stimulus,
            parts: q.parts.map((p, i) => ({
              part: i,
              question: `${p.label ? p.label + '. ' : ''}${p.text}`,
              max: p.marks,
              model_answer: p.answer,
              student_answer: String(attempt.answers[q.id]?.[i] || '').trim(),
            })).filter(p => p.student_answer),
          });
        } else {
          items.push({
            id: q.id,
            parts: [{
              part: 0,
              question: q.text,
              max: q.marks,
              model_answer: q.answer,
              student_answer: String(attempt.answers[q.id] || '').trim(),
            }].filter(p => p.student_answer),
          });
        }
      }

      const nonEmptyItems = items.filter(item => item.parts && item.parts.length > 0);

      if (!nonEmptyItems.length) {
        toast('No typed answers to evaluate automatically.', 'info');
        setAiBusy(false);
        return;
      }

      const promptText = markPrompt(nonEmptyItems);
      const res = await callAI(MARK_SYSTEM, promptText, state, { temperature: 0.2, json: true, onFallback: (msg) => toast(msg, 'info') });
      const parsed = parseAiJson(res);

      const out: Record<string, { marks: number; reason: string }> = {};
      for (const m of parsed?.marks || []) {
        const key = `${m.id}:${m.part}`;
        const maxVal = maxMarksMap[key] ?? maxMarksMap[m.id] ?? 100;
        const clamped = clampMark(m.marks, maxVal);
        out[key] = {
          marks: typeof clamped === 'number' ? clamped : 0,
          reason: m.reason || '',
        };
      }

      setAiMarks(out);
      saveAttempt({ ...attempt, aiMarks: out });
      toast('AI mark recommendations ready! Review and apply.', 'success');
    } catch (err: any) {
      toast(err.message || 'AI marking failed', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const handleUseAIMarks = () => {
    const updated = { ...marksState };
    for (const [k, v] of Object.entries(aiMarks)) {
      const maxVal = maxMarksMap[k] ?? 100;
      const clamped = clampMark(v.marks, maxVal);
      const clampedVal = typeof clamped === 'number' ? clamped : 0;
      updated[k] = clampedVal;
      if (k.endsWith(':0')) {
        const qId = k.slice(0, -2);
        const q = wqs.find(question => question.id === qId);
        if (q && q.type !== 'cq') {
          updated[q.id] = clampedVal;
        }
      }
    }
    setMarksState(updated);
    toast('Applied AI suggested marks', 'info');
  };

  const handleSaveMarks = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMarks: Record<string, any> = {};
    for (const [k, v] of Object.entries(marksState)) {
      if (v === '' || v === undefined) {
        cleanMarks[k] = '';
      } else {
        const maxVal = maxMarksMap[k] ?? 100;
        cleanMarks[k] = clampMark(v, maxVal);
      }
    }

    let newWrittenGot = 0;
    for (const q of wqs) {
      if (q.type === 'cq') {
        for (let i = 0; i < q.parts.length; i++) {
          const m = cleanMarks[`${q.id}:${i}`];
          if (m !== undefined && m !== '') {
            const clamped = clampMark(m, q.parts[i].marks);
            newWrittenGot += typeof clamped === 'number' ? clamped : 0;
          }
        }
      } else {
        const m = cleanMarks[q.id];
        if (m !== undefined && m !== '') {
          const clamped = clampMark(m, q.marks);
          newWrittenGot += typeof clamped === 'number' ? clamped : 0;
        }
      }
    }

    if (attempt.scoreLogged && activeStudentId) {
      addExamScore(activeStudentId, {
        id: attempt.id,
        studentId: activeStudentId,
        title: attempt.title,
        subject: exam.title,
        date: todayISO(),
        obtainedMarks: mcqGot + newWrittenGot,
        totalMarks: totalMax,
        remarks: `Completed via Interactive Exam (attempt:${attempt.id})`,
      });
    }

    const updated = {
      ...attempt,
      status: 'marked' as const,
      marks: cleanMarks,
      aiMarks,
    };
    saveAttempt(updated);
    setMarksState(cleanMarks);
    toast('Marks saved successfully', 'success');
  };

  const handleLogScore = () => {
    if (!activeStudentId) {
      toast('Please select a student to log score to their profile.', 'error');
      return;
    }
    if (isScoreLogged) {
      toast('Score has already been logged for this exam attempt.', 'info');
      return;
    }

    addExamScore(activeStudentId, {
      id: attempt.id,
      studentId: activeStudentId,
      title: attempt.title,
      subject: exam.title,
      date: todayISO(),
      obtainedMarks: totalScore,
      totalMarks: totalMax,
      remarks: `Completed via Interactive Exam (attempt:${attempt.id})`,
    });

    const updated = {
      ...attempt,
      studentId: activeStudentId,
      scoreLogged: true,
      marks: marksState,
      aiMarks,
    };
    saveAttempt(updated);
    toast('Score logged to student profile!', 'success');
  };

  const handleSetMCQAnswer = (qId: string, correctIdx: number) => {
    const updatedQuestions = exam.questions.map(q => {
      if (q.id === qId && q.type === 'mcq') {
        return { ...q, answer: correctIdx };
      }
      return q;
    });
    saveExam({ ...exam, questions: updatedQuestions });
    toast('MCQ answer key updated', 'success');
  };

  const handleShareResult = async () => {
    if (!attempt || !resolvedExam) return;
    setSharing(true);
    try {
      await publishSharedExamResult(attempt, resolvedExam, {
        studentFirstName: targetStudent?.name,
        tutorName: state.settings.tutorName,
      });
      const shareUrl = `${window.location.origin}${window.location.pathname}#/result/${attempt.id}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      toast('Result link copied to clipboard!', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to share result', 'error');
    } finally {
      setSharing(false);
    }
  };

  const L = ['(a)', '(b)', '(c)', '(d)', '(e)', '(f)'];

  return (
    <div>
      <div className="page-head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h1>{attempt.title}</h1>
            {isReadOnly && <span className="badge">Shared Result (Read-Only)</span>}
          </div>
          <div className="sub">
            {sharedData?.studentFirstName
              ? `${sharedData.studentFirstName} · `
              : activeStudentId
              ? `${studentName(activeStudentId)} · `
              : ''}
            {attempt.startedAt
              ? fmtDate(new Date(attempt.startedAt).toISOString().slice(0, 10))
              : ''}
            {sharedData?.tutorName ? ` · Tutor: ${sharedData.tutorName}` : ''}
          </div>
        </div>
        <div className="actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {!isReadOnly && !attempt.studentId && (
            <select
              value={selectedStudentId}
              onChange={e => setSelectedStudentId(e.target.value)}
              style={{ minWidth: '150px' }}
            >
              <option value="">Select student…</option>
              {state.students.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {!isReadOnly && (
            <button
              type="button"
              className={`btn ${isScoreLogged ? 'secondary' : 'primary'}`}
              onClick={handleLogScore}
              disabled={!activeStudentId || isScoreLogged}
              title={isScoreLogged ? 'Score already logged to student profile' : 'Log score to student profile'}
            >
              {isScoreLogged ? '✓ Score Logged to Profile' : '📈 Log Score to Student Profile'}
            </button>
          )}
          {!isReadOnly && (
            <button
              type="button"
              className="btn ghost"
              onClick={handleShareResult}
              disabled={sharing}
              title="Publish and copy a public link for parents/students"
            >
              {sharing ? 'Generating link…' : '🔗 Share Result Link'}
            </button>
          )}
          <button type="button" className="btn ghost" onClick={() => window.print()}>
            🖨️ Print
          </button>
          {!isReadOnly && (
            <button type="button" className="btn ghost" onClick={() => setDeleteConfirmOpen(true)}>
              Delete result
            </button>
          )}
        </div>
      </div>

      <div className="stats">
        <div className="card stat">
          <div className="label">Total Score</div>
          <div className="value">
            {fmtN(totalScore)} / {fmtN(totalMax)}
          </div>
          <div className="hint">
            {totalMax ? Math.round((totalScore / totalMax) * 100) : 0}%
            {pendingCount > 0 ? ' (partial)' : ''}
          </div>
        </div>
        {mcqs.length > 0 && (
          <div className="card stat">
            <div className="label">MCQ Score</div>
            <div className="value">
              {mcqRight} / {mcqs.length}
            </div>
            <div className="hint">correct</div>
          </div>
        )}
        {wqs.length > 0 && (
          <div className="card stat">
            <div className="label">Written Grading</div>
            <div className="value">{pendingCount ? `${pendingCount} to mark` : 'Marked'}</div>
          </div>
        )}
      </div>

      {/* Written questions marking */}
      {wqs.length > 0 && (
        <div className="section">
          <h2>{isReadOnly ? 'Written Question Review' : 'Mark written answers'}</h2>
          <p className="muted small" style={{ marginBottom: '12px' }}>
            {isReadOnly
              ? 'Student responses and evaluated marks.'
              : 'Review student responses and assign marks. You can also ask AI for scoring recommendations.'}
          </p>

          <form onSubmit={handleSaveMarks}>
            {wqs.map(q => (
              <div key={q.id} className="card exam-q" style={{ marginBottom: '14px' }}>
                <div className="exam-qn">
                  <b>Question {q.n}</b>
                </div>

                {'stimulus' in q && q.stimulus && (
                  <details style={{ marginBottom: '8px' }}>
                    <summary className="small muted">Stimulus</summary>
                    <div
                      className="doc exam-stim"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(q.stimulus) }}
                    />
                  </details>
                )}

                {q.type === 'cq' ? (
                  q.parts.map((p, pIdx) => {
                    const ans = String(attempt.answers[q.id]?.[pIdx] || '').trim();
                    const key = `${q.id}:${pIdx}`;
                    const sug = aiMarks[key];

                    return (
                      <div key={pIdx} className="exam-part">
                        <div className="doc">
                          <b>({p.label})</b> {p.text} *[{p.marks} marks]*
                        </div>
                        <div className="exam-ans">
                          {ans || <span className="muted">No typed response (written on paper)</span>}
                        </div>
                        {p.answer && (
                          <details style={{ margin: '4px 0' }}>
                            <summary className="small muted">Model answer</summary>
                            <div className="doc small">{p.answer}</div>
                          </details>
                        )}
                        <div className="mark-row">
                          <label className="mark-in">
                            Marks{' '}
                            {isReadOnly ? (
                              <b>{marksState[key] !== '' && marksState[key] !== undefined ? marksState[key] : '—'}</b>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                max={p.marks}
                                step="0.5"
                                value={marksState[key] ?? ''}
                                onChange={e => {
                                  const v = e.target.value;
                                  setMarksState({
                                    ...marksState,
                                    [key]: v === '' ? '' : clampMark(v, p.marks),
                                  });
                                }}
                              />
                            )}{' '}
                            / {p.marks}
                          </label>
                          {!isReadOnly && sug && (
                            <span className="help">
                              AI suggests <b>{sug.marks}</b>: {sug.reason}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div>
                    <div
                      className="doc"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(q.text) }}
                    />
                    <div className="exam-ans">
                      {String(attempt.answers[q.id] || '').trim() || (
                        <span className="muted">No typed response</span>
                      )}
                    </div>
                    {q.answer && (
                      <details style={{ margin: '4px 0' }}>
                        <summary className="small muted">Model answer</summary>
                        <div className="doc small">{q.answer}</div>
                      </details>
                    )}
                    <div className="mark-row">
                      <label className="mark-in">
                        Marks{' '}
                        {isReadOnly ? (
                          <b>{marksState[q.id] !== '' && marksState[q.id] !== undefined ? marksState[q.id] : '—'}</b>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            max={q.marks}
                            step="0.5"
                            value={marksState[q.id] ?? ''}
                            onChange={e => {
                              const v = e.target.value;
                              setMarksState({
                                ...marksState,
                                [q.id]: v === '' ? '' : clampMark(v, q.marks),
                              });
                            }}
                          />
                        )}{' '}
                        / {q.marks}
                      </label>
                      {!isReadOnly && aiMarks[`${q.id}:0`] && (
                        <span className="help">
                          AI suggests <b>{aiMarks[`${q.id}:0`].marks}</b>:{' '}
                          {aiMarks[`${q.id}:0`].reason}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {!isReadOnly && (
              <div className="form-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={handleAIMark}
                  disabled={aiBusy}
                >
                  {aiBusy ? <span className="spinner" /> : 'Suggest marks with AI'}
                </button>
                {Object.keys(aiMarks).length > 0 && (
                  <button type="button" className="btn" onClick={handleUseAIMarks}>
                    Use AI suggestions
                  </button>
                )}
                <button type="submit" className="btn primary">
                  Save marks
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* MCQ review section */}
      {mcqs.length > 0 && (
        <div className="section">
          <h2>Multiple Choice Review</h2>
          <div className="card">
            <div className="list">
              {mcqs.map((q: Question) => {
                if (q.type !== 'mcq') return null;
                const studentChoice = attempt.answers[q.id];
                const isCorrect = q.answer != null && studentChoice === q.answer;

                return (
                  <div key={q.id} className="row">
                    <div className="grow">
                      <div className="title">
                        <b>{q.n}.</b> {q.text}
                      </div>
                      <div className="meta">
                        Student answered:{' '}
                        {studentChoice != null
                          ? `${L[studentChoice]} ${q.options[studentChoice] || ''}`
                          : 'Nothing'}
                        {q.answer != null && !isCorrect && (
                          <> · Correct: {L[q.answer]} {q.options[q.answer]}</>
                        )}
                      </div>
                    </div>
                    {q.answer == null ? (
                      isReadOnly ? (
                        <span className="badge">No key</span>
                      ) : (
                        <select
                          onChange={e =>
                            e.target.value !== '' &&
                            handleSetMCQAnswer(q.id, Number(e.target.value))
                          }
                          defaultValue=""
                        >
                          <option value="">Set key…</option>
                          {q.options.map((opt, i) => (
                            <option key={i} value={i}>
                              {L[i]} {opt}
                            </option>
                          ))}
                        </select>
                      )
                    ) : isCorrect ? (
                      <span className="badge green">✓</span>
                    ) : (
                      <span className="badge red">✗</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!isReadOnly && (
        <ConfirmModal
          isOpen={deleteConfirmOpen}
          title="Delete this result?"
          message="The student's recorded score and answers will be permanently deleted."
          confirmLabel="Delete"
          isDanger
          onConfirm={() => {
            deleteAttempt(attempt.id);
            toast('Result deleted', 'info');
            onNavigate('ai', 'tool=results');
          }}
          onClose={() => setDeleteConfirmOpen(false)}
        />
      )}
    </div>
  );
};
