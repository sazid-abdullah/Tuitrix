# Tuitrix — Standing Engineering Constitution (Gemini / Antigravity Agent Guidelines)

Welcome to Tuitrix (`C:\Users\ASUS\Tuitrix`), the offline-first tuition management platform and AI exam suite for Bangladeshi tutors and coaching centers.

---

## 1. Non-Negotiable Invariants & Rules

1. **Strictly NO Tailwind CSS**:
   - Tailwind CSS is **NOT** installed. Do NOT introduce Tailwind classes or create `src/index.css`.
   - All styling resides in `./css/style.css` utilizing design system variables:
     `--bg`, `--surface`, `--card`, `--card2`, `--text`, `--muted`, `--border`, `--accent`, `--green`, `--yellow`, `--red`, `--bg-input`, `--text-primary`, `--border-color`.
   - Full dark/light mode parity must be maintained with `[data-theme="light"]`.

2. **JSON & File Parsing Invariants**:
   - Always parse AI completions with `parseAiJson(res)` from `src/services/ai.ts` (never raw `JSON.parse(res)`).
   - Use browser-native `extractFileText(file)` from `src/services/ai.ts` for `.docx`, `.pdf`, `.txt`, and `.md` files without node/binary dependencies.

3. **Firestore Security & Data Paths**:
   - Authorized public read & owner write (`abdullahsazid109@gmail.com`) on `/app_config/{docId}`.
   - Pricing, promo codes, and FAQs are located at `doc(db, 'app_config', 'pricing')` with `localStorage` fallback key `'tuitrix_pricing'`.
   - Upgrade requests reside in `collection(db, 'upgrade_requests')`.
   - Tutor state synchronizes to `doc(db, 'users/{uid}/data/appState')` and `doc(db, 'users/{uid}/data/billing')`.

4. **Multi-Account & Owner Invariant**:
   - Normalize owner emails using `isOwnerEmail(email)` in `src/utils/auth.ts` (`email?.trim().toLowerCase() === 'abdullahsazid109@gmail.com'`).
   - On account switch (`onAuthStateChanged`), immediately reset `billingState` to `null` before loading the new user's billing document.
   - Never block routes (`settings`, `owner`, `help`, `landing`) behind empty `<main id="view"></main>` onboarding gates.

---

## 2. Agent Workflow for Every Session

1. **Before Writing Code**:
   - Read `[[vault/01-architecture/system-map.md]]` to understand route and store structure.
   - Read `[[vault/02-memory/decisions-and-bugs.md]]` to avoid repeating resolved regression patterns.
2. **Deterministic Verification**:
   - Verify static types: `npx tsc --noEmit` (must exit 0).
   - Run unit tests: `npx vitest run` (all tests must pass).
   - Run production build: `npm run build` (must succeed).
3. **After Completing Features or Bug Fixes**:
   - Append a concise entry to `[[vault/02-memory/changelog.md]]` with date, files touched, and rationale.
