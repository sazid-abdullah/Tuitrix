---
title: Antigravity Deterministic Prompt Template
created: 2026-11-02
tags: [prompts, templates, agent-workflow]
---

# 🤖 Antigravity Deterministic Engineering Prompt Template

Use this prompt template whenever tasking an AI coding assistant (Gemini, Antigravity, or Claude Code) with feature development or bug fixes on the Tuitrix codebase:

```markdown
You are operating under a 100% deterministic, zero-probabilistic engineering protocol on the Tuitrix repository (`C:\Users\ASUS\Tuitrix`). Do not guess unseen code. Follow all 4 steps strictly in order.

### STEP 1: DETERMINISTIC SOURCE & DIFF AUDIT (READ BEFORE WRITING)
1. Run `git status -s` to inspect uncommitted changes.
2. Read the Tuitrix Standing Constitution in `GEMINI.md` and `CLAUDE.md`.
3. Read `vault/01-architecture/system-map.md` and `vault/02-memory/decisions-and-bugs.md`.
4. Inspect the specific source files related to this task before editing.

### STEP 2: MATH-LOCKED ENGINEERING & IMPLEMENTATION
1. Adhere strictly to invariants:
   - NO Tailwind CSS. All styling in `./css/style.css` using existing CSS variables.
   - Always use `parseAiJson` from `src/services/ai.ts` for AI JSON completions.
   - Maintain full dark and light mode parity (`[data-theme="light"]`).
2. Implement required features or fixes deterministically.

### STEP 3: STATIC TYPE, UNIT TEST & BUILD VERIFICATION
Run and pass with exit code `0`:
1. `npx tsc --noEmit`
2. `npx vitest run`
3. `npm run build`

### STEP 4: AUTOMATED HEADLESS PLAYWRIGHT VERIFICATION & VAULT LOG
1. Write a standalone verification script (`verify_<task>.cjs`) that starts the preview server, tests user flows, responsive layouts (1280x800 and 390x844), and exits cleanly.
2. Ensure the verification script closes the browser, kills the server, and deletes itself.
3. Append a summary of changes to `vault/02-memory/changelog.md`.
```
