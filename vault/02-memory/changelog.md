---
title: Engineering Changelog
created: 2026-11-02
tags: [changelog, history, releases]
---

# 📜 Engineering Changelog

## [2026-11-06] — Invalidation of Dummy Exam Caches & Removal of Mock Question Fallbacks
- Added `isDummyExam` helper in `src/services/ai.ts` and `src/App.tsx` (`onStartExam`) to detect and invalidate empty or single-placeholder dummy exams (`Sample MCQ question text`, `Question text`), forcing automatic re-parsing from source.
- Added raw binary PDF guard in `onStartExam` (`src/App.tsx`) to detect `%PDF-` streams and display an actionable toast directing users to "Upload question paper" for AI Vision processing.
- Guarded `onStartExam` to throw `"AI could not extract valid questions from this document. Please ensure the paper has numbered questions."` when `parsed.questions.length === 0` instead of persisting an empty or broken exam.
- Updated `examJsonPrompt` in `src/services/ai.ts` with explicit critical instructions forbidding placeholder question manufacture and requiring `{"questions": []}` if no questions are found.
- Verified `normalizeExam` preserves empty questions array without manufacturing fake/mock questions.
- Expanded unit test coverage in `src/tests/aiAndSettings.test.tsx` verifying `isDummyExam` detection, cache check invalidation, empty question array handling in `normalizeExam`, and `%PDF-` binary input rejection.
- Added SVG/table extraction rules in `examJsonPrompt`, converting inline `<svg>` figures into sanitized `data:image/svg+xml;utf8,...` data URIs in `normalizeExam` for native `<img class="exam-fig">` rendering without XSS risk.
- Supported Markdown image syntax `![alt](src)` in `renderMarkdown` and preserved `stimulus` tables and `figure` diagrams in `UploadPaperModal` `paperMd` reconstruction.
- Implemented compact diagram spec renderer (`renderDiagramSpecToSvgDataUri`) supporting `gate:`, `block:`, `seg7:`, and `boxes:` without leaking answer text inside gate/block bodies, and raised default Gemini JSON `maxOutputTokens` to 32K.
- Added step-4 truncation auto-recovery in `parseAiJson` for large `"questions"` arrays and wrapped lazy routes with `lazyWithRetry` in `App.tsx` for seamless deployment chunk cache recovery.
- Added 35s AbortController timeout and 2-model file limit in `callAI` alongside IndexedDB `paperStorage.ts` for zero-Firestore blob persistence.
- Added Instant Question Bank + OMR Mode in `UploadPaperModal.tsx`, split-screen PDF/image paper viewer in `ExamView.tsx`, and question count badges in `AIView.tsx`.

