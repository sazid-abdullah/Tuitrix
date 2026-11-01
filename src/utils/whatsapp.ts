export interface WhatsAppMessageProps {
  studentName?: string;
  lang?: 'en' | 'bn';
  completedClasses?: number | string;
  targetClasses?: number | string;
  lastClassDate?: string;
  lastClassTopic?: string;
  dueAmount?: string | number;
  tutorName?: string;
  hasLastClass?: boolean;
  latestExamResult?: { title?: string; percent?: number };
}

export function generateWhatsAppMessage(props?: WhatsAppMessageProps): string {
  const p = props || {};
  const studentName = p.studentName || 'Student';
  const lang = p.lang === 'bn' ? 'bn' : 'en';
  const completedClasses = p.completedClasses !== undefined && p.completedClasses !== null ? p.completedClasses : 0;
  const targetClasses = p.targetClasses !== undefined && p.targetClasses !== null ? p.targetClasses : 'N/A';
  const dueAmount = p.dueAmount !== undefined && p.dueAmount !== null ? String(p.dueAmount) : '0';
  const tutorName = p.tutorName || 'Tutor';
  const hasLastClass = !!p.hasLastClass;

  const lastClassTextEn = hasLastClass ? ` (Last class: ${p.lastClassDate || ''}${p.lastClassTopic ? ` - ${p.lastClassTopic}` : ''})` : '';
  const lastClassTextBn = hasLastClass ? ` (শেষ ক্লাস: ${p.lastClassDate || ''}${p.lastClassTopic ? ` - ${p.lastClassTopic}` : ''})` : '';

  const hasScore = p.latestExamResult && typeof p.latestExamResult.percent === 'number' && !isNaN(p.latestExamResult.percent);
  const examTextEn = hasScore ? ` Recent exam (${p.latestExamResult?.title || 'Exam'}) score: ${p.latestExamResult?.percent}%.` : '';
  const examTextBn = hasScore ? ` সাম্প্রতিক পরীক্ষা (${p.latestExamResult?.title || 'পরীক্ষা'})-এ প্রাপ্ত নম্বর: ${p.latestExamResult?.percent}%।` : '';

  if (lang === 'bn') {
    return `আসসালামু আলাইকুম, ${studentName}-এর বর্তমান সাইকেলের ${completedClasses}/${targetClasses}টি ক্লাস সম্পন্ন হয়েছে${lastClassTextBn}।${examTextBn} বকেয়া টিউশন ফি: ৳${dueAmount}। অনুগ্রহ করে পরিশোধের ব্যবস্থা করলে উপকৃত হব। ধন্যবাদ — ${tutorName}।`;
  }

  return `Assalamu Alaikum, ${studentName} has completed ${completedClasses}/${targetClasses} classes for the current cycle${lastClassTextEn}.${examTextEn} Total tuition fee due: ৳${dueAmount}. Thank you — ${tutorName}.`;
}
