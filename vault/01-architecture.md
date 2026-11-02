---
title: System Architecture Map
created: 2026-11-02
tags: [architecture, routes, store, firebase]
---

# 🗺️ System Architecture Map

See [[vault/00-Index.md|Index]] and [[vault/02-changelog.md|Changelog]].

## 1. Application Routes (`src/App.tsx`)

| Route | View Component | Loading Mode | Purpose |
| :--- | :--- | :--- | :--- |
| `home` | `HomeView` | Synchronous | Daily tuition radar, quick stats, today's schedule |
| `students` | `StudentsView` | Synchronous | Student directory, contract links, cycle trackers |
| `student/:id` | `StudentDetailView` | `React.lazy` | Individual student profile, attendance history, score trends |
| `classes` | `ClassesView` | Synchronous | Lesson logging, attendance records, batch management |
| `money` | `MoneyView` | `React.lazy` | Financial dashboard, monthly earnings chart, expenses & goals |
| `ai` | `AIView` | `React.lazy` | AI question generator, lecture notes, exam studio, `.docx` parser |
| `exam/:attemptId` | `ExamView` | `React.lazy` | Full-screen timed student exam interface |
| `result/:attemptId` | `ResultView` | `React.lazy` | Exam score report, automated AI rubric grading, score logger |
| `settings` | `SettingsView` | Synchronous | Tutor branding, AI models & keys, backup/restore, billing upgrade |
| `landing` | `LandingView` | `React.lazy` | Public marketing showcase, dynamic bilingual FAQs, demo launcher |
| `help` | `HelpCenterView` | `React.lazy` | Real-time bilingual FAQ search, circular Q badge accordion, support cards |
| `owner` | `OwnerDashboardView` | `React.lazy` | Owner control panel, TrxID approvals, pricing editor, FAQ manager |

---

## 2. Global State & Persistence (`src/store/context.tsx`)

- **State Model (`AppState`)**:
  - `students`: `Student[]`
  - `batches`: `Batch[]`
  - `lessons`: `Lesson[]`
  - `contracts`: `Contract[]` (12-class, monthly, day-based billing cycles)
  - `payments`: `Payment[]`
  - `expenses`: `Expense[]`
  - `goals`: `Goal[]`
  - `docs`: `SavedDoc[]`
  - `exams`: `Exam[]`
  - `attempts`: `ExamAttempt[]`
  - `settings`: `Settings` (theme, currency, tutorName, lastBackup)
  - `profile`: `TutorProfile` (credentials, brandTitle, showPrintHeader, showPrintWatermark)
  - `ai`: `AIConfig` (provider, keys, models)
- **Local Storage Key**: `'tuitrix_data_v1'`
- **Sync Mechanism**:
  - Offline-first: Reads and writes to `localStorage` debounced at 250ms.
  - Cloud Sync: If authenticated, synchronizes with `users/{uid}/data/appState` in Firestore.
  - Multi-tab Sync: `storage` event listener keeps browser tabs synchronized in real time.

---

## 3. Firebase Paths & Security Model

- **/app_config/pricing**:
  - `monthlyPriceBdt`: number
  - `yearlyPriceBdt`: number
  - `bkashNumber`, `nagadNumber`, `rocketNumber`: string
  - `supportWhatsapp`, `supportEmail`: string
  - `promoCodes`: `PromoCode[]`
  - `faqs`: `FaqItem[]`
- **/upgrade_requests/{id}**:
  - Created by tutor when submitting bKash/Nagad/Rocket TrxID.
  - Reviewed by owner in `OwnerDashboardView` or `SettingsView`.
- **/users/{uid}/data/billing**:
  - `plan`: `'free' | 'pro'`
  - `credits`: number
  - `proUntil`: number (timestamp)
  - `transactions`: Array of approved transaction objects.
