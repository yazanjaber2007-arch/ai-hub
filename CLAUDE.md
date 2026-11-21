# CLAUDE.md

Project: the **hub** (FastAPI + MCP + Postgres on Railway) and the **Command Center** dashboard on top of it.
Read `HANDOFF.md` first for what this is, what is done, which bots are live, known issues and next steps.
This repo is **public**: never commit secrets, real data, personal details or screenshots of the live dashboard.

## Stack

- **Server:** Python 3.13, FastAPI + uvicorn, SQLAlchemy 2 (SQLite locally, Postgres on Railway via `psycopg`), `mcp` (streamable HTTP at `/mcp`), pydantic strict schemas, `itsdangerous` for the session cookie, `anthropic` (only used by the optional `app/synth.py`).
- **Page:** plain HTML/CSS/JS, no framework. Sources in `app/static/src` (`shell.html`, `css/*.css`, `js/*.js`, `hologram/`). Only the 3D bundle (three.js) is built, with esbuild.
- **Tests:** pytest for the server; Playwright (Chromium) scripts for the browser.
- **Hosting:** Railway, `railway.json` sets the start command and `/health` check.

## Where things are

| What | Where |
|---|---|
| Routes (`/ingest/*`, `/api/*`, `/command`, `/demo`, `/preview`, `/assets/*`, `/mcp`) | `app/main.py` |
| Business logic (briefs, tasks, snapshots, approvals, history, `bot_detail`, `dashboard`) | `app/core.py` |
| DB models (Brief, Task, Approval, SnapshotRow, SnapshotHist, Audit) | `app/db.py` |
| Strict request schemas (unknown keys are rejected) | `app/schemas.py` |
| Settings from env vars, bot name personas | `app/config.py` |
| Page assembler (three builds: live, demo, preview) | `app/pages.py` |
| MCP tools | `app/mcp_server.py` |
| **Data contract (what bots send)** | `docs/DATA_CONTRACT.md` |
| How to connect a bot, with paste-in text | `docs/CONNECT_A_BOT.md` |
| Dashboard controls, shortcuts, URL options, performance | `docs/DASHBOARD.md` |
| Env vars and deploy steps | `README.md` |
| Unit tests / browser tests | `tests/test_hub.py` / `tests/e2e/*.js` |

## Run it locally

```bash
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt
export DATABASE_URL=sqlite:///hub.db COOKIE_SECURE=0 HUB_DEV=1 SENSITIVE_BOTS=finance
export ADMIN_TOKEN=<24+ random chars> SESSION_SECRET=<24+ random chars> DASHBOARD_PASSWORD=<anything>
export BOT_TOKENS='{"chief-of-staff":"<24+ random chars>","fitness":"<24+ random chars>"}'
python3 -m uvicorn app.main:app_factory --factory --port 8801
```

Open `http://localhost:8801/demo` (no login) or `/command` (log in with `DASHBOARD_PASSWORD`). Use throwaway values; never reuse production secrets.
`*.db` is git-ignored. `HUB_DEV=1` rebuilds the page when a source file's mtime changes (`touch` files after moving them); Python route changes need a server restart.
Rebuild the 3D bundle after editing `app/static/src/hologram/`: `cd tools/assets && npm install && npm run build`, then commit the outputs in `app/static/assets/`
(`hologram.js`, `.gz`, `.br`). Railway does not build them.

## Run the tests

```bash
python3 -m pytest -q                 # 77 tests, a few seconds
bash tests/e2e/run-all.sh            # 149 browser checks in 6 scripts, a few minutes
```

`run-all.sh` starts its own throwaway hub on port 8801 with made-up secrets and a temp database, seeds it, runs `ambient`, `a11y`, `core`, `perf`, `live`, `detail`, and stops it.
Stop anything else on port 8801 first. Chromium and Playwright are needed (`npm install -g playwright && npx playwright install chromium`; preinstalled in the cloud sandbox).
A single script can run against a running test hub: `HUB=http://localhost:8801 node tests/e2e/detail.js`.

## Deploy

