---
title: Engineering Changelog
created: 2026-11-02
tags: [changelog, history, releases]
---

# 📜 Engineering Changelog

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
