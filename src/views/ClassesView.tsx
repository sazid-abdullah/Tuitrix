import React, { useState } from 'react';
import { useStore } from '../store/context';
import { SectionGuidePopover } from '../components/SectionGuidePopover';
import { statusBadge } from './HomeView';
import { monthKey, todayISO, fmtMonth, fmtDate, fmtTime } from '../utils/date';
import { Lesson } from '../types';

interface ClassesViewProps {
  initialStudentFilter?: string;
  initialBatchFilter?: string;
  onNavigate: (route: string, param?: string) => void;
  onLogLesson: (opts: { studentId?: string; batchId?: string; lesson?: Lesson }) => void;
}

export const ClassesView: React.FC<ClassesViewProps> = ({
  initialStudentFilter = '',
  initialBatchFilter = '',
  onNavigate,
  onLogLesson,
}) => {
  const { state, studentName } = useStore();
  const [studentFilter, setStudentFilter] = useState(initialStudentFilter);
  const [batchFilter, setBatchFilter] = useState(initialBatchFilter);
  const [monthFilter, setMonthFilter] = useState<string>(monthKey(todayISO()));
  const [viewMode, setViewMode] = useState<'log' | 'routine'>('log');

  const BANGLA_DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const todayDayIndex = new Date().getDay();
  // JS getDay(): 0 = Sun, 1 = Mon, ..., 6 = Sat
  // BANGLA_DAYS index: 0 = Sat, 1 = Sun, ..., 6 = Fri
  const jsDayToBanglaIndex: Record<number, number> = { 6: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 };
  const todayBanglaIndex = jsDayToBanglaIndex[todayDayIndex];

  const filtered = state.lessons
    .filter(l => !studentFilter || l.studentId === studentFilter)
    .filter(l => !batchFilter || l.batchId === batchFilter)
    .filter(l => !monthFilter || monthKey(l.date) === monthFilter)
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));

  const groups: Record<string, Lesson[]> = {};
  for (const l of filtered) {
    (groups[l.date] = groups[l.date] || []).push(l);
  }

  const taught = filtered.filter(l => l.status === 'taught');
  const minutes = taught.reduce((a, l) => a + (Number(l.duration) || 0), 0);
  const hours = Math.round(minutes / 6) / 10;
  const absentOrCancelled = filtered.length - taught.length;

  return (
    <div>
      <div className="page-head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1>Classes</h1>
            <SectionGuidePopover sectionKey="classes" />
          </div>
          <div className="sub">Manage routines and logs</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn primary"
            onClick={() => onLogLesson({ studentId: studentFilter })}
          >
            + Log class
          </button>
          <button
            className="btn"
            onClick={() => onLogLesson({ batchId: batchFilter || (state.batches?.[0]?.id ?? '') })}
          >
            + Log Batch
          </button>
        </div>
      </div>

      <div className="toolbar" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
        <div className="seg">
          <button className={viewMode === 'log' ? 'active' : ''} onClick={() => setViewMode('log')}>📋 Class Log</button>
          <button className={viewMode === 'routine' ? 'active' : ''} onClick={() => setViewMode('routine')}>📅 Weekly Routine</button>
        </div>
      </div>

      {viewMode === 'routine' ? (
        <div className="routine-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          {BANGLA_DAYS.map((day, i) => {
            const isToday = i === todayBanglaIndex;
            const scheduledItems: { id: string; name: string; type: 'student' | 'batch'; time: string }[] = [];

            state.students.filter(s => s.active !== false).forEach(s => {
              if (s.scheduleDays?.includes(day)) {
                scheduledItems.push({ id: s.id, name: s.name, type: 'student', time: s.scheduleTime || '' });
              }
            });

            state.batches?.filter(b => b.active !== false).forEach(b => {
              if (b.scheduleDays?.includes(day)) {
                scheduledItems.push({ id: b.id, name: b.name, type: 'batch', time: b.scheduleTime || '' });
              }
            });

            scheduledItems.sort((a, b) => a.time.localeCompare(b.time));

            return (
              <div key={day} className={`card ${isToday ? 'highlight-today' : ''}`} style={isToday ? { border: '2px solid var(--primary)' } : {}}>
                <div style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '1.1em', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{day}</span>
                  {isToday && <span style={{ color: 'var(--primary)', fontSize: '0.8em', padding: '2px 6px', background: 'var(--bg)', borderRadius: '4px' }}>Today</span>}
                </div>
                {scheduledItems.length === 0 ? (
                  <div className="muted small">No classes</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {scheduledItems.map(item => (
                      <div key={item.id + item.type} style={{ padding: '8px', background: 'var(--bg)', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 500 }}>{item.name} {item.type === 'batch' && <span className="badge">Batch</span>}</div>
                          <div className="muted small">{item.time ? fmtTime(item.time) : 'Time not set'}</div>
                        </div>
                        <button
                          className="btn sm ghost"
                          onClick={() => item.type === 'batch' ? onLogLesson({ batchId: item.id }) : onLogLesson({ studentId: item.id })}
                        >
                          ✅
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>

      <div className="toolbar">
        <select
          value={studentFilter}
          onChange={e => { setStudentFilter(e.target.value); setBatchFilter(''); }}
          aria-label="Filter by Student"
        >
          <option value="">All students</option>
          {state.students.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {state.batches && state.batches.length > 0 && (
          <select
            value={batchFilter}
            onChange={e => { setBatchFilter(e.target.value); setStudentFilter(''); }}
            aria-label="Filter by Batch"
          >
            <option value="">All batches</option>
            {state.batches.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}

        <input
          type="month"
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          aria-label="Filter by Month"
        />

        {monthFilter && (
          <button className="btn ghost" onClick={() => setMonthFilter('')}>
            All time
          </button>
        )}
      </div>

      <div className="stats">
        <div className="card stat">
          <div className="label">Classes taught</div>
          <div className="value">{taught.length}</div>
          <div className="hint">{monthFilter ? fmtMonth(monthFilter) : 'all time'}</div>
        </div>
        <div className="card stat">
          <div className="label">Hours</div>
          <div className="value">{hours}</div>
        </div>
        <div className="card stat">
          <div className="label">Absent / cancelled</div>
          <div className="value">{absentOrCancelled}</div>
        </div>
      </div>

      {Object.keys(groups).length === 0 ? (
        <div className="card empty">No classes found for this filter.</div>
      ) : (
        Object.keys(groups).map(date => (
          <div key={date} className="day-group">
            <h3>{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            {groups[date].map(l => (
              <div key={l.id} className="lesson">
                <div className="top">
                  <div>
                    <div className="title">
                      <b>
                        <a
                          href={`#/student/${l.studentId}`}
                          onClick={e => {
                            e.preventDefault();
                            onNavigate('student', l.studentId);
                          }}
                        >
                          {studentName(l.studentId)}
                        </a>
                        {l.subject ? ` · ${l.subject}` : ''}
                        {l.batchId && (
                          <span className="badge blue" style={{ marginLeft: '6px' }}>
                            👥 {state.batches?.find(b => b.id === l.batchId)?.name || 'Batch'}
                          </span>
                        )}
                      </b>
                    </div>
                    <div className="meta muted small">
                      {l.time ? fmtTime(l.time) + ' · ' : ''}
                      {l.duration ? `${l.duration} min` : ''}
                    </div>
                  </div>
                  <div className="actions">
                    {statusBadge(l.status)}
                    <button
                      className="btn sm ghost"
                      onClick={() => onLogLesson({ studentId: l.studentId, lesson: l })}
                    >
                      Edit
                    </button>
                  </div>
                </div>
                {l.topics && <div className="topics">{l.topics}</div>}
                {l.homework && (
                  <div className="hw">
                    <b>Homework:</b> {l.homework}
                  </div>
                )}
                {l.notes && (
                  <div className="hw">
                    <b>Notes:</b> {l.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))
      )}
      </>
      )}
    </div>
  );
};
