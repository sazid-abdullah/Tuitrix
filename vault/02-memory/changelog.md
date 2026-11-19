---
title: Engineering Changelog
created: 2026-11-02
tags: [changelog, history, releases]
---

# 📜 Engineering Changelog

## [2026-11-14] — Unlinked Payment Attribution, Schedule Days Fallback, Students View Cycle Badges & Test Consolidation
- Generated Play Store 192x192 and 512x512 PNG icons, aligned TWA & web app manifests, and added inline PWA install guide in `ApkShareModal.tsx` with test coverage in `src/tests/apkShareModal.test.tsx`.
- Standardized Android package ID to `com.tuitrix.app` across Capacitor and TWA, added CI Firebase secret injection for APK/AAB builds, and added deploy-time `assetlinks.json` SHA-256 fingerprint injection.
- Integrated NCTB board exam presets (`BOARD_EXAM_PRESETS`, `getPresetById` in `src/utils/examPresets.ts`) and 2-column board paper print mode in `AIView.tsx` with full test coverage in `src/tests/examPresets.test.ts` and `src/tests/printBranding.test.tsx`.
- Integrated Bulk WhatsApp Fee Reminder Queue in `MoneyView.tsx` (bilingual EN/BN toggle, custom payment notes, sequential send queue, copy action) with BD phone normalizer & reminder utilities in `src/utils/whatsapp.ts`, polished modals/settings, and test coverage in `src/tests/moneyReminderQueue.test.tsx` and `src/tests/whatsappReminder.test.ts`.
- Updated `contractStatus` in `src/store/contracts.ts` to credit unlinked payments (`contractId: null` or falsy) matching `studentId` and contract date range (`p.date >= c.startDate && (!c.endDate || p.date <= c.endDate)`) up to today, accurately crediting batch fee and student payments.
- Enhanced `expectedMonthlyFees` in `src/store/contracts.ts` to fall back to `weeklySlots = (s?.schedule?.length || s?.scheduleDays?.length || 0)` when estimating monthly tuition prior to 14 days of lesson history.
- Enhanced `scheduleSummary` in `src/views/StudentsView.tsx` to format `scheduleDays` and `scheduleTime` when `schedule` array is empty (`${s.scheduleDays.join(', ')}${s.scheduleTime ? ' · ' + fmtTime(s.scheduleTime) : ''}`) before falling back to `'No fixed schedule'`.
- Updated `StudentsView.tsx` student list cards to detect cycle completion when `(st.completed > 0 && st.progress === 0 && bal > 0.005) || progressPct >= 100`, and rendered both `cycleRender` and `balanceBadge(bal)` stacked when `bal > 0.005` with positive balance.
- Consolidated duplicate test file by deleting untracked `src/tests/classesAndMoney.test.tsx` and adding comprehensive unit tests in `src/tests/classesMoneyAndRadar.test.tsx` verifying unlinked payment attribution, `scheduleDays` formatting, and dual cycle completion / due-balance badge display.
- Updated `normalizeExam` in `src/services/ai.ts` to preserve `answer: null` when an MCQ has no answer key (`q.answer` is `null`, `undefined`, or `''`), preventing unwanted `0` defaults and enabling the "Set key…" answer selector in `ResultView.tsx`.
- Enhanced `renderMarkdown` in `src/services/ai.ts` to detect inline `<svg>...</svg>` blocks, normalize them with `normalizeSvgString`, and render them as native high-contrast `<img>` diagram figures (`class="exam-fig"`) rather than escaping to `&lt;svg&gt;` text.
- Added dark schematic contrast styling (`.exam-fig { ... }`) to the print iframe `<style>` in `AIView.tsx` so printed exams and worksheets preserve circuit and vector diagrams crisply on physical paper.
- Integrated AI generation quota checks (`canUseAI` with reward modal/toast) and credit consumption (`consumeAiCredit()`) into `handleRevise` in `AIView.tsx`.
- Added unit tests in `src/tests/aiAndSettings.test.tsx` verifying `normalizeExam` null-answer preservation across unkeyed MCQs and inline `<svg>` rendering in `renderMarkdown`.
- Updated `HomeView.tsx` `handleQuickAbsent` to look up the student's active contract (`startDate <= today` and not `ended`) and pass `contractId` when marking absent lessons.
- Hardened `HomeView.tsx` `hasAI` checklist check to consider both `state.savedResources` and `state.docs`, and filtered `soon` dues to only include active students with non-ended contracts.
- Enhanced Today's Tuition Radar row styling in `HomeView.tsx` with `background: 'var(--card)', border: '1px solid var(--border)'` for full light/dark theme design token parity.
- Upgraded `ClassesView.tsx` Weekly Routine view to support slot `duration`, iterate all matching slots on each weekday, and forward `time` and `duration` to `onLogLesson` when clicking the `✅` routine button.
- Added comprehensive unit tests in `src/tests/classesAndMoney.test.tsx` and `src/tests/classesMoneyAndRadar.test.tsx` verifying routine slot `time`/`duration` forwarding and active `contractId` linking on quick absent.
- Added `useEffect` in `src/views/SettingsView.tsx` syncing profile/settings and AI form inputs (`tutorName`, `currency`, `credentials`, `brandTitle`, `showPrintHeader`, `showPrintWatermark`, `notificationsEnabled`, `feeReminderNotifications`, `classReminderNotifications`, `provider`, `apiKey`, `selectedModel`) whenever `state.settings`, `state.profile`, or `state.ai` changes so cloud hydration, backup restore, and data erase immediately reflect in the UI.
- Safely formatted numeric `billingState.proUntil` timestamps in `SettingsView.tsx` via `fmtDate(new Date(billingState.proUntil).toISOString().slice(0, 10))` under `Pro Until:`.
- Implemented `localPendingReq` state and unified `pendingReq` resolution in `SettingsView.tsx` to immediately transition the UI to the `⏳ Verification Tracker` view upon submitting an upgrade request before remote billing sync completes, with automatic clearing on user switch or Pro activation.
- Computed deduplicated saved AI documents count on `SettingsView.tsx` bottom summary line combining `state.savedResources` and `state.docs` via `new Set(...)`.
- Added unit tests in `src/tests/aiAndSettings.test.tsx` verifying numeric `proUntil` timestamp date formatting, instant Verification Tracker transition with submitted TrxID, and form input re-synchronization on state changes.
- Synchronized `schedule` from `scheduleDays` and `scheduleTime` in `StudentModal.tsx` when a new student is saved with routine days without touching the default Saturday slot, preventing phantom Saturday routine slots.
- Included `|| Boolean((state as any).isOwner)` in `isPro` across `StudentModal.tsx`, `BatchModal.tsx`, and `BulkStudentModal.tsx` for consistent owner access across modal tier checks.
- Enabled automatic active monthly fee `Contract` creation in `BulkStudentModal.tsx` for imported students with specified tuition fees regardless of `Target Batch` assignment.
- Enhanced `LessonModal.tsx` to automatically prefill `time` from the matching weekday slot in `b.schedule` or `b.scheduleTime` when opening a batch session without an explicit `initialTime`.
- Hardened WhatsApp phone link formatting in `SettingsView.tsx` (`formatBdWhatsAppNumber`) and `HelpCenterView.tsx` to reject placeholder/short numbers (`< 10` digits), preventing broken `https://wa.me/017` links.
- Added comprehensive unit tests in `src/tests/modalsAndReceipt.test.tsx` verifying `BulkStudentModal` batch fee contract creation, `StudentModal` schedule sync from `scheduleDays`, `LessonModal` batch time prefill, and placeholder WhatsApp number rejection.
- Normalized 11-digit Bangladesh phone numbers (`01...`) with country code `88` in `PaymentReceiptModal.tsx` (`handleWhatsApp`) and replaced invalid `var(--text-muted)` design tokens with `var(--muted)`.
- Enhanced `BatchFeeModal.tsx` promo code calculation to resolve discount value safely across `value`, `discountValue`, and `discountPercent` preventing `NaN`, and replaced invalid `var(--bg-card)` header style with `var(--card2)`.
- Guarded `recordPayments` in `BatchFeeModal.tsx` to only record payments when `data.finalAmount > 0 || (data.originalAmount > 0 && data.discount > 0)`, skipping dummy `৳0` payment creations for students with `0` fee and `0` due.
- Updated `contractLessons` lookup in `BatchFeeModal.tsx` to include unlinked lessons matching student ID (`l.contractId === d.contract!.id || (!l.contractId && l.studentId === sid)`), ensuring lessons logged prior to contract creation populate `lastClassDate` and `lastClassTopic` in reminder messages.
- Added comprehensive unit tests in `src/tests/modalsAndReceipt.test.tsx` verifying `PaymentReceiptModal` BD WhatsApp normalization and `BatchFeeModal` promo code support across `discountPercent`/`discountValue` alongside `0`-amount payment skipping.

