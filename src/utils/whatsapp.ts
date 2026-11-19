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

/**
 * Normalizes phone numbers for WhatsApp API URLs.
 * - Strips non-digits
 * - Strips leading '00'
 * - Prefixes 11-digit BD numbers ('01XXXXXXXXX') with '88'
 * - Rejects numbers under 7 digits
 */
export function normalizeWhatsAppPhone(raw?: string): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (!digits || digits.length < 7) {
    return '';
  }
  if (digits.startsWith('01') && digits.length === 11) {
    return `88${digits}`;
  }
  return digits;
}

export interface FeeReminderProps {
  studentName?: string;
  contractTitle?: string;
  dueAmount: number;
  currency?: string;
  owedSince?: string;
  tutorName?: string;
  paymentNote?: string;
  lang?: 'en' | 'bn';
}

/**
 * Generates a polite, concise WhatsApp fee reminder message in English or Bangla.
 */
export function generateFeeReminderMessage(props: FeeReminderProps): string {
  const student = props.studentName?.trim() || 'Student';
  const amount = Math.round(Number(props.dueAmount) || 0);
  const currency = props.currency || '৳';
  const tutor = props.tutorName?.trim() || 'Tutor';
  const contract = props.contractTitle?.trim();
  const owedSince = props.owedSince?.trim();
  const note = props.paymentNote?.trim();
  const lang = props.lang === 'bn' ? 'bn' : 'en';

  if (lang === 'bn') {
    const contractText = contract ? ` (${contract})` : '';
    const owedText = owedSince ? ` (${owedSince} থেকে)` : '';
    const noteText = note ? ` নোট: ${note}।` : '';
    return `আসসালামু আলাইকুম, ${student}-এর${contractText} বকেয়া টিউশন ফি: ${currency}${amount}${owedText}।${noteText} অনুগ্রহ করে পরিশোধের ব্যবস্থা করলে উপকৃত হব। ধন্যবাদ — ${tutor}।`;
  }

  const contractText = contract ? ` (${contract})` : '';
  const owedText = owedSince ? ` (due since ${owedSince})` : '';
  const noteText = note ? ` Note: ${note}.` : '';
  return `Assalamu Alaikum, this is a reminder for ${student}${contractText}. Tuition fee due: ${currency}${amount}${owedText}.${noteText} Thank you — ${tutor}.`;
}

/**
 * Builds a direct or contact-picker WhatsApp URL with prefilled text.
 */
export function buildWhatsAppUrl(phone: string | undefined, message: string): string {
  const norm = normalizeWhatsAppPhone(phone);
  if (norm) {
    return `https://wa.me/${norm}?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