## [2026-11-04] — Interactive Exam Scoring Sync, AI Mark Mapping, Board Exam Studio & AI Deep-Linking
- Fixed `ResultView` AI mark mapping for non-CQ written questions (`q.id:0` to `q.id`), guarded empty typed answers in `handleAIMark`, and added live student profile score re-syncing on mark save.
- Extracted `isQuestionAnswered` helper in `ExamView` to accurately treat empty CQ parts as unanswered, reset `attempt.scoreLogged` on score deletion in `context.tsx`, and corrected chart CSS variable tokens in `StudentDetailView`.
- Upgraded `AIView` with Pro recognition for owner emails via `isOwnerEmail`, unified URL hash router supporting `#/ai/tool=...&student=...` deep-linking with student prefill, board exam parameters (`cqCount`, `cqAnswer`, `mcqCount`), and enforced `canSaveAiResource` quotas.
- Enhanced `ai.ts` `examPrompt` and `examMarks` to support Bangladesh board exam specifications (Creative Questions + MCQs with exact marks computation), and ensured deterministic SavedDoc ID reuse in `handleSaveResult` for seamless "Start exam" navigation.
- Synced `initialStudentId` and enforced `canSaveAiResource` Free-tier quotas across `UploadPaperModal` and `ImportDocModal`, with question Markdown reconstruction (`paperMd`) from parsed MCQs, CQs, and written questions on image/PDF uploads.
- Wired `studentBalance` in `ParentReportModal` for accurate multi-contract `Total Due` calculation and replaced legacy `-main` color tokens with design system CSS variables (`var(--green)`, `var(--yellow)`, `var(--red)`).
- Added `ClassesView` `initialBatchFilter` deep-link support, Weekly Routine slot lookup across `s.schedule` (`day: 6`) & `s.scheduleDays` with batch filtering, and replaced invalid `var(--primary)` tokens with `var(--accent)`.
- Updated `MoneyView` with `user?.email` owner Pro detection, studentId-based batch revenue attribution without contractId requirement, dark-theme lock overlay background, and resolved `HomeView` Radar batch/slot times.
- Fixed `LessonModal` initial state loading when `!lesson` to accurately honor `initialBatchId` with mode `'batch'` and sync `initialStudentId`.
- Updated `PaymentModal` `suggestAmount` to support active advance balances, verified `PaymentReceiptModal` dynamic currency, and resolved student/guardian phone numbers in `BatchFeeModal` WhatsApp reminder links.
- Added `stripUndefinedDeep` in `firebase.ts` to sanitize Firestore documents and pricing/upgrade states, synced live `usedCount` in Owner Dashboard Promo Studio, normalized leading zeros in `OwnerDashboardView` pricing inputs, and sanitized `"None"` coaching/subtitle placeholders across receipts and settings.
- Added `estimateInputTokens` guard (>75K tokens) and multi-model 429/503 fallback cascade (`gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemma-4-31b-it`) in `callAI`.
- Made secondary AI verification opt-in by default in `AIView`, added on-demand "Verify accuracy with AI" action, sliced check input to 24K, added graceful rate-limit notification banner, and sanitized `"None"` print branding placeholders.
- Added `/shared_results/{resultId}` Firestore security rule allowing public unguessable single-doc retrieval and authenticated tutor mutations, with `publishSharedExamResult` and `fetchSharedExamResult` helpers in `firebase.ts`.
- Hardened `ResultView.tsx` with fallback Exam synthesis when `attempt.examId` is missing, read-only mode for shared public links via `fetchSharedExamResult`, and one-click `"🔗 Share Result Link"` clipboard sharing.
- Polished `LandingView.tsx` testimonials section with authentic bilingual beta tutor reviews, 5-star badges, and verified roles across Dhaka (Dhanmondi, Uttara) and Chittagong (Chawkbazar).
- Added crisp scannable subheadline copy and verified mobile/desktop responsive rendering with accompanying unit tests in `landing.test.tsx`.
- Added `/shared_portals/{portalId}` Firestore security rule allowing public single-doc retrieval and authenticated tutor mutations, with sanitized `publishSharedParentPortal` and `fetchSharedParentPortal` helpers in `firebase.ts` stripping sensitive contact/address fields.
- Added `"🔗 Copy Parent Portal Link"` in `ParentReportModal.tsx` and implemented read-only Live Parent Portal fallback rendering in `StudentDetailView.tsx` when a student profile is opened via public share link.
- Updated `LandingView` hero headline to compliant phrasing without subjective superlative claims and updated testimonials to role + location attributions with zero invented names.
- Exported `formatPromoBannerText` helper in `OwnerDashboardView` and added "📢 Set as Banner" button in Promo Studio to instantly sync active promo codes to the live checkout announcement banner.
- Migrated default Gemini model from deprecated `2.5-flash` to modern `gemini-3.8-flash` with updated Free-tier priority list filtering out legacy models.
- Enhanced `callAI` multi-model fallback cascade to chain through Gemini 3.x models and catch 404/400 deprecation and 429/503 rate-limit errors automatically.
- Implemented `extractAndPlaceholderMedia` and `restoreMediaPlaceholders` in `ai.ts` and `App.tsx` for 50-MCQ picture papers, with accurate embedded base64 image token estimation in `estimateInputTokens`.
- Added automatic state migration in `autoModel` upgrading legacy `gemini-2.5-*`/`gemini-2.0-*` selections to `gemini-3.8-flash`, and guarded `ImportDocModal` and `extractFileText` against raw binary PDF dumps.

## [2026-11-03] — Debounce Persistence Hardening & ErrorBoundary Route Auto-Reset
- Flushed pending `STORE_KEY` debounced state to `localStorage` on `pagehide`/`beforeunload` and cleared pending timers on auth change/logout to guarantee zero data loss and prevent state bleed.
- Added `resetKey` and `componentDidUpdate` auto-reset to `ErrorBoundary` on route changes, replacing full window reload with clean `parseHash()` view re-mounting.
- Fixed `fetchPlatformTelemetry` to only tally approved requests toward revenue and discounts while reconciling redemption counts across non-rejected requests, and guarded pricing updates in `submitTrxUpgradeRequest` to owner-only.
- Added reactive `isAuthorizedOwner` route guard with clean access-denied view in `OwnerDashboardView` and added dynamic `freeStudentLimit` editor in Pricing & Numbers.
- Fixed 100% scholarship checkout in `SettingsView` by skipping phone/TrxID validation on `finalAmount === 0`, rendered dynamic `promoText` campaign banner in `#upgrade-section`, and normalized BD WhatsApp numbers.
- Added `guardianPhone` fallback in `StudentsView` for the "Send Due Card" WhatsApp reminder action when a student's personal phone is omitted.
- Enforced dynamic free student limit (`getFreeStudentLimit()`) across `StudentModal` and `BulkStudentModal` with local pricing config caching in `fetchPricingConfig`.
- Updated `BulkStudentModal` to link imported students to target batches via `batch.studentIds` and normalized owner Pro checks via `isOwnerEmail`.
- Enforced Free tier active batch cap in `BatchModal` via `canAddBatch`, normalized owner Pro detection in `Navbar`, and added Bangla fallback with clickable language toggle in `HelpCenterView`.
- Made `LandingView` free student limits dynamic, sorted and backed up FAQs, and linked Help Centre & Pro upgrade CTAs cleanly to `#/help` and `#/settings`.
- Converted Firebase Messaging to dynamic import in `notifications.ts`, guarded Analytics initialization in `firebase.ts` against test/headless environments, and set `chunkSizeWarningLimit: 700` in `vite.config.ts` for zero-warning production builds.

