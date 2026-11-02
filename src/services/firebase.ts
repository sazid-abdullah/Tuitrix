import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, Auth } from 'firebase/auth';
import { getAnalytics, Analytics } from "firebase/analytics";
import { initializeFirestore, getFirestore, Firestore, doc, setDoc, updateDoc, collection, getDocs, getDoc, query, orderBy, writeBatch, deleteDoc } from "firebase/firestore";
import { deleteUser } from "firebase/auth";
import { TrxUpgradeRequest, PricingConfig, FaqItem, PromoCode, EvaluatedPromoResult, PlatformTelemetry } from '../types';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBjzPRDijl82joMcpYurfd2OIFqnZuMP5Q",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "tuitrix-2cd01.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "tuitrix-2cd01",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "tuitrix-2cd01.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "199428805375",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:199428805375:web:15d48f232bf3859c03b2ca",
  measurementId: "G-GE6KV3TFCN"
};

let app: FirebaseApp | undefined;
let analytics: Analytics | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;
let googleProvider: GoogleAuthProvider | undefined;

try {
  app = initializeApp(firebaseConfig);
  try {
    if (typeof initializeFirestore === 'function') {
      db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    } else {
      db = getFirestore(app);
    }
  } catch {
    db = getFirestore(app);
  }
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
} catch (e) {
  console.warn("Failed to initialize Firebase core services:", e);
}

if (app) {
  try {
    analytics = getAnalytics(app);
  } catch (e) {
    console.warn("Firebase Analytics could not be initialized (e.g. ad-blocker or unsupported environment):", e);
  }
}

export const evaluatePromoCode = (
  promo: PromoCode | null | undefined,
  basePrice: number
): EvaluatedPromoResult => {
  if (!promo || !promo.code) {
    return {
      valid: false,
      error: 'Invalid or missing promo code',
      discountAmount: 0,
      finalPrice: basePrice,
      discountPercent: 0,
      code: '',
    };
  }

  const cleanCode = promo.code.trim().toUpperCase();

  if (!promo.active) {
    return {
      valid: false,
      error: `Promo code "${cleanCode}" is no longer active`,
      discountAmount: 0,
      finalPrice: basePrice,
      discountPercent: 0,
      code: cleanCode,
    };
  }

  // Check max usage cap
  if (promo.maxUses !== undefined && promo.maxUses > 0 && (promo.usedCount || 0) >= promo.maxUses) {
    return {
      valid: false,
      error: `Promo code "${cleanCode}" usage limit reached (${promo.maxUses} uses max)`,
      discountAmount: 0,
      finalPrice: basePrice,
      discountPercent: 0,
      code: cleanCode,
    };
  }

  // Check expiry date (YYYY-MM-DD)
  if (promo.expiresAt) {
    const today = new Date().toISOString().split('T')[0];
    if (promo.expiresAt < today) {
      return {
        valid: false,
        error: `Promo code "${cleanCode}" expired on ${promo.expiresAt}`,
        discountAmount: 0,
        finalPrice: basePrice,
        discountPercent: 0,
        code: cleanCode,
      };
    }
  }

  const discountType = promo.discountType || 'percent';
  const val = promo.discountValue !== undefined ? promo.discountValue : promo.discountPercent;
  let discountAmount = 0;

  if (discountType === 'flat') {
    discountAmount = Math.max(0, Math.round(val));
  } else {
    const pct = Math.min(100, Math.max(0, val));
    discountAmount = Math.round(basePrice * (pct / 100));
  }

  discountAmount = Math.min(basePrice, discountAmount);
  const finalPrice = Math.max(0, basePrice - discountAmount);
  const computedPercent = basePrice > 0 ? Math.round((discountAmount / basePrice) * 100) : 0;

  return {
    valid: true,
    discountAmount,
    finalPrice,
    discountPercent: computedPercent,
    code: cleanCode,
  };
};

