export interface BoardExamPreset {
  id: string;
  label: string;
  badge: string;
  curriculum: string;
  grade?: string;
  format: 'board' | 'cq' | 'mcq';
  cqCount: number;
  cqAnswer: number;
  mcqCount: number;
  duration: number;
  notes: string;
}

export const BOARD_EXAM_PRESETS: BoardExamPreset[] = [
  {
    id: 'ssc-science-75',
    label: 'SSC Science (75 Marks)',
    badge: '5/8 CQ + 25 MCQ',
    curriculum: 'NCTB (SSC)',
    grade: 'Class 9-10 (SSC)',
    format: 'board',
    cqCount: 8,
    cqAnswer: 5,
    mcqCount: 25,
    duration: 180,
    notes: 'Follow Dhaka Board SSC Science pattern with 4-part creative questions (ক, খ, গ, ঘ) and 25 MCQs.',
  },
  {
    id: 'hsc-science-75',
    label: 'HSC Science (75 Marks)',
    badge: '5/8 CQ + 25 MCQ',
    curriculum: 'NCTB (HSC)',
    grade: 'Class 11-12 (HSC)',
    format: 'board',
    cqCount: 8,
    cqAnswer: 5,
    mcqCount: 25,
    duration: 180,
    notes: 'Follow NCTB HSC Science board standard with analytical stimuli (উদ্দীপক) and 25 MCQs.',
  },
  {
    id: 'board-general-100',
    label: 'Full 100-Mark Board',
    badge: '7/11 CQ + 30 MCQ',
    curriculum: 'NCTB (SSC/HSC)',
    format: 'board',
    cqCount: 11,
    cqAnswer: 7,
    mcqCount: 30,
    duration: 180,
    notes: 'Follow full 100-mark NCTB Board pattern: answer any 7 of 11 CQs (70 marks) plus 30 MCQs (30 marks).',
  },
  {
    id: 'mcq-drill-25',
    label: '25-Mark MCQ Drill',
    badge: '25 MCQ · 25m',
    curriculum: 'NCTB Board',
    format: 'mcq',
    cqCount: 0,
    cqAnswer: 0,
    mcqCount: 25,
    duration: 25,
    notes: 'Rapid board-style 25-MCQ drill including multiple-completion (বহুপদী সমাপ্তিসূচক) and stem-based questions.',
  },
  {
    id: 'cq-chapter-30',
    label: 'Chapter CQ Test (30 Marks)',
    badge: '3/4 CQ · 60m',
    curriculum: 'NCTB Board',
    format: 'cq',
    cqCount: 4,
    cqAnswer: 3,
    mcqCount: 0,
    duration: 60,
    notes: 'Chapter-wise creative test: 4 CQs with real-world stimuli, student answers any 3.',
  },
];

export function getPresetById(id: string): BoardExamPreset | undefined {
  return BOARD_EXAM_PRESETS.find(p => p.id === id);
}
