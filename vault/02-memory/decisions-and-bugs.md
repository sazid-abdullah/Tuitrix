---
title: Decisions and Bug Post-Mortems
created: 2026-11-02
tags: [bugs, post-mortem, decisions, lessons-learned]
---

# 🛡️ Architectural Decisions & Bug Post-Mortems

## 1. BUG: `#/settings` Blank Screen Crash on Missing `created_at`

### Context & Symptom
When navigating to `#/settings`, the application crashed into a blank dark screen with an unhandled exception:
`RangeError: Invalid time value` at `Date.toISOString()`.

### Root Cause
In the Transaction History table (`SettingsView.tsx`), the code invoked:
`fmtDate(new Date(t.created_at).toISOString())`.
However, `reviewUpgradeRequest` in `src/services/firebase.ts` writes approved transaction objects with property `date: now`, not `created_at`.
When `t.created_at` was `undefined`, `new Date(undefined)` produced an `Invalid Date`. Calling `.toISOString()` on an `Invalid Date` throws `RangeError: Invalid time value`, crashing the entire React render tree.

### Resolution
1. **Safe fallback extraction**:
   ```ts
   const rawDate = t.date || t.created_at || t.createdAt;
   const d = rawDate ? new Date(rawDate) : null;
   const safeIso = d && !isNaN(d.getTime()) ? d.toISOString() : todayISO();
   ```
2. **Defensive `fmtDate` in `src/utils/date.ts`**:
   `fmtDate` was updated to accept `any` input, validate date numbers and strings, and catch any invalid time representations, returning an empty string `""` instead of throwing.
3. **Top-Level Error Boundary in `src/App.tsx`**:
   Wrapped `<main id="view">` in a React Error Boundary so any future uncaught rendering error displays a recovery card with `[🔄 Reload View]` and `[🏠 Go Home]` rather than a blank black screen.

---

## 2. BUG: Brave Shields / Ad-Blocker Blocking Auth & Firestore Initialization

### Context & Symptom
In privacy browsers such as Brave or with strict ad-blockers enabled, network requests to Google Analytics (`G-GE6KV3TFCN`) are blocked with HTTP 403 or network failure.

### Root Cause
`src/services/firebase.ts` initialized `initializeApp`, `getAnalytics`, `getFirestore`, and `getAuth` in a single combined `try/catch` block.
When `getAnalytics(app)` threw due to restricted IndexedDB or blocked tracker URLs, execution jumped to the `catch` block, leaving `db` (Firestore) and `auth` completely uninitialized (`undefined`).

### Resolution
Separated core Firebase initialization (`initializeApp`, `getFirestore`, `getAuth`, `GoogleAuthProvider`) into their own primary try/catch block. Placed `analytics = getAnalytics(app)` into an isolated secondary try/catch block. If analytics fails or is blocked by an ad-blocker, core database and authentication services remain 100% operational.

---

## 3. DECISION: Multi-Account Switching & Reactive Owner Detection

### Problem
When a user switched accounts (e.g. from an Owner account to a free test account, or vice-versa), `isOwner` in `SettingsView` was computed only once at mount time (`auth?.currentUser?.email ? isOwnerEmail(...) : false`).
Furthermore, `billingState` from the prior account was cached in store memory and not immediately reset before loading the new user's document, causing Pro permissions to bleed across user accounts.

### Resolution
1. In `src/store/context.tsx`, inside `onAuthStateChanged`, `setBillingState(null)` and `unsubscribeBilling()` are called immediately on user transition.
2. In `src/views/SettingsView.tsx`, `isOwner` is computed reactively using both `useStore().user` and a live `onAuthStateChanged` subscriber.
3. In `src/utils/auth.ts`, `isOwnerEmail` enforces `.trim().toLowerCase() === 'abdullahsazid109@gmail.com'`.

---

## 4. DECISION: Non-Blocking Onboarding Gating

### Problem
Previously, `requiresOnboarding` checked `!state.profile || !state.profile.brandTitle` and returned an early JSX tree with an empty `<main id="view"></main>` and `<OnboardingModal isOpen={true} />`. This caused `#/settings`, `#/owner`, and `#/help` to appear as an empty black box for any test account without a `brandTitle`.

### Resolution
Removed the early-return block from `src/App.tsx`. The views are always mounted inside `<main id="view">`, and `<OnboardingModal>` is displayed conditionally:
`isOpen={requiresOnboarding && !['settings', 'owner', 'help', 'landing'].includes(route)}`.
This allows users and automated test suites to visit `#/settings` or other configuration routes without being locked behind a blank screen.
