export type Lang = 'en' | 'bn';

export interface SlideContent {
  title: string;
  desc: string;
  tip: string;
}

export interface Slide {
  icon: string;
  en: SlideContent;
  bn: SlideContent;
}

export interface SectionGuide {
  slides: Slide[];
}

export type SectionGuideKey = 'home' | 'students' | 'studentDetail' | 'classes' | 'money' | 'ai' | 'settings';

export const sectionGuides: Record<SectionGuideKey, SectionGuide> = {
  home: {
    slides: [
      {
        icon: '🏠',
        en: {
          title: 'Welcome to your Dashboard',
          desc: 'Your daily command center—see active students, pending cycle fees (৳), and quick shortcuts at a glance.',
          tip: 'Click any quick action card to jump straight to logging classes or payments.'
        },
        bn: {
          title: 'আপনার ড্যাশবোর্ডে স্বাগতম',
          desc: 'আপনার প্রতিদিনের কমান্ড সেন্টার—সক্রিয় ছাত্র, বকেয়া সাইকেল ফি (৳), এবং কুইক শর্টকাট এক নজরে দেখুন।',
          tip: 'ক্লাস বা পেমেন্ট এন্ট্রি করতে যেকোনো কুইক অ্যাকশন কার্ডে ক্লিক করুন।'
        }
      },
      {
        icon: '📋',
        en: {
          title: 'Getting Started',
          desc: 'Use the 4-step Onboarding Checklist to set up your workspace easily.',
          tip: 'Follow the checklist until all items are marked done!'
        },
        bn: {
          title: 'শুরু করা যাক',
          desc: 'আপনার ওয়ার্কস্পেস সেট আপ করতে ৪-ধাপের অনবোর্ডিং চেকলিস্ট ব্যবহার করুন।',
          tip: 'সবগুলো কাজ সম্পন্ন না হওয়া পর্যন্ত চেকলিস্টটি অনুসরণ করুন!'
        }
      },
      {
        icon: '☁️',
        en: {
          title: 'Cloud Sync',
          desc: 'Tuitrix automatically syncs your data securely.',
          tip: 'Check your cloud sync status (☁️ Synced) in the top bar to ensure your records are backed up across devices.'
        },
        bn: {
          title: 'ক্লাউড সিঙ্ক',
          desc: 'Tuitrix স্বয়ংক্রিয়ভাবে আপনার ডেটা নিরাপদে সিঙ্ক করে।',
          tip: 'অন্যান্য ডিভাইসে ডেটা ব্যাকআপ হচ্ছে কিনা তা নিশ্চিত করতে টপ বারে আপনার ক্লাউড সিঙ্ক স্ট্যাটাস (☁️ Synced) চেক করুন।'
        }
      }
    ]
  },
  students: {
    slides: [
      {
        icon: '👥',
        en: {
          title: 'Students & Batches',
          desc: 'Manage 1-on-1 home tuition students and group coaching batches in one place.',
          tip: 'Keep all your student contacts and schedules organized here.'
        },
        bn: {
          title: 'ছাত্র এবং ব্যাচসমূহ',
          desc: '১-টু-১ হোম টিউশন ছাত্র এবং গ্রুপ কোচিং ব্যাচ এক জায়গায় ম্যানেজ করুন।',
          tip: 'আপনার সব ছাত্রের কন্টাক্ট এবং রুটিন এখানে গুছিয়ে রাখুন।'
        }
      },
      {
        icon: '➕',
        en: {
          title: 'Adding Students',
          desc: 'Click "+ Add Student" for individual contracts (12 classes or monthly), "+ New Batch" for group tuition, or "⚡ Bulk Add" to paste an entire batch list at once.',
          tip: 'Use Bulk Add for faster data entry!'
        },
        bn: {
          title: 'ছাত্র যুক্ত করা',
          desc: 'স্বতন্ত্র কন্ট্রাক্ট (১২ ক্লাস বা মাসিক) এর জন্য "+ Add Student", গ্রুপ টিউশনের জন্য "+ New Batch" বা একসাথে পুরো ব্যাচের লিস্ট পেস্ট করতে "⚡ Bulk Add" এ ক্লিক করুন।',
          tip: 'দ্রুত ডেটা এন্ট্রির জন্য Bulk Add ব্যবহার করুন!'
        }
      },
      {
        icon: '💬',
        en: {
          title: 'Communication',
          desc: 'Click any student to view their profile, log exam scores, send bilingual WhatsApp updates, or open their verified Parent Portal report.',
          tip: 'Keep parents in the loop easily with a single tap.'
        },
        bn: {
          title: 'যোগাযোগ',
          desc: 'যেকোনো ছাত্রের প্রোফাইল দেখতে, পরীক্ষার নম্বর এন্ট্রি করতে, দ্বিভাষিক হোয়াটসঅ্যাপ আপডেট পাঠাতে বা তাদের ভেরিফাইড প্যারেন্ট পোর্টাল রিপোর্ট খুলতে ক্লিক করুন।',
          tip: 'এক ক্লিকেই অভিভাবকদের আপডেট জানিয়ে দিন।'
        }
      }
    ]
  },
  studentDetail: {
    slides: [
      {
        icon: '👤',
        en: {
          title: 'Student Profile',
          desc: 'Deep-dive into a single student\'s attendance cycle, payment history, and academic exam progress.',
          tip: 'Track all individual details comprehensively.'
        },
        bn: {
          title: 'ছাত্রের প্রোফাইল',
          desc: 'একজন ছাত্রের উপস্থিতি চক্র, পেমেন্ট হিস্ট্রি এবং একাডেমিক পরীক্ষার অগ্রগতি বিস্তারিত দেখুন।',
          tip: 'সব ব্যক্তিগত তথ্য এক জায়গায় ট্র্যাক করুন।'
        }
      },
      {
        icon: '📈',
        en: {
          title: 'Exams & Updates',
          desc: 'Log quiz/model test marks in the Exam Scores section to plot their SVG performance chart, and send 1-tap EN | বাংলা WhatsApp summaries to their guardian.',
          tip: 'Visual charts help analyze student progress quickly.'
        },
        bn: {
          title: 'পরীক্ষা এবং আপডেট',
          desc: 'পরীক্ষার স্কোর সেকশনে কুইজ/মডেল টেস্টের নম্বর এন্ট্রি করে SVG পারফরম্যান্স চার্ট দেখুন, এবং এক ক্লিকেই অভিভাবককে EN | বাংলা হোয়াটসঅ্যাপ সামারি পাঠান।',
          tip: 'চার্ট এর সাহায্যে ছাত্রের উন্নতি দ্রুত বিশ্লেষণ করা যায়।'
        }
      },
      {
        icon: '🧾',
        en: {
          title: 'Receipts & Portal',
          desc: 'Click "🧾 Receipt" on any payment to share a verified paid receipt, or open the Parent Portal for a printable summary.',
          tip: 'Share professional receipts directly to WhatsApp.'
        },
        bn: {
          title: 'রশিদ এবং পোর্টাল',
          desc: 'ভেরিফাইড পেইড রসিদ শেয়ার করতে যেকোনো পেমেন্টের "🧾 Receipt" এ ক্লিক করুন, অথবা প্রিন্ট করার জন্য প্যারেন্ট পোর্টাল খুলুন।',
          tip: 'প্রফেশনাল রশিদ সরাসরি হোয়াটসঅ্যাপে শেয়ার করুন।'
        }
      }
    ]
  },
  classes: {
    slides: [
      {
        icon: '📅',
        en: {
          title: 'Classes Completed',
          desc: 'Track every class taught, auto-increment cycle counters (e.g., 11/12 classes), and view your weekly teaching timetable.',
          tip: 'Keep your class cycles perfectly synced.'
        },
        bn: {
          title: 'সম্পন্ন ক্লাস',
          desc: 'নেওয়া প্রতিটি ক্লাস ট্র্যাক করুন, স্বয়ংক্রিয়ভাবে সাইকেল কাউন্টার (যেমন, ১১/১২ ক্লাস) বৃদ্ধি করুন এবং আপনার সাপ্তাহিক রুটিন দেখুন।',
          tip: 'আপনার ক্লাস সাইকেলগুলো সঠিকভাবে সিঙ্ক করুন।'
        }
      },
      {
        icon: '✅',
        en: {
          title: 'Logging Classes',
          desc: 'Log a single student\'s lesson or use Batch Progress to mark an entire batch in 1 tap (auto-fanning out lessons to each student).',
          tip: 'Batch logging saves huge amounts of time.'
        },
        bn: {
          title: 'ক্লাস এন্ট্রি করা',
          desc: 'একজন ছাত্রের ক্লাস এন্ট্রি করুন বা ব্যাচ প্রগ্রেস ব্যবহার করে এক ক্লিকেই পুরো ব্যাচের আপডেট নিশ্চিত করুন।',
          tip: 'ব্যাচ এন্ট্রি অনেক সময় বাঁচায়।'
        }
      },
      {
        icon: '🗓️',
        en: {
          title: 'Weekly Routine',
          desc: 'Switch to the "📅 Weekly Routine" tab (Sat–Fri) to see which students/batches you teach today and log classes directly from the schedule card.',
          tip: 'Your schedule at your fingertips.'
        },
        bn: {
          title: 'সাপ্তাহিক রুটিন',
          desc: '"📅 Weekly Routine" ট্যাবে (শনি–শুক্র) গিয়ে দেখুন আজ কোন ছাত্র/ব্যাচকে পড়াবেন এবং রুটিন কার্ড থেকেই সরাসরি ক্লাস এন্ট্রি করুন।',
          tip: 'আপনার সময়সূচী আপনার হাতের মুঠোয়।'
        }
      }
    ]
  },
  money: {
    slides: [
      {
        icon: '💰',
        en: {
          title: 'Financial Dashboard',
          desc: 'Track collected tuition fees in Bangladeshi Taka (৳), pending cycle dues, and 6-month income trends.',
          tip: 'Stay on top of your earnings effortlessly.'
        },
        bn: {
          title: 'ফাইন্যান্সিয়াল ড্যাশবোর্ড',
          desc: 'গৃহীত টিউশন ফি (৳), বকেয়া সাইকেল পাওনা এবং ৬-মাসের আয়ের ধারা ট্র্যাক করুন।',
          tip: 'আপনার আয়ের হিসাব সহজেই হাতের মুঠোয় রাখুন।'
        }
      },
      {
        icon: '💳',
        en: {
          title: 'Recording Payments',
          desc: 'Record a payment whenever a cycle completes, and click "🧾 Receipt" on any payment to print an official paid slip or send a verified receipt on WhatsApp.',
          tip: 'Verified receipts build trust with parents.'
        },
        bn: {
          title: 'পেমেন্ট এন্ট্রি করা',
          desc: 'একটি সাইকেল শেষ হলে পেমেন্ট এন্ট্রি করুন এবং রসিদ প্রিন্ট করতে বা হোয়াটসঅ্যাপে পাঠাতে "🧾 Receipt" এ ক্লিক করুন।',
          tip: 'ভেরিফাইড রসিদ অভিভাবকদের আস্থা বাড়ায়।'
        }
      },
      {
        icon: '📊',
        en: {
          title: 'Analytics',
          desc: 'Review the 6-Month Revenue Chart and Batch vs. 1-on-1 Income Split to see your monthly earnings growth.',
          tip: 'Use data to plan your teaching business.'
        },
        bn: {
          title: 'অ্যানালিটিক্স',
          desc: '৬-মাসের রেভিনিউ চার্ট এবং ব্যাচ বনাম ১-টু-১ আয়ের বিভাজন দেখে আপনার মাসিক আয়ের বৃদ্ধি পর্যালোচনা করুন।',
          tip: 'আপনার আয়ের পরিকল্পনা করতে ডেটা ব্যবহার করুন।'
        }
      }
    ]
  },
  ai: {
    slides: [
      {
        icon: '🤖',
        en: {
          title: 'AI Assistant',
          desc: 'Generate print-ready MCQs, creative questions (CQ), model tests, and lecture notes in seconds.',
          tip: 'AI saves hours of manual typing and formatting.'
        },
        bn: {
          title: 'এআই অ্যাসিস্ট্যান্ট',
          desc: 'সেকেন্ডের মধ্যে প্রিন্ট-উপযোগী MCQ, সৃজনশীল প্রশ্ন (CQ), মডেল টেস্ট এবং লেকচার নোট তৈরি করুন।',
          tip: 'এআই ঘণ্টার পর ঘণ্টা টাইপিং ও ফরম্যাটিং এর সময় বাঁচায়।'
        }
      },
      {
        icon: '⚙️',
        en: {
          title: 'Generating Content',
          desc: 'Select Class Level, Subject, and Topic, then click Generate. Free users can watch 1 short ad per AI request (up to 5/day), while Pro users enjoy unlimited ad-free generation.',
          tip: 'Be specific with topics for the best results.'
        },
        bn: {
          title: 'কন্টেন্ট তৈরি করা',
          desc: 'ক্লাস, বিষয় এবং টপিক নির্বাচন করে Generate এ ক্লিক করুন। ফ্রি ব্যবহারকারীরা বিজ্ঞাপনের মাধ্যমে দিনে ৫ বার এবং প্রো ব্যবহারকারীরা আনলিমিটেড এআই ব্যবহার করতে পারবেন।',
          tip: 'সেরা ফলাফলের জন্য টপিক নির্দিষ্ট করে দিন।'
        }
      },
      {
        icon: '🖨️',
        en: {
          title: 'Save & Print',
          desc: 'Click "💾 Save to Library" to reuse sheets anytime, and click Print PDF to print with your custom Tutor Header & Watermark.',
          tip: 'Branded sheets look professional!'
        },
        bn: {
          title: 'সেভ এবং প্রিন্ট',
          desc: 'যেকোনো সময় শিট পুনরায় ব্যবহার করতে "💾 Save to Library" তে ক্লিক করুন, এবং আপনার কাস্টম টিউটর হেডার ও ওয়াটারমার্ক সহ প্রিন্ট করতে Print PDF এ ক্লিক করুন।',
          tip: 'ব্র্যান্ডেড শিটগুলো দেখতে অত্যন্ত প্রফেশনাল লাগে!'
        }
      }
    ]
  },
  settings: {
    slides: [
      {
        icon: '⚙️',
        en: {
          title: 'Settings & Profile',
          desc: 'Customize your printable PDF branding, manage cloud backups, configure push notifications, and upgrade to Tuitrix Pro.',
          tip: 'Personalize Tuitrix exactly how you need it.'
        },
        bn: {
          title: 'সেটিংস এবং প্রোফাইল',
          desc: 'আপনার পিডিএফ ব্র্যান্ডিং কাস্টমাইজ করুন, ক্লাউড ব্যাকআপ ম্যানেজ করুন, পুশ নোটিফিকেশন কনফিগার করুন এবং Tuitrix প্রো-তে আপগ্রেড করুন।',
          tip: 'Tuitrix কে আপনার প্রয়োজনমতো সাজিয়ে নিন।'
        }
      },
      {
        icon: '🏷️',
        en: {
          title: 'Branding & Upgrades',
          desc: 'Set your Brand Title & Credentials for exam sheets, copy your Referral Code to give friends 10% OFF, or submit a bKash / Nagad / Rocket TrxID for instant Pro activation.',
          tip: 'Share your referral code to get rewards.'
        },
        bn: {
          title: 'ব্র্যান্ডিং এবং আপগ্রেড',
          desc: 'পরীক্ষার শিটের জন্য আপনার ব্র্যান্ড টাইটেল ও ক্রেডেনশিয়াল সেট করুন, রেফারেল কোড শেয়ার করে বন্ধুদের ১০% ছাড় দিন, অথবা বিকাশ/ন নগদ/রকেট TrxID সাবমিট করে প্রো অ্যাক্টিভেট করুন।',
          tip: 'পুরস্কার পেতে আপনার রেফারেল কোড শেয়ার করুন।'
        }
      },
      {
        icon: '📱',
        en: {
          title: 'App Installation',
          desc: 'Switch between 🌙 Dark and ☀️ Light modes anytime, or open the Android APK / QR Code modal to install Tuitrix on your phone.',
          tip: 'Install the app for a native experience.'
        },
        bn: {
          title: 'অ্যাপ ইন্সটলেশন',
          desc: 'যেকোনো সময় 🌙 ডার্ক এবং ☀️ লাইট মোড পরিবর্তন করুন, অথবা আপনার ফোনে Tuitrix ইন্সটল করতে Android APK / QR Code মোডাল খুলুন।',
          tip: 'নেটিভ অভিজ্ঞতার জন্য অ্যাপটি ইন্সটল করুন।'
        }
      }
    ]
  }
};

export function getNextSlideIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  return current + 1 < total ? current + 1 : current;
}

export function getPrevSlideIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  return current - 1 >= 0 ? current - 1 : current;
}