export const submitTrxUpgradeRequest = async (uid: string, email: string, name: string | undefined, payload: { method: 'bkash' | 'nagad' | 'rocket'; senderPhone: string; trxId: string; amount: number; planTerm?: 'monthly' | 'yearly'; billingCycle?: 'monthly' | 'yearly'; promoCodeUsed?: string; discountAmountBdt?: number; finalAmountBdt: number }) => {
  const reqId = `req_${Date.now()}`;
  const now = new Date().toISOString();

  const request: TrxUpgradeRequest = {
    id: reqId,
    uid,
    userEmail: email,
    userName: name,
    method: payload.method,
    senderPhone: payload.senderPhone,
    trxId: payload.trxId,
    amount: payload.amount,
    billingCycle: payload.billingCycle || payload.planTerm,
    planTerm: payload.planTerm,
    promoCodeUsed: payload.promoCodeUsed,
    discountAmountBdt: payload.discountAmountBdt,
    finalAmountBdt: payload.finalAmountBdt,
    status: 'pending',
    createdAt: now,
  };

  const pendingInfo = {
    method: payload.method,
    trxId: payload.trxId,
    senderPhone: payload.senderPhone,
    createdAt: now,
    amount: payload.amount,
    planTerm: payload.planTerm,
    billingCycle: payload.billingCycle || payload.planTerm,
    promoCodeUsed: payload.promoCodeUsed,
    discountAmountBdt: payload.discountAmountBdt,
    finalAmountBdt: payload.finalAmountBdt,
    status: 'pending' as const,
  };

  // Increment usedCount for the applied promo code in localStorage and Firestore
  if (payload.promoCodeUsed) {
    const codeToIncrement = payload.promoCodeUsed.trim().toUpperCase();
    const localPricingStr = localStorage.getItem('tuitrix_pricing');
    if (localPricingStr) {
      try {
        const localPricing: PricingConfig = JSON.parse(localPricingStr);
        let changed = false;
        localPricing.promoCodes = (localPricing.promoCodes || []).map(p => {
          if (p.code.toUpperCase() === codeToIncrement) {
            changed = true;
            return { ...p, usedCount: (p.usedCount || 0) + 1 };
          }
          return p;
        });
        if (changed) {
          localStorage.setItem('tuitrix_pricing', JSON.stringify(localPricing));
        }
      } catch {}
    }

    if (db) {
      try {
        const pricingRef = doc(db, 'app_config', 'pricing');
        const pricingSnap = await getDoc(pricingRef);
        if (pricingSnap.exists()) {
          const pricingData = pricingSnap.data() as PricingConfig;
          let changed = false;
          const updatedPromos = (pricingData.promoCodes || []).map(p => {
            if (p.code.toUpperCase() === codeToIncrement) {
              changed = true;
              return { ...p, usedCount: (p.usedCount || 0) + 1 };
            }
            return p;
          });
          if (changed) {
            await updateDoc(pricingRef, { promoCodes: updatedPromos, updatedAt: Date.now() });
          }
        }
      } catch (e) {
        console.warn("Could not increment promo usedCount in Firestore:", e);
      }
    }
  }

  if (!db) {
    // Local fallback for offline/demo mode
    localStorage.setItem(`upgrade_req_${uid}`, JSON.stringify(request));
    localStorage.setItem(`pending_req_${uid}`, JSON.stringify(pendingInfo));
    return request;
  }

  // Clean undefined values before saving to Firestore
  const cleanRequest = Object.fromEntries(Object.entries(request).filter(([_, v]) => v !== undefined));

  // Save to upgrade_requests collection
  await setDoc(doc(db, 'upgrade_requests', reqId), cleanRequest);

  // Update billing state with pending request
  const billingRef = doc(db, `users/${uid}/data/billing`);
  const billingDoc = await getDoc(billingRef);

  if (billingDoc.exists()) {
    await updateDoc(billingRef, { pendingRequest: pendingInfo, updatedAt: Date.now() });
  } else {
    await setDoc(billingRef, { pendingRequest: pendingInfo, updatedAt: Date.now() }, { merge: true });
  }

  return request;
};

