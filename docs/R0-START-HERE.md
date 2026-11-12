# R0 — what I click (stabilize and document)

R0 changed **no product behaviour**. It is documentation, test wiring and an honest cold-start run.
So there is nothing new to click in the website — here is what to run, and what to expect.

## On your machine (normal internet)

```bash
# 1. fresh extract of the ZIP, then:
npm ci
npx playwright install chromium        # once, only needed for browser tests

# 2. everything that needs no database (31 suites, ~15 s)
npm test

# 3. the one-command disposable app + database
npm run test-mode
#    → http://localhost:3000/bn/admin
#    → demo-admin@example.test / DemoOnly-2026!
#    First run downloads MongoDB (~90 MB); wait for "Ready".
```

Expected result of step 3: a test banner in the admin, two class groups (ক্লাস ৭, ক্লাস ৯ BS), and
everything disappearing when you press Ctrl+C.

## To read (10 minutes)

1. `docs/STATUS.md` — what actually works, what is only claimed, and the 9 documented-but-missing
   items (§4). **Start here.**
2. `docs/STALE-TESTS.md` — the three stale tests: two repaired, one retired, each with a reason.
3. `docs/SPEC.md` — your brief, captured so any future agent can continue without re-briefing.
4. `test-results/r0-verification.txt` — today's raw evidence, including the one step that is
   blocked in the agent sandbox and why that is not a product defect.

## বাংলায় — আমি কী ক্লিক করব

1. ZIP থেকে বের করে টার্মিনালে: `npm ci`, তারপর একবার `npx playwright install chromium`।
2. `npm test` চালান — ৩১টি ইউনিট টেস্ট, ডাটাবেস লাগবে না, সবুজ হওয়ার কথা।
3. `npm run test-mode` চালান — প্রথমবার MongoDB ডাউনলোড হবে, কয়েক মিনিট লাগতে পারে।
4. ব্রাউজারে `http://localhost:3000/bn/admin` খুলুন; `demo-admin@example.test` / `DemoOnly-2026!`
   দিয়ে ঢুকুন। টেস্ট ব্যানার দেখলে বুঝবেন এটি একান্তই পরীক্ষার ডাটাবেস — বন্ধ করলেই সব মুছে যাবে।
5. এরপর `docs/STATUS.md` পড়ুন (বিশেষ করে §4 "Documentation says / code does" ও §8 সারাংশ)।

## Your decision before R1

`docs/STATUS.md` §6 lists three questions (the orphaned import component, the five documented-but-
missing features, and the two unreproducible PASS claims). R1 (delete / archive / Recycle Bin) can
start without answers, but §6.2 affects what R1 must not duplicate.
