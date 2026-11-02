---
title: Tuitrix Second Brain Hub
created: 2026-11-02
tags: [hub, index, architecture]
---

# 🧠 Tuitrix Obsidian Second Brain

Welcome to the internal engineering and architectural memory for **Tuitrix**. This vault is designed to be opened directly in [Obsidian](https://obsidian.md) by developers and read by autonomous AI coding assistants (Gemini, Antigravity, Claude Code).

---

## 🗺️ Core Architecture & Maps
- [[vault/01-architecture.md|System Architecture Map]]: Complete routing, store structure, Firebase Firestore paths, and billing lifecycle.

---

## 🛡️ Decisions, Bug Post-Mortems & Rules
- [[vault/02-memory/decisions-and-bugs.md|Decisions & Bug Post-Mortems]]: Documented fixes for `#/settings` date crashes, Brave Shields analytics isolation, multi-account owner detection, and onboarding gating.
- [[vault/02-changelog.md|Engineering Changelog]]: Chronological audit trail of feature additions, bug fixes, and refactors.

---

## 🚀 Reusable AI Templates
- [[vault/03-prompts/antigravity-template.md|Deterministic Agent Protocol]]: Reusable 4-step prompt template for deterministic coding tasks.

---

## ⚡ Quick Invariants
| Area | Rule | Enforcement |
| :--- | :--- | :--- |
| **Styling** | Zero Tailwind CSS | All rules in `./css/style.css` using `--card`, `--bg`, `--accent` |
| **Parsing** | Safe JSON Parsing | `parseAiJson` from `src/services/ai.ts` |
| **Dates** | No `new Date(undefined)` | `fmtDate` in `src/utils/date.ts` guards invalid/missing values |
| **Security** | Firestore Paths | Public read & owner write on `/app_config/pricing` |