## [2026-11-02] — Stability, Crash Hardening, Performance & Second Brain Vault

### Fixed
- **Settings View Date Crash**:
  - Guarded Transaction History date extraction against missing `created_at` field (`t.date || t.created_at || t.createdAt`).
  - Bulletproofed `fmtDate` and `parseISO` in `src/utils/date.ts` to catch invalid dates and return `""` instead of throwing `RangeError: Invalid time value`.
- **Firebase Core Service Isolation**:
  - Isolated `getAnalytics` in `src/services/firebase.ts` so ad-blockers (Brave Shields) blocking measurement URLs never halt `db` (Firestore) or `auth` initialization.
- **Onboarding Gating Removal on Settings & Owner Views**:
  - Removed early `<main id="view"></main>` return in `src/App.tsx`.
  - Added a top-level React `ErrorBoundary` with recovery UI (`Reload View`, `Go Home`).
- **Multi-Account State Bleed**:
  - Reset `billingState` to `null` immediately upon `onAuthStateChanged` user switch in `src/store/context.tsx`.
  - Made `isOwner` detection reactive in `SettingsView.tsx` with live `onAuthStateChanged` listener.

### Added
- **Route-Based Code Splitting**:
  - Converted `AIView`, `ExamView`, `ResultView`, `MoneyView`, `StudentDetailView`, `LandingView`, `OwnerDashboardView`, and `HelpCenterView` to `React.lazy` chunks with `<Suspense>` fallback in `src/App.tsx`.
- **Debounced LocalStorage & Firestore Sync**:
  - Added a 250ms debounce timer for state persistence in `src/store/context.tsx` to prevent main-thread lag during keystrokes.
- **Obsidian Second Brain & Constitution**:
  - Scaffolded `GEMINI.md`, `CLAUDE.md`, and `vault/` directory containing `00-Index.md`, `01-architecture/system-map.md`, `02-memory/decisions-and-bugs.md`, `02-memory/changelog.md`, and `03-prompts/antigravity-template.md`.

---

## [2026-11-02] — Help Centre (`#/help`) & Owner FAQ Manager (`#/owner`)

### Added
- Dedicated bilingual Help Centre view (`HelpCenterView.tsx`) reachable at `#/help` with real-time search, category filter pills, circular `20px × 20px` `Q` badges, quick self-service cards, and direct WhatsApp/Email support banner.
- Owner Dashboard Tab 4 (FAQ Manager) in `OwnerDashboardView.tsx` allowing add, edit, reorder (`↑`/`↓`), delete, reset to defaults, and cloud sync to Firestore `/app_config/pricing`.
- Seeded `DEFAULT_FAQS: FaqItem[]` in `src/services/firebase.ts` (8 bilingual items across 5 categories).
- Dynamic FAQ rendering in `LandingView.tsx` and Help Centre routing in `SettingsView.tsx`.

---

## [2026-11-02] — Owner Dashboard (`#/owner`), Telemetry & Promo Studio

### Added
- **Owner Dashboard & Telemetry Architecture (`OwnerDashboardView.tsx`)**:
  - 4 KPI telemetry cards: Total Registered Tutors (Pro/Free breakdown), Total Verified Revenue (৳), Promo Redemptions, and Pending TrxID Orders.
  - Interactive Promo Usage Breakdown table tracking redemption counts against usage caps (`usedCount / maxUses`), revenue generated, and total discounts granted.
  - Filterable TrxID Approval table with status pills (`All`, `Pending`, `Approved`, `Rejected`), search query input, and 1-click Approve/Reject actions.
  - Pricing & Numbers tab with live checkout preview reflecting monthly/yearly pricing and bKash/Nagad/Rocket account numbers.
  - Promo Studio with Create/Edit/Toggle/Delete actions and an Interactive Promo Discount Simulator.
  - Preserved Help Centre & FAQ Manager tab with bilingual question management.
- **Promo Math & Usage Engine (`src/services/firebase.ts`, `src/types.ts`)**:
  - Extended `PromoCode` with `discountType`, `discountValue`, `maxUses`, `usedCount`, `expiresAt`.
  - Exported `evaluatePromoCode(promo, basePrice)` supporting `%` and flat `৳` discounts, expiration date checks, and `maxUses` caps.
  - Automated `usedCount` incrementation upon `submitTrxUpgradeRequest` in Firestore `/app_config/pricing` and localStorage.
  - Exported `fetchPlatformTelemetry(pricingConfig)` to compile user counts, revenue, and campaign telemetry.
- **Navbar & Settings Wiring**:
  - Added `👑 Owner` button to topbar and mobile bottom nav for authorized owner accounts.
  - Replaced duplicate inline owner cards in `SettingsView.tsx` with a single high-visibility Owner Control Centre summary link card.
  - Connected `evaluatePromoCode` to `SettingsView.tsx` checkout for instant discount feedback.