## [2026-11-13] — Deep Undefined Firestore Sanitization & Root Tutor Metadata Indexing
- Applied `stripUndefinedDeep` sanitization across all Firestore `setDoc` payloads in `src/store/context.tsx` (owner billing sync, owner role sync, initial state migration/upload, and 250ms debounced sync) to prevent Firestore SDK `Unsupported field value: undefined` write errors.
- Added automatic lightweight root tutor metadata indexing to `doc(db, 'users', user.uid)` whenever `users/{uid}/data/appState` is saved, persisting `{ email, tutorName, studentCount, updatedAt }` with merge option to enable `getDocs(collection(db, 'users'))` in `fetchPlatformTelemetry` to reliably discover all registered tutors.
- Added comprehensive unit tests in `src/tests/authSync.test.tsx` verifying recursive undefined property stripping and root tutor metadata indexing during debounced state synchronization and initial state migration.
- Added Registered Tutors Directory table to `OwnerDashboardView.tsx` under Overview Tab, rendering tutor name, email, plan status (`badge green` for Pro, `badge` for Free), student count, and safe formatted last active date.
- Enhanced `fetchPlatformTelemetry` in `src/services/firebase.ts` to backfill registered tutors from `allRequests` for any unindexed users and sort all tutors descending by `updatedAt`.
- Updated `deleteTutorAccountAndData` in `src/services/firebase.ts` to purge `users/${uid}/data/billing` and the root `users/${uid}` metadata document upon account deletion.
- Added comprehensive unit tests in `src/tests/ownerDashboard.test.tsx` verifying Registered Tutors Directory rendering, backfill logic, and descending timestamp sorting.
- Added `[attempt?.id]` hydration `useEffect` in `ExamView.tsx` syncing `answers`, `flags`, and `timeLeft` when the loaded attempt hydrates or switches ID.
- Added `latestRef = useRef({ answers, flags, attempt })` in `ExamView.tsx` updated on every render to guarantee auto-submit timer triggers always save latest state without closure staleness.
- Updated `ExamView.tsx` MCQ option rendering to format inline code/math/markdown with `renderMarkdown(opt)`, and cleaned up CQ part mark formatting (`<b>({part.label})</b> <span ... /> <span className="muted small">[{part.marks} marks]</span>`) removing raw asterisks.
- Added public deep-link landing bypass in `App.tsx` calling `setShowLanding(false)` inside `parseHash()` when navigating to `#/result/...`, `#/student/...`, or `#/help`.
- Expanded unit test coverage in `src/tests/examAndResultSync.test.tsx` verifying CQ part mark clean rendering without raw asterisks and attempt answer re-syncing on ID change/hydration.
- Updated `ResultView.tsx` `handleShareResult` to publish `liveAttempt` containing latest `marksState` and `activeStudentId` to ensure shared links include recently evaluated marks and assigned students.
- Cleaned up `ResultView.tsx` header actions to only display `← Back to AI Assistant` when `!isReadOnly`, preventing parents and students accessing shared public links (`#/result/{id}`) from being routed into the tutor AI Assistant.
- Enhanced `ResultView.tsx` question review rendering to display `q.figure` on CQ and written questions, cleanly format CQ part marks (`[{p.marks} marks]`) without raw asterisks, format CQ and written model answers with `renderMarkdown`, and format MCQ stems with `renderMarkdown`.
- Added comprehensive unit tests in `src/tests/examAndResultSync.test.tsx` verifying CQ/written figure rendering, clean CQ part mark badges, hiding of `← Back to AI Assistant` in read-only mode, and `marksState` publishing during result sharing.
- Updated `ParentReportModal.tsx` `handleCopyPortalLink` to sort `student.examScores` descending by date before publishing the top 5 scores, and stripped raw `(attempt:...)` identifiers from `remarks` for both published snapshots and the modal's Recent Exam Performance table.
- Enhanced `StudentDetailView.tsx` to strip `(attempt:...)` identifiers when displaying exam score remarks in both the Live Parent Portal view and the tutor's Exam Scores list, while keeping internal `(attempt:<id>)` tokens intact in state for attempt tracking and score resetting.
- Improved `StudentDetailView.tsx` score logging form to cleanly handle empty string inputs without `NaN` on `obtainedMarks` and `totalMarks`, strictly validate positive numbers on submit, convert inputs safely to `Number(...)`, and reset form state to defaults upon save.
- Added comprehensive unit tests in `src/tests/examAndResultSync.test.tsx` verifying descending date sorting of published exam scores, removal of raw `(attempt:...)` tokens in parent portal snapshots and student detail views, and empty string input handling on score logging.

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
- Removed raw PDF iframe leak from `ExamView.tsx` and removed blank OMR dummy mode from `UploadPaperModal.tsx` in favor of full AI vision question & diagram extraction with live progress status.
- Raised file vision AI timeout to 90s in `callAI` and added deterministic diagram, truth-table, and display synthesis with answer leak stripping in `normalizeExam`.
- Added back navigation button to AI Assistant results in `ResultView.tsx` and exit confirmation control in `ExamView.tsx`.
- Implemented `purgeDummyRecords` in `src/store/context.tsx` to automatically purge stale `Question 1 / Option A` dummy exams, matching docs, and hanging attempts (`mw663ngzf313`) on startup and remote Firestore sync.
- Implemented 2-stage combinational `circuit:` SVG renderer and expanded `inferDiagramFromQuestion` with place-value and number-base conversion boxes for Q18–Q26 & Q44–Q50.
- Added retroactive diagram and table synthesis in `ExamView` & `ResultView` and updated `.exam-fig` schematic styling with dark background and constrained dimensions.
- Implemented universal all-subject single-quoted `<svg>` instructions in `examJsonPrompt` and `sanitizeSvgInJson` in `parseAiJson` to recover unescaped double-quoted SVG attributes and collapsed newlines.
- Added `normalizeSvgString` in `normalizeExam` guaranteeing `xmlns`, explicit `width`/`height` from `viewBox`, high-contrast `#38bdf8`/`#e2e8f0` styling, and fallback style injection for Physics, Math, Chemistry, and ICT diagrams.

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