export const fetchPendingUpgradeRequests = async (): Promise<TrxUpgradeRequest[]> => {
  if (!db) {
    // Local fallback
    const reqs: TrxUpgradeRequest[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('upgrade_req_')) {
        reqs.push(JSON.parse(localStorage.getItem(key)!));
      }
    }
    return reqs.filter(r => r.status === 'pending');
  }

  if (!auth?.currentUser) return [];

  const currentEmail = auth.currentUser.email?.trim().toLowerCase();
  if (currentEmail !== 'abdullahsazid109@gmail.com') {
    return [];
  }

  const q = query(collection(db, 'upgrade_requests'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(doc => doc.data() as TrxUpgradeRequest)
    .filter(req => req.status === 'pending');
};

export const fetchAllUpgradeRequests = async (): Promise<TrxUpgradeRequest[]> => {
  if (!db) {
    const reqs: TrxUpgradeRequest[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('upgrade_req_')) {
        reqs.push(JSON.parse(localStorage.getItem(key)!));
      }
    }
    return reqs;
  }

  if (!auth?.currentUser) return [];

  const currentEmail = auth.currentUser.email?.trim().toLowerCase();
  if (currentEmail !== 'abdullahsazid109@gmail.com') {
    return [];
  }

  const q = query(collection(db, 'upgrade_requests'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as TrxUpgradeRequest);
};

export const fetchPlatformTelemetry = async (pricingConfig?: PricingConfig): Promise<PlatformTelemetry> => {
  const allRequests = await fetchAllUpgradeRequests();
  const pricing = pricingConfig || await fetchPricingConfig();

  const pendingCount = allRequests.filter(r => r.status === 'pending').length;
  const approvedCount = allRequests.filter(r => r.status === 'approved').length;
  const rejectedCount = allRequests.filter(r => r.status === 'rejected').length;

  const totalRevenueBdt = allRequests
    .filter(r => r.status === 'approved')
    .reduce((sum, r) => sum + (r.finalAmountBdt !== undefined ? r.finalAmountBdt : r.amount), 0);

  // Per-promo usage stats
  const promoUsageMap: Record<string, { count: number; totalDiscountBdt: number; revenueGeneratedBdt: number }> = {};

  (pricing.promoCodes || []).forEach(p => {
    promoUsageMap[p.code.toUpperCase()] = {
      count: p.usedCount || 0,
      totalDiscountBdt: 0,
      revenueGeneratedBdt: 0,
    };
  });

  let totalPromoRedemptions = 0;
  allRequests.forEach(req => {
    if (req.promoCodeUsed) {
      const code = req.promoCodeUsed.trim().toUpperCase();
      totalPromoRedemptions++;
      if (!promoUsageMap[code]) {
        promoUsageMap[code] = { count: 0, totalDiscountBdt: 0, revenueGeneratedBdt: 0 };
      }
      const configPromo = (pricing.promoCodes || []).find(p => p.code.toUpperCase() === code);
      promoUsageMap[code].count = Math.max(promoUsageMap[code].count, configPromo?.usedCount || 0);
      const discount = req.discountAmountBdt !== undefined ? req.discountAmountBdt : Math.max(0, req.amount - (req.finalAmountBdt || req.amount));
      promoUsageMap[code].totalDiscountBdt += discount;
      promoUsageMap[code].revenueGeneratedBdt += (req.finalAmountBdt !== undefined ? req.finalAmountBdt : req.amount);
    }
  });

  const uniqueUsers = new Set<string>();
  const proUserIds = new Set<string>();
  const registeredTutors: PlatformTelemetry['registeredTutors'] = [];

  allRequests.forEach(req => {
    uniqueUsers.add(req.uid);
    if (req.status === 'approved') {
      proUserIds.add(req.uid);
    }
  });

  if (db && auth?.currentUser?.email?.trim().toLowerCase() === 'abdullahsazid109@gmail.com') {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      usersSnap.docs.forEach(docSnap => {
        const uid = docSnap.id;
        uniqueUsers.add(uid);
        const data = docSnap.data();
        registeredTutors.push({
          uid,
          email: data?.email || 'Tutor',
          tutorName: data?.name || data?.tutorName || 'Tutor',
          plan: proUserIds.has(uid) ? 'pro' : 'free',
          studentCount: data?.studentCount || 0,
          updatedAt: data?.updatedAt || Date.now(),
        });
      });
    } catch {}
  }

  const totalUsers = Math.max(uniqueUsers.size, registeredTutors.length, 1);
  const proUsers = proUserIds.size;
  const freeUsers = Math.max(0, totalUsers - proUsers);

  return {
    totalUsers,
    proUsers,
    freeUsers,
    pendingCount,
    approvedCount,
    rejectedCount,
    totalRevenueBdt,
    totalPromoRedemptions,
    promoUsageMap,
    allRequests,
    registeredTutors,
  };
};

