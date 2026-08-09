---
name: planned-execution
description: Standard development workflow skill for coding tasks. Enforces a strict 5-step disciplined pair-programming workflow: (1) Inspect authoritative code files & present a clear plan before editing, (2) Execute changes incrementally according to the approved plan, (3) Audit top-level imports & syntax, (4) Run verification commands (npm run build/test) and fix any errors until 100% clean, (5) Provide a clear summary. Trigger whenever the user asks to modify code, add features, refactor, fix bugs, change UI/UX, or start any coding task.
---

# Planned Execution Workflow Skill

This skill governs all code modification, feature addition, refactoring, and bug fixing tasks in the codebase. It ensures high correctness, zero guessing, proper import checks, and systematic error recovery.

---

## 📋 The 5-Step Execution Workflow

### Step 1: Code Inspection & Plan Proposal (อ่านโค้ดจริง + เสนอแผนงาน)
1. **Inspect Code First**: BEFORE proposing any plan or writing code, use code search tools (`grep_search`, `view_file`) to inspect the actual target files. Never guess file paths, variable names, or component logic.
2. **Formulate Step-by-Step Plan**: Outline the exact changes to be made, including:
   - Target files to modify or create.
   - Specific functions, components, or styles being added/updated.
   - Any potential side effects on other routes or modules.
3. **Present Plan to User**: Present the proposed plan clearly in Thai to the user before editing files.

---

### Step 2: Incremental Implementation (ลงมือทำตามแผน)
1. **Follow the Approved Plan**: Execute the changes step-by-step using precise editing tools (`replace_file_content`, `multi_replace_file_content`, `write_to_file`).
2. **Preserve Existing Logic**: Keep existing comments, docstrings, and unrelated functionality intact unless explicitly asked to modify them.
3. **No Guessing**: Double-check signatures and prop names against target files before dereferencing object properties or passing parameters.

---

### Step 3: Import & Syntax Audit (ตรวจเช็คการ Import และ Syntax)
1. **Header Import Check**: Before building, inspect the top of every modified JavaScript/React file. Ensure all newly referenced components, icons, utilities, or external modules have matching `import` statements at the top of the file.
2. **Prevent ReferenceErrors**: Verify that no component or variable name is used as an undeclared symbol.

---

### Step 4: Empirical Verification & Error Recovery (ทดสอบ + แก้ไข Error จนผ่าน)
1. **Run Verification Command**: Execute the project build/verification command (e.g., `npm run build`) via `run_command`.
2. **Never Declare Success Without Verification**: Never claim a task is complete until verification succeeds cleanly with exit code 0.
3. **Strict Error Recovery Protocol**:
   - If a build error or runtime failure occurs, immediately read the full un-truncated error log.
   - Identify the verified root cause (never mask symptoms with dummy fallbacks or silent try-catch blocks).
   - Apply the fix, audit imports again, and re-run verification until 100% clean success is achieved.

---

### Step 5: Professional Synthesis & Summary (สรุปผลการทำงาน)
1. Provide a concise, polite summary in Thai markdown describing:
   - What files were modified or created.
   - What changes were made.
   - Verification status (`npm run build` passed).
