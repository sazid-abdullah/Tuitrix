import React, { useState } from 'react';
import { useStore } from '../store/context';
import { SectionGuidePopover } from '../components/SectionGuidePopover';
import { studentBalance, contractStatus } from '../store/contracts';
import { renderAvatar } from './HomeView';
import { WEEKDAYS, fmtTime } from '../utils/date';
import { Student } from '../types';

interface StudentsViewProps {
  onNavigate: (route: string, param?: string) => void;
  onOpenStudentModal: () => void;
  onOpenBulkStudentModal?: () => void;
}

export function scheduleSummary(s: Student): string {
  if (!s.schedule || !s.schedule.length) return 'No fixed schedule';
  const sorted = [...s.schedule].sort(
    (a, b) => a.day - b.day || (a.time || '').localeCompare(b.time || '')
  );
  const times = [...new Set(sorted.map(x => x.time))];
  if (times.length === 1) {
    return `${sorted.map(x => WEEKDAYS[x.day]).join(', ')}${
      times[0] ? ' · ' + fmtTime(times[0]) : ''
    }`;
  }
  return sorted.map(x => `${WEEKDAYS[x.day]} ${fmtTime(x.time)}`).join(', ');
}

import { BatchModal } from '../components/BatchModal';
import { BatchFeeModal } from '../components/BatchFeeModal';