export const reviewUpgradeRequest = async (requestId: string, targetUid: string, action: 'approved' | 'rejected', planTerm?: 'monthly' | 'yearly', amount: number = 99) => {
  const now = new Date().toISOString();

  if (!db) {
    // Local fallback
    const reqKey = `upgrade_req_${targetUid}`;
    const reqData = localStorage.getItem(reqKey);
    if (reqData) {
      const req = JSON.parse(reqData);
      req.status = action;
      req.reviewedAt = now;
      localStorage.setItem(reqKey, JSON.stringify(req));
    }
    const pendingData = localStorage.getItem(`pending_req_${targetUid}`);
    if (pendingData) {
      const pending = JSON.parse(pendingData);
      pending.status = action;
      localStorage.setItem(`pending_req_${targetUid}`, JSON.stringify(pending));
    }
    return;
  }

  const batch = writeBatch(db);
  const reqRef = doc(db, 'upgrade_requests', requestId);
  const billingRef = doc(db, `users/${targetUid}/data/billing`);

  // Update request status
  batch.update(reqRef, {
    status: action,
    reviewedAt: now,
  });

  // Update user's billing state
  const billingDoc = await getDoc(billingRef);
  const currentData = billingDoc.exists() ? billingDoc.data() : {};
  const updateData: any = {
    updatedAt: Date.now(),
  };

  if (currentData.pendingRequest) {
    updateData.pendingRequest = {
      ...currentData.pendingRequest,
      status: action,
    };
  }

  if (action === 'approved') {
    updateData.plan = 'pro';
    updateData.credits = 999999;
    const currentProUntil = currentData.proUntil && currentData.proUntil > Date.now() ? currentData.proUntil : Date.now();
    updateData.proUntil = currentProUntil + (planTerm === 'yearly' ? 365 : 30) * 86400e3;
    updateData.transactions = [
      ...(currentData.transactions || []),
      { id: requestId, amount, date: now, type: 'subscription', planTerm }
    ];
  }

  batch.set(billingRef, updateData, { merge: true });
  await batch.commit();
};


