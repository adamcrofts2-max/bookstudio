# Terminal setup — run this on your own machine

Everything below is copy/paste into **Command Prompt** (cmd.exe) on Windows —
not PowerShell, and not this sandbox (which has no npm registry or git push
access, which is why none of this has been run for real yet). Right-click
the Start button → "Command Prompt", then paste each block in order.

## 0. Use the right folder

You have two copies of this project on disk:

- `C:\book studio copy` — **this is the real one.** Every phase in
  `docs/ROADMAP.md`/`docs/STATUS.md` (up to Phase 112) has been built here.
- `C:\Users\fyl\Documents\Book Studio` — an old, stale copy, stuck at
  Phase 52. Don't run installs or pushes from here — you'll fix the wrong
  copy and get confused about which one is current.

Every command below assumes you're in the first one:

```bat
cd /d "C:\book studio copy"
```

## 1. Fix a corrupted install (do this first — this is very likely why Enter still feels broken too)

**Update 2026-08-03**: confirmed directly — `npm run build` fails with
`failed to load config from vite.config.ts / SyntaxError: Invalid or
unexpected token`. `vite.config.ts` itself was checked line by line and is
clean (7 lines, no syntax errors, no stray characters). The real failure is
one level deeper: loading the config pulls in `@tailwindcss/vite`, which
pulls in the same truncated `@tailwindcss/node/dist/index.mjs` described
below — reproduced by importing that exact file directly, which throws the
identical error at the exact byte where the file cuts off.

`npm run dev` loads `vite.config.ts` the same way `npm run build` does —
so if `build` fails on this, **`dev` almost certainly has been failing to
start too.** That would mean the app you've been testing "Enter doesn't
start a new paragraph automatically" in was never actually running this
project's current code — Phases 111 and 112 (Enter-splits-paragraph,
Backspace-merges-paragraph, the auto-focus fix) may simply never have
loaded in your browser. Run Step 1 below, then restart `npm run dev` and
test again before assuming there's still a code bug.


There's a genuinely broken file already on disk in this project's
`node_modules`, confirmed by directly inspecting it:
`node_modules\@tailwindcss\node\dist\index.mjs` is truncated mid-file
(cuts off mid-string, 17,347 bytes). This is why `npm run dev`,
`npm run build`, and `npm run lint` have never actually been verified to
work — they've all been failing on this, not on anything in the app's own
code. It's a real corruption on disk, not a one-off — it's been flagged in
the project's own STATUS.md since 2026-07-31 and never fixed, because
fixing it needs real npm registry access, which only your machine has.

```bat
cd /d "C:\book studio copy"
npm ci
```

`npm ci` deletes `node_modules` and reinstalls exactly what's in
`package-lock.json` — the right tool for "something in here is corrupted,"
rather than a partial `npm install` on top of the broken state. It'll take
a few minutes. If `npm ci` itself errors out, fall back to:

```bat
rmdir /s /q node_modules
npm install
```

## 2. Install the one remaining package

Everything else the app currently uses is already installed
(`nspell`, `dictionary-en`, `dictionary-en-gb`, `@pdf-lib/fontkit` — you
installed these already, and spell-check is shipped and working). There's
one more worth adding now, for the Thesaurus / synonym-lookup feature on
the roadmap (not wired up in the code yet — this just unblocks building it
next):

```bat
npm install moby
```

`moby` is a small, offline synonym dataset (Moby Thesaurus + Open Office
Thesaurus data) from the same publisher family as the dictionary packages
you already installed — no API key, no network calls at runtime, same
"bundled data, not a live service" pattern the spell-checker already uses.

## 3. Verify everything actually works

This is the thing that's never been confirmed for real, since the sandbox
can't run any of it:

```bat
npm run build
npm run lint
npm run test
```

`npm run build` type-checks the whole project and bundles it — should
finish with no errors. `npm run lint` runs oxlint — should finish clean or
close to it. `npm run test` runs the smoke tests. If any of these fail,
copy the error output back to me and I'll fix it in the next session.

Once `npm run build` succeeds, you can also actually run the app locally:

```bat
npm run dev
```

then open the URL it prints (usually `http://localhost:5173`) in your
browser — this is the first time this app will have been genuinely
click-tested since the sandbox can't do it.

## 4. Push everything to GitHub

Every commit through Phase 112 is sitting locally in this repo, unpushed —
the sandbox has no push access, so none of this session's work (or several
sessions before it) has reached GitHub yet.

```bat
git fetch origin
git status
```

Read what `git status` says:

- **"Your branch is ahead of 'origin/master' by N commits"** → you're safe
  to push:
  ```bat
  git push origin master
  ```
- **"have diverged"** → stop and tell me before pushing — that means
  something changed on GitHub that isn't in this local history, and a
  plain push could overwrite it. Don't force-push.

## Optional: security advisory cleanup

Low priority, not blocking anything — `docs/ROADMAP.md`'s Phase J flags
some `react-router` npm audit advisories. You can see what they are with:

```bat
npm audit
```

No need to act on this now; just flagging that it's there if you want to
look.
