# R0 — what I click (stabilize and document)

R0 changed **no product behaviour**. It gave the project accurate documentation, resolved the three
stale tests, and built the one-command verification harness you asked for. So there is nothing new to
click inside the website — here is what to run, and what to expect. About 10 minutes.

## 1. The one command

```bash
npm ci
npm run verify
```

- First run: 5-15 minutes (builds the app, installs the test browser, downloads a disposable
  MongoDB). Later runs: under a minute.
- It uses its own throwaway database. Your real data is never touched — the command deliberately
  replaces `MONGODB_URI` with an invalid address for the run.
- When it finishes it prints, for example:
  `=== INCOMPLETE: 5 PASS, 0 FAIL, 6 NOT TESTED (of 11) ===`
  and writes `verify-report.md`, `screenshots/r0/` and **`verify-output.zip`**.
- **Send me `verify-output.zip`.** On your machine all 11 lines should be ✅ PASS.

Useful variants:

```bash
npm run verify -- --milestone=r1     # only one milestone
npm run verify -- --skip-app         # unit tests only, no database/browser, ~20 s
npm run verify -- --port=3200        # if port 3111 is busy
```

## 2. Look at the website yourself (optional, 5 minutes)

```bash
npm run test-mode
```

1. Wait for `Open http://localhost:3000/bn/admin`.
2. Sign in: `demo-admin@example.test` / `DemoOnly-2026!`.
3. Check the **টেস্ট মোড** banner at the top — it means the data is disposable.
4. Click **শিক্ষার্থী** → **স্প্রেডশিট প্রিভিউ** → choose
   `tests/fixtures/Diction-Demo-Payment-Sheet.xlsx` → **সব ট্যাব দেখুন**. You should see 2 tabs,
   17 students and a raw total of ৳226400.
5. Make your phone window narrow (or press F12 → device toolbar → 360 px) and confirm nothing scrolls
   sideways.
6. Ctrl+C stops it and erases everything.

## 3. What to read (10 minutes)

1. **`docs/STATUS.md`** — start here. What actually works, what is only claimed, and §4
   "Documentation says / code does" listing nine items the older documents overstated.
2. **`docs/VERIFY.md`** — how `npm run verify` works, how to read the report, what to do when a step
   fails.
3. **`docs/STALE-TESTS.md`** — the three stale tests: two repaired, one retired, each with a reason.
4. **`docs/SPEC.md`** — your brief, captured so any future agent can continue without re-briefing.
5. **`README.md`** — the new top section "Start here: verify this build in one command", with a
   failure/fix table.

## 4. বাংলায়

1. টার্মিনালে: `npm ci`, তারপর `npm run verify`। শেষে `verify-output.zip` ফাইলটি আমাকে পাঠান।
2. রিপোর্টে প্রতিটি লাইনে ✅ PASS, ❌ FAIL অথবা ⚠️ NOT TESTED লেখা থাকবে — NOT TESTED হলে কারণও লেখা থাকবে।
3. নিজের চোখে দেখতে চাইলে: `npm run test-mode` → `http://localhost:3000/bn/admin` →
   `demo-admin@example.test` / `DemoOnly-2026!` → **টেস্ট মোড** ব্যানার দেখুন → **শিক্ষার্থী →
   স্প্রেডশিট প্রিভিউ** → নমুনা XLSX → **সব ট্যাব দেখুন** (২ ট্যাব, ১৭ শিক্ষার্থী, ৳২২৬৪০০)।
4. এরপর `docs/STATUS.md` পড়ুন (বিশেষ করে §৪ ও §৯)।
5. কোনো লাইন FAIL হলে সেই লাইনটি কপি করে আমাকে পাঠান; আমি ঠিক করে সম্পূর্ণ নতুন ZIP দেব।

## 5. Decisions you already gave (recorded in `docs/STATUS.md` §6)

- Verification protocol: implemented as `npm run verify` — this document is its "what I click" list.
- R1 gets a real **`staff`** role (archive/hide, no delete) instead of reusing `content_editor`.
- The five documented-but-missing features stay in their own milestones (R1 builds only the scheduler
  its 30-day purge needs).

Still open, no rush: whether to delete the orphaned `src/components/admin/center-import-preview.tsx`.
My recommendation is to keep it until the R1 audit lists every admin screen anyway.