export const StudentsView: React.FC<StudentsViewProps> = ({
  onNavigate,
  onOpenStudentModal,
  onOpenBulkStudentModal,
}) => {
  const { state, money } = useStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [viewMode, setViewMode] = useState<'individual' | 'batch'>('individual');

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<any>(null);

  const [batchFeeModalOpen, setBatchFeeModalOpen] = useState(false);
  const [feeBatch, setFeeBatch] = useState<any>(null);

  const q = search.toLowerCase();
  const list = state.students
    .filter(s =>
      filter === 'all'
        ? true
        : filter === 'active'
        ? s.active !== false
        : s.active === false
    )
    .filter(
      s =>
        !q ||
        [s.name, s.grade, (s.subjects || []).join(' '), s.guardianName]
          .join(' ')
          .toLowerCase()
          .includes(q)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const activeCount = state.students.filter(s => s.active !== false).length;
  const batches = state.batches || [];
  const activeBatchesCount = batches.filter(b => b.active !== false).length;

  const balanceBadge = (bal: number) => {
    if (bal > 0.005) return <span className="badge red">Owes {money(bal)}</span>;
    if (bal < -0.005) return <span className="badge green">Advance {money(-bal)}</span>;
    return <span className="badge green">Paid up</span>;
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1>Students & Batches</h1>
            <SectionGuidePopover sectionKey="students" />
          </div>
          <div className="sub">
            {viewMode === 'individual' ? `${activeCount} active students` : `${activeBatchesCount} active batches`}
          </div>
        </div>
        <div>
          {viewMode === 'individual' ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              {onOpenBulkStudentModal && (
                <button className="btn ghost" onClick={onOpenBulkStudentModal}>
                  ⚡ Bulk Add
                </button>
              )}
              <button className="btn primary" onClick={onOpenStudentModal}>
                + Add student
              </button>
            </div>
          ) : (
            <button className="btn primary" onClick={() => { setEditingBatch(null); setBatchModalOpen(true); }}>
              + New Batch
            </button>
          )}
        </div>
      </div>

      <div className="toolbar" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
        <div className="seg">
          <button className={viewMode === 'individual' ? 'active' : ''} onClick={() => setViewMode('individual')}>Individual Students</button>
          <button className={viewMode === 'batch' ? 'active' : ''} onClick={() => setViewMode('batch')}>Batches (Group Tuition)</button>
        </div>
      </div>

      {viewMode === 'individual' && (
        <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search name, class, subject…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="seg">
          {(['active', 'archived', 'all'] as const).map(f => (
            <button
              key={f}
              className={filter === f ? 'active' : ''}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="list">
          {list.length === 0 ? (
            <div className="empty">
              {state.students.length ? 'No students match your search.' : 'No students yet. Add your first one!'}
            </div>
          ) : (
            list.map(s => {
              const contracts = state.contracts.filter(c => c.studentId === s.id);
              const bal = studentBalance(s.id, state.contracts, state.lessons, state.payments);
              let cycleRender = null;
              if (contracts.length > 0) {
                const activeContract = contracts.find(c => c.status !== 'ended') || contracts[0];
                const st = contractStatus(activeContract, state.lessons, state.payments);

                if (activeContract.cycleType === 'classes') {
                  const maxSegments = 12; // cap visual segments so it doesn't break UI for large cycles
                  const numSegments = Math.min(Number(activeContract.cycleLength) || 12, maxSegments);
                  const progressPct = Math.min(st.progress * 100, 100);

                  let glowColor = 'indigo';
                  if (progressPct >= 100) glowColor = 'emerald';
                  else if (progressPct >= 75) glowColor = 'amber';

                  if (progressPct >= 100) {
                    cycleRender = (
                      <span className="badge emerald" style={{ animation: 'pulse 2s infinite' }}>🎉 Cycle Complete · Payment Due!</span>
                    );
                  } else {
                    cycleRender = (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600 }}>
                          <span className="mono">{st.taught - (st.completed * Number(activeContract.cycleLength))}</span> / <span className="mono">{activeContract.cycleLength}</span> classes
                        </div>
                        <div className="cycle-bar">
                          <div className={`cycle-bar-fill ${glowColor}`} style={{ width: `${progressPct}%` }}></div>
                        </div>
                      </div>
                    );
                  }
                }
              }

              // Get last topic
              const studentLessons = state.lessons.filter(l => l.studentId === s.id && l.status === 'taught').sort((a,b) => b.date.localeCompare(a.date) || (b.time||'').localeCompare(a.time||''));
              const lastLesson = studentLessons[0];
              const topicStr = lastLesson?.topics || 'No topic logged yet';

              const phoneLink = (phone?: string, text?: string) => {
                let d = String(phone || '').replace(/\D/g, '');
                if (!d) return '';
                if (d.length === 11 && d.startsWith('01')) d = '88' + d;
                return `https://wa.me/${d}?text=${encodeURIComponent(text || '')}`;
              };

              let dueText = '';
              if (contracts.length > 0 && bal > 0.005) {
                dueText = `Hello! A friendly reminder that the tuition fee of ${money(bal)} for ${s.name} is due. The billing cycle is complete.\nThank you!`;
              }

              return (
                <div key={s.id} className="row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                  <a
                    href={`#/student/${s.id}`}
                    onClick={e => {
                      e.preventDefault();
                      onNavigate('student', s.id);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '14px', textDecoration: 'none', color: 'inherit', width: '100%' }}
                  >
                    {renderAvatar(s)}
                    <div className="grow">
                      <div className="title">
                        {s.name}
                        {s.active === false && <span className="badge">Archived</span>}
                        {(state.batches || []).filter(b => b.studentIds.includes(s.id)).map(b => (
                          <span key={b.id} className="badge blue" style={{ marginLeft: '6px' }}>👥 {b.name}</span>
                        ))}
                      </div>
                      <div className="meta">
                        {[s.grade, (s.subjects || []).join(', ')].filter(Boolean).join(' · ')}
                      </div>
                      <div className="meta" style={{ marginTop: '2px', color: 'var(--muted)', fontSize: '0.8rem' }}>
                        📖 Last Topic: <i>{topicStr}</i>
                      </div>
                    </div>
                    {contracts.length ? (cycleRender || balanceBadge(bal)) : <span className="badge">No contract</span>}
                  </a>

                  {/* Quick Actions Row */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', paddingLeft: '46px', flexWrap: 'wrap' }}>
                    <button
                      className="btn xs outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Pre-fill context
                        let pre = `student=${s.id}`;
                        if (topicStr !== 'No topic logged yet') {
                           pre += `&topic=${encodeURIComponent(topicStr)}`;
                        }
                        onNavigate('ai', `prefill=true&${pre}`);
                      }}
                      title="Generate Notes or Quiz for next class"
                    >
                      ✨ AI Quiz / Notes
                    </button>
                    {bal > 0.005 && s.phone && (
                      <a
                        className="btn xs primary"
                        href={phoneLink(s.phone, dueText)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        📲 Send Due Card
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      </>
      )}

      {viewMode === 'batch' && (
        <div className="grid-2">
          {batches.length === 0 ? (
            <div className="card empty">No batches created yet. Add one for group tuition!</div>
          ) : (
            batches.map(b => {
              const count = b.studentIds.length;
              return (
                <div key={b.id} className="card">
                  <div className="card-head">
                    <div>
                      <h3>
                        {b.name}
                        {b.active === false && <span className="badge">Archived</span>}
                      </h3>
                      <div className="muted small">
                        {[b.grade, b.curriculum, (b.subjects || []).join(', ')].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>

                  <div className="small" style={{ margin: '12px 0' }}>
                    <b>{count} Students:</b>{' '}
                    {b.studentIds.map(id => state.students.find(s => s.id === id)?.name).filter(Boolean).join(', ') || 'None'}
                  </div>

                  {b.notes && <p className="muted small">{b.notes}</p>}

                  <div className="actions" style={{ marginTop: '12px' }}>
                    <button
                      className="btn sm primary"
                      onClick={() => {
                        // Will implement this navigation in ClassesView later
                        onNavigate('classes', `batch=${b.id}`);
                      }}
                    >
                      Log Batch Class
                    </button>
                    <button className="btn sm primary outline" onClick={() => { setFeeBatch(b); setBatchFeeModalOpen(true); }}>
                      Collect Batch Fees
                    </button>
                    <button className="btn sm" onClick={() => { setEditingBatch(b); setBatchModalOpen(true); }}>
                      Edit Batch
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {batchModalOpen && (
        <BatchModal
          isOpen={batchModalOpen}
          batch={editingBatch}
          onClose={() => setBatchModalOpen(false)}
        />
      )}

      {batchFeeModalOpen && (
        <BatchFeeModal
          isOpen={batchFeeModalOpen}
          batch={feeBatch}
          onClose={() => setBatchFeeModalOpen(false)}
        />
      )}
    </div>
  );
};
