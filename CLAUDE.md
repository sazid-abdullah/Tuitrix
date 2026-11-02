# Tuitrix — Standing Engineering Constitution (Claude Code / Anthropic Guidelines)

This repository (`C:\Users\ASUS\Tuitrix`) is an offline-first tuition management platform and AI exam suite for Bangladeshi tutors and coaching centers.

---

## 1. Non-Negotiable Invariants & Rules

1. **Strictly NO Tailwind CSS**:
   - Tailwind CSS is **NOT** installed. Do NOT output Tailwind utility classes or create `src/index.css`.
   - Put all CSS rules into `./css/style.css` using Tuitrix CSS variables:
     `--bg`, `--surface`, `--card`, `--card2`, `--text`, `--muted`, `--border`, `--accent`, `--green`, `--yellow`, `--red`, `--bg-input`, `--text-primary`, `--border-color`.
   - Maintain full light theme compatibility via `[data-theme="light"]`.

2. **Parsing Safeguards**:
   - Always use `parseAiJson(raw)` from `src/services/ai.ts` to parse model JSON responses.
   - Use browser-native `extractFileText(file)` from `src/services/ai.ts` for `.docx`, `.pdf`, `.txt`, and `.md` files without binary CLI dependencies.

3. **Firestore Security & Data Paths**:
   - `/app_config/pricing` is publicly readable and writable by owner (`abdullahsazid109@gmail.com`).
   - Pricing & FAQs must sync to `doc(db, 'app_config', 'pricing')` with `localStorage` fallback `'tuitrix_pricing'`.
   - Upgrade requests reside in `collection(db, 'upgrade_requests')`.
   - User cloud data resides in `users/{uid}/data/appState` and `users/{uid}/data/billing`.

4. **Multi-Account & Reactive Auth**:
   - Normalize owner email comparisons using `isOwnerEmail(email)` in `src/utils/auth.ts` (`email?.trim().toLowerCase() === 'abdullahsazid109@gmail.com'`).
   - On account switch (`onAuthStateChanged`), immediately reset `billingState` to `null` before loading the new user's billing document.
   - Never block routes (`settings`, `owner`, `help`, `landing`) behind empty `<main id="view"></main>` onboarding gates.

---

## 2. Agent Workflow for Every Session

1. **Before Modifying Code**:
   - Read `[[vault/01-architecture/system-map.md]]` and `[[vault/02-memory/decisions-and-bugs.md]]`.
2. **Deterministic Verification Protocol**:
   - Type check: `npx tsc --noEmit`
   - Test suite: `npx vitest run`
   - Production build: `npm run build`
3. **Session Closure**:
   - Record changes in `[[vault/02-memory/changelog.md]]`.