1. Run both test suites and **read the results** (see rules). Commit and `git push origin main`. Work happens on `main`; no pull-request flow has been used here.
2. Trigger the deploy with Railway's GraphQL API (`https://backboard.railway.com/graphql/v2`). The real token is not in the repo or in your shell: the session environment holds it as a credential and the proxy injects it,
   so requests carry a placeholder header. If it is missing, ask the owner for a new one with `request_credential`, never in chat.
   ```
   curl -sS https://backboard.railway.com/graphql/v2 -H "Content-Type: application/json" -H "Project-Access-Token: injected-by-proxy" \
     -d '{"query":"mutation { serviceInstanceDeployV2(serviceId: \"<service id>\", environmentId: \"<environment id>\", commitSha: \"<full sha>\") }"}'
   ```
   It returns a deployment id. Poll `{ deployment(id: "<id>") { status } }` until `SUCCESS` (BUILDING, DEPLOYING, SUCCESS; about 1 to 2 minutes). Stop on `FAILED` or `CRASHED`.
3. The ids are deliberately not stored in this public repo. **Guess:** a project token can look them up with `{ projectToken { projectId environmentId } }` and then the project's services; otherwise read them from the Railway dashboard.
4. Verify from outside: `/health` is 200, `/api/dashboard` without login is 401, `/command` shows only the sign-in gate when signed out, `/demo` loads with no console errors, assets are served with `immutable` caching.
   Open `/demo`, click a bot and confirm the drawer opens.
5. If env vars changed in Railway (bot tokens, `SENSITIVE_BOTS`, …), a redeploy is needed. A bad `BOT_TOKENS` JSON fails the health check and the old version keeps running.

## Rules for future sessions

1. **Secrets:** never write a token, password or key into any file, log, chat or commit, and never ask the owner to paste one into chat. Tokens go in Railway variables or a bot's masked `HUB_TOKEN` field. Test secrets in `run-all.sh` are made up; keep it that way.
2. **Approvals stay human.** Only a logged-in dashboard session may decide an approval; bot tokens and the admin token must keep getting 403. Anything that sends, pays, posts or deletes needs an approval first. Finance stays read-only unless the owner changes it deliberately. Bots named `dating…` stay refused.
3. **Never deploy on a failing test.** Read the pytest and browser results before committing or deploying; do not chain `grep … && git commit && deploy`. A flaky test is fixed, not ignored.
4. **Demo and preview builds must contain no live code.** Code between `/*LIVE-START*/ … /*LIVE-END*/` (also `<!--LIVE-->`) is stripped from them, `/*DEMO-START*/ … /*DEMO-END*/` from live. A test fails if the demo page contains `/api/`, even inside a comment, so do not write that string in shared files.
5. **JS is concatenated into one global scope in filename order.** Number new files so dependencies load first (a module that uses `Ambient` must come after `70-ambient.js`; `75-perf.js` exists because of that). Reordering causes "Cannot access X before initialization".
6. **Render bot-supplied text with `textContent` (the `el()` helper), never `innerHTML`.** The only `innerHTML` uses are static SVG built from computed numbers.
7. **Respect the design contract:** no text under 12px, 44px touch targets on touch screens, a visible focus ring, dialogs trap and restore focus, `prefers-reduced-motion` honoured, motion on by default, sound off by default, privacy blur off by default. Run `a11y.js` after UI changes.
8. **Performance matters:** the dashboard runs all day. Keep idle cost low, keep the governor (`75-perf.js`) and the `html.lite` fallback working, and never make the 3D core hard-fail (it must fall back to 2D).
9. **Change the data contract in one go:** a new snapshot field means `app/schemas.py`, `app/core.py` if needed, the drawer/panels, a test, and `docs/DATA_CONTRACT.md` (and the paste-in text if bots must send it). Keep `docs/` and `tests/e2e/README.md` in sync with behaviour.
10. **Production data is private.** Do not put real bot output, balances, health numbers or screenshots of the live dashboard into the repo or into docs. Use sample data.
11. **Ask before spending or connecting.** Ask the owner before adding an API key, a paid service, a new account connection, or anything that acts on their behalf. For cosmetic work they want autonomy and few questions.
12. **Walk the owner through Railway and Grok Bot steps one click at a time** and say what they should see after each step. They are not a developer.
13. **Environment quirks (Claude Code sandbox):** long shell heredocs were sometimes blocked by the safety checker (write a file with the Write tool, then run it); keep scratch scripts outside the repo; the Railway and GitHub calls go through the sandbox proxy.
14. Verify UI work by actually loading it (Playwright screenshot plus console errors), and say plainly what you could not verify (real GPU, real iPhone).
