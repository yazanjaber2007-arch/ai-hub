# Handoff: the Command Center (hub + dashboard)

Written 2026-11-21 at the end of a long session, so a new Claude session can continue without that chat.
Code state when this was written: commit `468fa78` ("Add per-bot detail drawer…"), deployed to production and verified on 2026-11-18.
**Updated 2026-11-21** by a local session on the owner's Windows PC: see section 9 (local setup) and the status notes in section 7.

How to read this: **Confirmed** means I saw it happen in this session (a test, a deploy, a screenshot or message from the owner).
**Guess** and **Unverified** mark things I inferred or could not check. This repo is **public**, so personal details are left out on purpose.

## 1. What we're building, and why

The owner runs a team of AI assistants in an app called **Grok Bot** (desktop and phone). Each bot has one job and runs scheduled
routines using connectors such as Gmail, Google Calendar, Drive and Buffer. The owner wanted a real connection between that team and
Claude: Claude does the heavy development and strategy, the Grok bots do the automations and everyday tasks. They did not want to rebuild the bots.

Two pieces exist:

1. **The hub** (this repo, `app/`): a small FastAPI service on Railway with Postgres. Bots push briefs, structured snapshots and approval
   requests to it over HTTPS with a per-bot bearer token. Claude can read everything and create tasks over MCP (`/mcp`, admin token).
   A task can wake a bot's routine through that bot's incoming webhook.
2. **The Command Center** (`/command`, sources in `app/static/src`): a Jarvis-style dashboard on top of the hub. Boot sequence, 3D hologram
   core with the bots orbiting it, roster, "Needs you" approvals, feed, timeline, metrics, finance, vitals, reporting grid, command palette,
   ambient wall-display mode, interface sounds, and a per-bot detail drawer. It is used on desktop (open all day) and iPhone.

The longer-term goal the owner stated: make the dashboard good enough that they rarely open the real bank, Gmail or other apps. They want
to see the full data for any source, reply to emails and ask questions from the dashboard, and have a Claude model answer in the text box.
Cosmetics came first; connectors and the AI chat box come next (section 7).

## 2. Decisions made, and why