export const DEFAULT_FAQS: FaqItem[] = [
  {
    id: 'faq_cycle',
    category: 'getting_started',
    sortOrder: 1,
    qEn: 'How does tuition cycle tracking work (12-class, monthly, or day-based)?',
    aEn: 'Tuitrix automatically counts completed classes toward your configured cycle (e.g., 12 lessons or calendar month). When the cycle limit is reached, Tuitrix alerts you that tuition fee is due and highlights the student on your Today’s Tuition Radar.',
    qBn: 'টিউশন সাইকেল ট্র্যাকিং (১২-ক্লাস, মাসিক বা দিনভিত্তিক) কীভাবে কাজ করে?',
    aBn: 'টুইট্রিক্স স্বয়ংক্রিয়ভাবে আপনার নির্ধারিত সাইকেল অনুযায়ী ক্লাস গণনা করে (যেমন ১২ ক্লাস বা ক্যালেন্ডার মাস)। সাইকেল শেষ হলে বকেয়া ফি পরিশোধের অ্যালার্ট দেয় এবং টুডে’স রাডারে সতর্কবার্তা দেখায়।'
  },
  {
    id: 'faq_batch',
    category: 'getting_started',
    sortOrder: 2,
    qEn: 'How do I create a batch and log attendance for multiple students in 1 tap?',
    aEn: 'Navigate to Classes > Batches, create your batch, and add students. When class finishes, click "Log Batch Class" to record attendance, topic covered, and homework for every student simultaneously.',
    qBn: 'কীভাবে ব্যাচ তৈরি করে ১ ক্লিকে সবার উপস্থিতি ও ক্লাস রেকর্ড করব?',
    aBn: 'ক্লাসেস > ব্যাচেস-এ গিয়ে ব্যাচ তৈরি করে শিক্ষার্থী যোগ করুন। ক্লাস শেষে "Log Batch Class"-এ ট্যাপ করে এক ক্লিকেই সব শিক্ষার্থীর হাজিরা, পড়ার বিষয় ও বাড়ির কাজ সংরক্ষণ করুন।'
  },
  {
    id: 'faq_upgrade_trx',
    category: 'billing',
    sortOrder: 3,
    qEn: 'How do I upgrade to Tuitrix Pro using bKash, Nagad, or Rocket TrxID?',
    aEn: 'In Settings, choose Monthly or Yearly Pro, send the exact amount via "Send Money" to our verified personal account number, enter your Sender Phone and Transaction ID (TrxID), and tap Submit. Verification takes 15–30 minutes.',
    qBn: 'বিকাশ, নগদ বা রকেট ট্রানজেকশন আইডি (TrxID) দিয়ে কীভাবে প্রো-তে আপগ্রেড করব?',
    aBn: 'সেটিংসে গিয়ে মান্থলি বা ইয়ারলি প্ল্যান বেছে নিন। আমাদের বিকাশ/নগদ/রকেট নম্বরে "Send Money" করে প্রেরক নম্বর ও TrxID লিখে সাবমিট করুন। ১৫-৩০ মিনিটের মধ্যে স্বয়ংক্রিয় বা ম্যানুয়াল ভেরিফিকেশন সম্পন্ন হবে।'
  },
  {
    id: 'faq_promo',
    category: 'billing',
    sortOrder: 4,
    qEn: 'How do I apply a Promo Code or Scholarship Code during checkout?',
    aEn: 'Under Settings > Upgrade, enter your promo code (e.g. WELCOME30) into the promo box and click "Apply". The discount is deducted instantly from your payable total before submitting.',
    qBn: 'চেকআউটের সময় প্রোমো বা স্কলারশিপ কোড কীভাবে ব্যবহার করব?',
    aBn: 'সেটিংস > আপগ্রেড সেকশনে প্রোমো বক্সে আপনার কোড (যেমন WELCOME30) লিখে "Apply" ক্লিক করুন। সাথে সাথে মোট বিল থেকে ডিসকাউন্ট বাদ যাবে।'
  },
  {
    id: 'faq_ai_generate',
    category: 'ai_exams',
    sortOrder: 5,
    qEn: 'How do I generate AI Lesson Plans, Exam Papers, and Worksheets or import .docx / PDF papers?',
    aEn: 'Open the AI Studio, select your subject and grade level, then click "Generate Question Paper". You can also import existing Microsoft Word (.docx) or PDF papers using the "Import Paper" button to convert them into interactive tests.',
    qBn: 'কীভাবে এআই দিয়ে লেকচার শিট ও প্রশ্নপত্র তৈরি করব বা .docx / PDF ফাইল ইমপোর্ট করব?',
    aBn: 'এআই স্টুডিওতে বিষয় ও শ্রেণি নির্ধারণ করে "Generate Question Paper" চাপুন। অথবা "Import Paper" বোতাম দিয়ে আপনার তৈরি করা .docx বা PDF ফাইল আপলোড করে সরাসরি অনলাইন পরীক্ষায় রূপান্তর করুন।'
  },
  {
    id: 'faq_ai_grading',
    category: 'ai_exams',
    sortOrder: 6,
    qEn: 'How does automated AI grading and rubric scoring assign marks to student answers?',
    aEn: 'During or after an interactive exam, our AI analyzes student answers against ideal answer keys and marking rubrics, giving partial marks, personalized written feedback, and automatically logging the score to the student’s progress chart.',
    qBn: 'এআই স্বয়ংক্রিয়ভাবে শিক্ষার্থীদের উত্তরের নম্বর ও ফিডব্যাক কীভাবে দেয়?',
    aBn: 'পরীক্ষা শেষে এআই শিক্ষার্থীর প্রতিটি লিখিত ও বহুনির্বাচনী উত্তর আদর্শ উত্তরপত্রের সাথে তুলনা করে সঠিকতা অনুযায়ী মার্কস, বিস্তারিত ফিডব্যাক দেয় এবং স্বয়ংক্রিয়ভাবে শিক্ষার্থীর প্রফাইলে সেভ করে।'
  },
  {
    id: 'faq_cloud_sync',
    category: 'sync',
    sortOrder: 7,
    qEn: 'How do Cloud Sync and Offline JSON Backups keep data safe across phone and PC?',
    aEn: 'Tuitrix works 100% offline using IndexedDB/LocalStorage. When online and signed in, your data seamlessly synchronizes to Google Cloud. You can also download a JSON backup anytime from Settings > Backup.',
    qBn: 'ক্লাউড সিঙ্ক এবং অফলাইন ব্যাকআপ কীভাবে মোবাইল ও পিসিতে ডাটা সুরক্ষিত রাখে?',
    aBn: 'টুইট্রিক্স অফলাইন-ফার্স্ট প্রযুক্তিতে কাজ করে। ইন্টারনেট আসলে ও লগইন থাকলে ক্লাউডে অটোমেটিক ব্যাকআপ হয়। এছাড়া যেকোনো সময় সেটিংস থেকে অফলাইন JSON ব্যাকআপ ফাইল ডাউনলোড করে রাখতে পারেন।'
  },
  {
    id: 'faq_print_brand',
    category: 'account',
    sortOrder: 8,
    qEn: 'How do I customize branded print headers/watermarks for printed PDF sheets and receipts?',
    aEn: 'In Settings > Tutor Profile, customize your Tutor Name, Academy Title, and Credentials, then enable "Show Print Header" and "Show Watermark". Every payment receipt and question paper printed or exported will feature your personal brand.',
    qBn: 'প্রিন্ট করা শিট ও রসিদে নিজের ব্র্যান্ড হেডার ও ওয়াটারমার্ক কীভাবে যুক্ত করব?',
    aBn: 'সেটিংস > টিউটর প্রোফাইল থেকে আপনার নাম, প্রতিষ্ঠানের নাম ও শিক্ষাগত যোগ্যতা লিখুন এবং "Show Print Header" ও "Show Watermark" চালু করুন। প্রতিটি প্রশ্নপত্র ও রসিদে আপনার নিজস্ব ব্র্যান্ডিং দৃশ্যমান হবে।'
  }
];

