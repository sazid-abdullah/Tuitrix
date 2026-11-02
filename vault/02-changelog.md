---
title: Engineering Changelog
created: 2026-11-02
tags: [changelog, history, releases]
---

# 📜 Engineering Changelog

See [[vault/00-Index.md|Index]] and [[vault/01-architecture.md|Architecture]].

## [2026-11-02] — Stability, Crash Hardening, Performance & Second Brain Vault

### Fixed
- **Settings View Date Crash**:
  - Guarded Transaction History date extraction against missing `created_at` field (`t.date || t.created_at || t.createdAt`).
  - Bulletproofed `fmtDate` and `parseISO` in `src/utils/date.ts` to catch invalid dates and return `""` instead of throwing `RangeError: Invalid time value`.
- **Firebase Core Service Isolation & Long-Polling**:
  - Configured `initializeFirestore(app, { experimentalAutoDetectLongPolling: true })` so Brave Shields doesn't block Firestore requests.
  - Isolated `getAnalytics` in `src/services/firebase.ts` so ad-blockers blocking measurement URLs never halt `db` (Firestore) or `auth` initialization.
- **Settings View Gemini Rate Limit Spam**:
  - Removed mount `useEffect` auto-calling `handleRefreshModels(false)` on `[apiKey]` to prevent Gemini 429 rate-limit errors.
- **Broken Manifest Icon Reference**:
  - Created `public/icons/icon.svg` and updated `public/manifest.json` with valid relative paths (`./icons/icon.svg`, `start_url: "./"`).
- **Onboarding Gating Removal on Settings & Owner Views**:
  - Removed early `<main id="view"></main>` return in `src/App.tsx`.
  - Added a top-level React `ErrorBoundary` with recovery UI (`Reload View`, `Go Home`).
- **Multi-Account State Bleed**:
  - Reset `billingState` to `null` immediately upon `onAuthStateChanged` user switch in `src/store/context.tsx`.
  - Made `isOwner` detection reactive in `SettingsView.tsx` via `isOwnerEmail(user?.email || auth?.currentUser?.email) || Boolean(state.isOwner)`.

### Added
- **Route-Based Code Splitting**:
  - Converted `AIView`, `ExamView`, `ResultView`, `MoneyView`, `StudentDetailView`, `LandingView`, `OwnerDashboardView`, and `HelpCenterView` to `React.lazy` chunks with `<Suspense>` fallback in `src/App.tsx`.
- **Debounced LocalStorage & Firestore Sync**:
  - Added a 250ms debounce timer for state persistence in `src/store/context.tsx` to prevent main-thread lag during keystrokes.
- **Obsidian Second Brain & Constitution**:
  - Scaffolded `GEMINI.md`, `CLAUDE.md`, and `vault/` directory containing `00-Index.md`, `01-architecture.md`, and `02-changelog.md`.

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