| Decision | Reason |
|---|---|
| Hub on Railway with Postgres | The owner already runs another small service there (about $5/month), so nothing new to learn. |
| Bots post by plain HTTPS (`/ingest/*`) with their own token, not through the MCP connector screen | Confirmed: Grok Bot's connector screen only accepts a token typed as plain text. The bot keeps its token in a masked `HUB_TOKEN` field and calls the hub directly. |
| One token per bot; a bot can only act as itself | Limits damage if one token leaks. Tokens live in the `BOT_TOKENS` env var (JSON). |
| Approvals can only be decided from a logged-in dashboard session; bearer tokens, even the admin token, get 403 | Anything that posts, pays or sends must be a human decision. Deciding creates an `APPROVED:`/`DECLINED:` task for the bot. |
| Finance is allowed on the dashboard | The owner said so explicitly (the earlier exclusion came from a bot's own prompting). Bots named `dating…` are still refused at startup (README). |
| The finance bot is read-only | Its own choice: it will not pay, transfer or cancel even if told "APPROVED". We kept that. Finance therefore never produces items in "Needs you". |
| Privacy blur is **off** by default, toggled with the eye button; `SENSITIVE_BOTS` (default `finance`) sets which bots blur | Owner asked for finance to be shown normally, with blur as an option. |
| No daily synthesis job | Owner declined: the bots already send enough reports. The code exists (`app/synth.py`, needs `ANTHROPIC_API_KEY`) but is not scheduled. |
| An "Ask Claude" tool is wanted, but only after the owner upgrades their Claude plan | Owner's words: implement it when they upgrade. It would bill API credits. Not built. |
| Greek-myth names with the job beside them: Zeus (chief-of-staff), Hermes (inbox), Apollo (social), Atlas (fitness), Midas (finance), Athena (personal), Hephaestus (shop bots) | Owner asked for it; Atlas, Midas and Athena were picked by the owner over my first suggestions. Bot ids, tokens and webhooks never change; `BOT_NAMES` overrides. |
| One source tree builds three pages: live, demo, preview (`app/pages.py`) | The public demo can be shared with friends. The demo/preview builds physically exclude login and API code, and a test enforces it. |
| Motion on by default; sound off by default; 3D core on desktop, flat 2D on phones | Owner wants it animated all day. Sound is opt-in. Phones save battery. |
| A performance governor (auto / battery saver / full) plus a quality ladder that falls back to 2D | Owner asked how to keep the effects without overworking whatever machine they use. |
| Self-hosted fonts and the 3D bundle; strict CSP; no third-party requests | Safe for a wall display and a public demo. |
| Snapshots replace the previous one; the hub also keeps a pruned history (90 days, max 400 rows per bot) | Trends in the detail drawer are drawn from that history. |
| Recommended (not formally agreed): the bank is read-only on the dashboard, money never moves from it, and every side effect is approval-gated | I proposed this when the owner described the end goal. They did not object; treat it as the default and confirm before building connectors. |

## 3. What's done, half-done, not started

**Done (all deployed, all tested):**
- Hub: ingest endpoints, per-bot auth, tasks with webhook wake, approvals, audit trail, MCP server, snapshot history, `GET /api/bots/{bot}`.
- Dashboard: real data in every panel, approve/decline, 30-second refresh, command palette (`task <bot> …`, `Open <name>`), executive briefing,
  privacy toggle, boot sequence, ambient wall display, interface sounds, 3D hologram core with fallbacks, performance governor,
  per-bot detail drawer (macros, vitals, finance, events, priorities, free-form tables, activity log, briefs in full, tasks, approvals, 30-day trends and reporting).
- Public demo (`/demo`) and developer preview (`/preview`) with sample data.
- Security headers/CSP, tests: 77 pytest tests and 149 browser checks across six scripts (all passed on 2026-11-18).
- Docs: `README.md`, `docs/CONNECT_A_BOT.md`, `docs/DATA_CONTRACT.md`, `docs/DASHBOARD.md`.

**Half-done:**
- Real bots send only part of what the drawer can show. Fitness does not yet send macros, a workout log, step goal, recovery or streak
  (the drawer shows a "Not sent yet" note). Paste-in text for this is at the bottom of `docs/DATA_CONTRACT.md`. Other bots could use `sections` and `log` too.
- Instant wake-up (webhook) is configured for chief-of-staff only.
- Visual quality was checked only in headless software-rendered Chromium, never on the owner's real screen or phone (see section 6).

**Not started:**
- Live connectors straight into the dashboard (Gmail, calendar, bank), the AI chat box, "see the full source data" views.
- Phone-app feel: home-screen icon, standalone launch, notifications.
- "Round 3" of the wow-factor list, read-aloud, voice commands, phone tilt effect. The owner deferred these. The exact contents of round 3 were in the chat and are not recorded here.
- Connecting the remaining bots (section 4).
- The "Ask Claude" tool and the daily synthesis schedule.

## 4. Which bots are connected and reporting

Source for everything in this section: what the owner pasted or screenshotted during the session (about 2026-11-17 to 11-18).
**Unverified since:** this session had no admin token for production, so I could not read live data on 2026-11-21. Check by signing in to `/command`
and looking at the roster (waiting / idle / working / silent), or call `GET /api/dashboard` with the admin token.

| Bot (dashboard name) | Status | What I know |
|---|---|---|
| `chief-of-staff` (Zeus) | Connected, reporting | First bot connected. Posts a morning check-in around 8 AM US Eastern and sends a snapshot with today's calendar events and priorities, which fills the Timeline and the "Coming up" countdown (owner's screenshot). The only bot with an instant webhook; end-to-end test passed (task created → bot woken → result posted, 2026-11-17). |
| `fitness` (Atlas) | Connected, reporting | First report confirmed (snapshot, an alert, and a task check all returned 200). Sends steps, sleep, resting heart rate and a workouts-this-week count. It deliberately leaves out step goal, recovery and streak because it has no real source. Its alert said workout sets and calorie totals had not been logged for days. Reporting is in the morning plan routine (about 8:15–8:25 AM), the Sunday review and the health-data intake. No macros or workout log yet. |
| `finance` (Midas) | Connected, reporting | Token added; hub reporting added to its daily recap (about 7:55 AM ET) and monthly report (first of the month). Sends balance, 30-day trend, category shares and upcoming bills only: no account numbers, card numbers or transaction lists. Read-only by its own rule, no approvals. A test snapshot was requested and a later status check listed it as reporting. |
| `social` (Apollo, "Jarvis Growth") | Connected, reporting | Sends tiles from Buffer: reel views, TikTok views, videos posted, top post, best TikTok watch time, last post date. No follower counts (the bot says Buffer does not provide them). |
| `personal` (Athena) | Connected, reporting | Set up late in the session; its open items show in Metrics and its events in the Timeline. It posts bank-related items. **Owner decided 2026-11-21: Athena is not a sensitive bot**; `SENSITIVE_BOTS` stays `finance` (confirmed live: `personal` has `sensitive: false`). Don't change it without asking. |
| Inbox Manager (would be `inbox`, Hermes) | **Not connected** | The owner named it among the four bots they wanted to watch first. No token exists for it. |
| A Shopify/store bot (would be Hephaestus) | **Not connected** | |
| A third bot the owner called "dr eggbot" | **Not connected** | I don't know what it does. |
| Dating bot | **Never** | The hub refuses any bot whose name contains `dating`. |

Test data is different from production: the browser tests and the `/demo` page use five sample bots including `inbox` (Hermes) and no `personal`.
Do not mistake the rich demo drawer for what production shows.

## 5. Production and operations facts

- Site: `https://ai-hub-production-0db25e10.up.railway.app` (`/command` live, `/demo` public, `/health`). Railway project with the `ai-hub` service and a PostgreSQL service.
- Railway env var **names** (values are secrets, never in the repo): `ADMIN_TOKEN`, `BOT_TOKENS`, `BOT_WEBHOOKS`, `SESSION_SECRET`, `DASHBOARD_PASSWORD`,
  `DATABASE_URL` (reference to the Postgres service), `OWNER_NAME`, `SENSITIVE_BOTS`, optional `BOT_NAMES`, `SESSION_HOURS`, `STALE_HOURS`, `ANTHROPIC_API_KEY`. See the README table.
- Adding a bot: edit `BOT_TOKENS` in Railway, deploy, put the same secret in the bot's masked `HUB_TOKEN` field, paste the routine text from `docs/CONNECT_A_BOT.md`. The owner has done this four times, following step-by-step instructions.
- Deploys were triggered through Railway's GraphQL API after each `git push origin main` (details in `CLAUDE.md`). **Unverified:** whether Railway also auto-deploys on push.
- The Railway API token the owner created for deploys is held by the session environment, not by the repo. The owner should revoke it when Claude no longer needs to deploy.
- Railway trial credit was about $4.71 with about 18 days left when last seen (around 2026-11-17). **Guess:** it expires in early December; check it.

## 6. Known issues and bugs

1. **No real-device review yet.** All screenshots and performance checks came from headless Chromium with software WebGL. How the 3D core, hover behaviour and the performance governor feel on the owner's machine and iPhone is unknown. The owner said on 2026-11-20 that they had signed in from their home computer, but gave no visual feedback in this session.
2. The orbit labels for two satellites can overlap when they are close (accepted, they drift apart).
3. The drawer's trends only have data since history started being saved (2026-11-18). Flat series are hidden on purpose, so most trend cards will be empty for the first days.
4. Clicking a 3D satellite opens the drawer through the same `select` event as the roster, but no browser test clicks a 3D satellite (roster click and palette are tested).
5. The old plain dashboard is still served at `/` (`app/static/index.html`, uses `/api/overview`). Kept until the owner retires it.
6. The repo is public (the owner made it public to connect Railway). Recommended: make it private again and confirm Railway still has access through its GitHub app. **Unverified:** I did not scan the full git history for secrets; tests and docs use made-up values only.
7. A real bot only reaches the dashboard at its next scheduled run, except chief-of-staff (webhook). Tasks given to other bots wait for their next routine.
8. Social has no follower counts, fitness has no recovery/streak/macros, finance has no approvals. These are gaps at the source, not dashboard bugs.
9. `tests/e2e/README.md` still lists only four scripts (ambient, a11y, core, live); `perf.js` and `detail.js` were added later and are run by `run-all.sh`.
10. The production smoke test (12 checks: health, assets served with brotli and immutable caching, fonts, CSP, signed-out gate shows no data, demo drawer opens) lived in the session's scratch folder and is **not in the repo**. It must be recreated.
11. Browser tests: the idle-refresh check was flaky when a bot's state changed on a time boundary (now retries over three windows). Re-using a test hub on port 8801 can break login (rate limit) and re-seed, so start from a fresh database.
12. **Intermittent a11y failure, not root-caused (found 2026-11-21 on Windows).** `a11y.js` "hovering roster rows does not move them" fails in about 3 of 11 runs:
    the first roster row reads `~498.6 -> 419.77` (always exactly 419.77, so it's a second layout state, not noise; position stays `static`). Seen in full
    `run-all.sh` runs and when `a11y` runs twice on one hub; never in 4 runs of `a11y` alone on a fresh hub or in 2 instrumented runs after `ambient`
    (those logged no `lite` class, `scrollY` 0, left-column panel sizes unchanged). Not yet ruled out: that the new pre-hover in the test plays a part
    (0 of 3 runs before that change showed it, which is too few to tell). It may be a real UI bug (this check exists because a class clash once threw a row
    out of the layout). A separate, understood failure is fixed: the first pointer move tilts the left column (glass-wall parallax, `--mx`), moving rows
    about 1.56 px on Windows, just over the 1.5 px limit. The test now settles the parallax before measuring.

## 7. Next steps, in order

1. **Check the live site with the owner.** Sign in, confirm the five bots show sensible states, confirm `SENSITIVE_BOTS` includes `personal`, and ask for feedback from the real-device review. Fix whatever they report first.
   *Status 2026-11-21:* checked from outside: `/health` 200, `/api/dashboard` 401 signed out, `/command` shows only the sign-in box, `/demo` loads with no console errors and its drawer opens, the versioned bundle is served `br` + `immutable`.
   **Signed-in check, 2026-11-21 ~14:35 UTC (Confirmed, read from `/api/dashboard` in the owner's signed-in browser pane):**
   - Zeus (`chief-of-staff`) and Athena (`personal`) reported that day: `idle`, healthy.
   - **Midas (`finance`), Atlas (`fitness`) and Apollo (`social`) are `silent`: no report since 2026-11-17, all within 15 minutes that afternoon** (the setup-day test posts).
     So section 4's "reporting" was only true for the setup test; their scheduled routines are not reaching the hub. The hub does not log failed bot auth,
     so the cause must be checked in Grok Bot (each routine's run history: does the hub step run, and what does the HTTP call return?).
   - **`personal` is not in `SENSITIVE_BOTS`** (`sensitive: false`), so Athena's bank-related items are not blurred by the privacy toggle. **Owner's decision (2026-11-21): leave it.** Athena does not need to be sensitive; no Railway change.
2. **Fill the drawer with real data.** Walk the owner through pasting the fitness lines (bottom of `docs/DATA_CONTRACT.md`). Then decide per bot what useful `sections`/`log` rows it can send (workouts, top posts, accounts, open items). Test each with a snapshot post.
3. **Housekeeping:** revoke the Railway deploy token when deploys are done, make the repo private, check Railway credit, consider `SESSION_HOURS=720` for the wall display.
   *Status 2026-11-21:* **waiting on the owner.** They chose to do the Railway items later (trial credit, revoking the old deploy token);
   making the GitHub repo private (and confirming Railway still deploys from it) is also still open. Last known credit: ~$4.71 with ~18 days left on 2026-11-17,
   so it may run out around early December (**guess**); when it does, the hub stops. Note: once the cloud deploy token is revoked, no Claude session can deploy until the owner creates a new token (or deploys from the Railway dashboard / auto-deploy on push).
4. **Phone-app feel:** web app manifest, home-screen icon, standalone launch, safe-area polish. Notifications are harder (iOS web push) and need a decision. Not started.
5. **Connect the remaining bots**, one at a time, in the order the owner chooses (Inbox Manager first is a guess, based on what they said they wanted to watch).
6. **Phase 2, the owner's stated next goal after cosmetics:** (a) live connectors for Gmail, calendar and the bank; (b) a Claude model behind the text box; (c) "full information" views per source (whole inbox for personal, full health data for fitness). Before building, get answers to two open questions: is a **capped-budget API key** acceptable, and should **Gmail connect directly or only through the bots**. Keep my default: read-only bank, nothing moves money, every send/pay/post waits for approval in "Needs you".
7. **Deferred by the owner:** wow-factor round 3, read-aloud, voice commands, phone tilt effect. Ask before starting.

## 8. How the owner likes to work

- Not a developer. Give exact click-by-click steps, one bot or one step at a time, and say what they should see. Never ask them to paste a secret in chat; secrets go into masked fields or Railway variables.
- For cosmetic work they asked for autonomy: do it, review at the end, don't interrupt for small decisions. For anything that spends money, connects a new account, or sends/posts on their behalf, ask first.
- They like to see a preview before a big build, and they react well to screenshots.

## 9. Local setup on the owner's Windows PC (added 2026-11-21)

Clone: `C:\Users\Owner1\Projects\ai-hub`. Windows 11, Git Bash + PowerShell. Confirmed in that session:

- **Python 3.12.10** (not 3.13; there is no `python3` command, only `python`/`py`, and `python3` opens the Microsoft Store). Venv at `.venv`
  (git-ignored). **pytest: 77 passed** on 3.12 after the line-ending fix below.
- **Line endings:** Git for Windows sets `core.autocrlf=true`, which gave every file CRLF and broke `test_bundle_is_served_precompressed`
  (`hologram.js` no longer matched its `.gz`). Fixed with `.gitattributes` (`eol=lf`), commit `c2109bc`. No file content changed.
- **Installing `mcp` through the Claude Code sandbox proxy fails** (`ChunkedEncodingError` on `https://pypi.org/simple/mcp/`; the proxy truncates that large page).
  Workaround: install the wheel by URL (from `https://pypi.org/pypi/mcp/json`), then `pip install -r requirements-dev.txt`. Installed: `mcp 1.30.0`,
  fastapi 0.165, SQLAlchemy 2.1, pydantic 2.14, anthropic 2.12. A normal terminal outside the sandbox probably doesn't have this problem (**guess**).
- **Browser tests:** no global `playwright` package, but the global `@playwright/cli` bundles `playwright` 1.65, which matches the Chromium already
  downloaded (`%LOCALAPPDATA%\ms-playwright\chromium-1252`). Run from Git Bash:
  `NODE_PATH="$(cygpath -m "$(npm root -g)")/@playwright/cli/node_modules" PYTHONUTF8=1 PYTHON=.venv/Scripts/python.exe bash tests/e2e/run-all.sh`.
  `run-all.sh` now accepts `PYTHON` and converts its temp path with `cygpath` (Windows Python can't open `/tmp/...`).
  Result on 2026-11-21: ambient 26, core 16, perf 11, live 25, detail 44 all pass every time; a11y 27/27 in some runs and 26/27 in others (known issue 12).
  If a run leaves the hub on port 8801 running, stop it: `netstat -ano | grep ":8801 .*LISTEN"`, then `taskkill //PID <pid> //F`.
- **Not available here:** no Railway token or Railway CLI (so no deploys from this PC; ask the owner), no `gh` CLI. The real-device review (real GPU) is
  possible on this PC, but only the owner can judge it on their screen.
- Git author for commits from this PC is set per repo to `Claude <noreply@anthropic.com>` (same as all earlier commits; keeps personal email out of the public repo).