export const DEFAULT_PRICING: PricingConfig = {
  monthlyPriceBdt: 99,
  yearlyPriceBdt: 999,
  freeStudentLimit: 5,
  promoCodes: [
    { code: 'WELCOME30', discountPercent: 30, discountType: 'percent', discountValue: 30, active: true, description: 'Welcome 30% off' },
    { code: 'TUITRIX50', discountPercent: 50, discountType: 'percent', discountValue: 50, active: true, description: 'Tuitrix 50% off' }
  ],
  bkashNumber: '017XXXXXXX',
  nagadNumber: '017XXXXXXX',
  rocketNumber: '017XXXXXXX',
  supportWhatsapp: '017XXXXXXX',
  supportEmail: 'abdullahsazid109@gmail.com',
  promoText: '',
  faqs: DEFAULT_FAQS,
  updatedAt: Date.now()
};

export const fetchPricingConfig = async (): Promise<PricingConfig> => {
  if (!db) {
    const local = localStorage.getItem('tuitrix_pricing');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        return {
          ...DEFAULT_PRICING,
          ...parsed,
          faqs: (parsed.faqs && parsed.faqs.length > 0) ? parsed.faqs : DEFAULT_FAQS
        };
      } catch {}
    }
    return DEFAULT_PRICING;
  }
  try {
    const docRef = doc(db, 'app_config', 'pricing');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as PricingConfig;
      return {
        ...DEFAULT_PRICING,
        ...data,
        faqs: (data.faqs && data.faqs.length > 0) ? data.faqs : DEFAULT_FAQS
      };
    }
  } catch (e) {
    console.error("Failed to fetch pricing config", e);
  }
  return DEFAULT_PRICING;
};

export const updatePricingConfig = async (config: PricingConfig): Promise<void> => {
  const data = { ...config, updatedAt: Date.now() };
  if (!db) {
    localStorage.setItem('tuitrix_pricing', JSON.stringify(data));
    return;
  }
  await setDoc(doc(db, 'app_config', 'pricing'), data);
};

export const resetUserPassword = async (email: string): Promise<void> => {
  if (!auth) {
    console.warn("Offline mode: Firebase Auth is not initialized. Mocking password reset.");
    return Promise.resolve();
  }
  return sendPasswordResetEmail(auth, email.trim());
};

export const deleteTutorAccountAndData = async (uid: string): Promise<void> => {
  if (!db || !auth?.currentUser) return;

  // Attempt to delete cloud data, ignoring failures if documents don't exist
  const paths = [
    `tutors/${uid}/data/appState`,
    `tutors/${uid}`,
    `users/${uid}/data/appState`,
  ];

  for (const path of paths) {
    try {
      await deleteDoc(doc(db, path));
    } catch (e) {
      console.warn(`Failed to delete ${path}:`, e);
    }
  }

  // Delete the Firebase Auth user account
  try {
    await deleteUser(auth.currentUser);
  } catch (e: any) {
    if (e.code === 'auth/requires-recent-login') {
      throw new Error('auth/requires-recent-login');
    }
    throw e;
  }
};

export { app, auth, db, analytics, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail };
