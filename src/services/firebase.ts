import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, Auth } from 'firebase/auth';
import { getAnalytics, Analytics } from "firebase/analytics";
import { getFirestore, Firestore, doc, setDoc, updateDoc, collection, getDocs, getDoc, query, orderBy, writeBatch, deleteDoc } from "firebase/firestore";
import { deleteUser } from "firebase/auth";
import { TrxUpgradeRequest, PricingConfig } from '../types';

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
  analytics = getAnalytics(app);
  db = getFirestore(app);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
} catch (e) {
  console.warn("Failed to initialize Firebase:", e);
}

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

  if (auth.currentUser.email !== 'abdullahsazid109@gmail.com') {
    return [];
  }

  const q = query(collection(db, 'upgrade_requests'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(doc => doc.data() as TrxUpgradeRequest)
    .filter(req => req.status === 'pending');
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


const DEFAULT_PRICING: PricingConfig = {
  monthlyPriceBdt: 99,
  yearlyPriceBdt: 999,
  promoCodes: [
    { code: 'WELCOME30', discountPercent: 30, active: true, description: 'Welcome 30% off' },
    { code: 'TUITRIX50', discountPercent: 50, active: true, description: 'Tuitrix 50% off' }
  ],
  bkashNumber: '017XXXXXXX',
  nagadNumber: '017XXXXXXX',
  rocketNumber: '017XXXXXXX',
  promoText: '',
  updatedAt: Date.now()
};

export const fetchPricingConfig = async (): Promise<PricingConfig> => {
  if (!db) {
    const local = localStorage.getItem('tuitrix_pricing');
    return local ? JSON.parse(local) : DEFAULT_PRICING;
  }
  try {
    const docRef = doc(db, 'app_config', 'pricing');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as PricingConfig;
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
