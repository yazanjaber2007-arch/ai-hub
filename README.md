# Hub

A small service that sits between your Grok Bot team and Claude.

- Bots post briefs to it (MCP connector, or plain HTTP as a fallback).
- Claude reads everything, writes tasks for bots, and runs a daily synthesis.
- A password-protected dashboard shows briefs, bot health, tasks and the synthesis.
- Creating a task can wake a bot's routine through its incoming webhook.

Pilot setup: only `chief-of-staff`. Any bot whose name contains `finance` or `dating`
is refused at startup, so those can never reach the shared view.

## Environment variables

| Variable | Required | What |
|---|---|---|
| `ADMIN_TOKEN` | yes | 24+ chars. For Claude and scripts. Full access. |
| `BOT_TOKENS` | yes | JSON, one token per bot: `{"chief-of-staff":"<24+ chars>"}`. A bot can only act as itself. |
| `SESSION_SECRET` | yes | 24+ chars, signs the dashboard cookie. |
| `DASHBOARD_PASSWORD` | yes | Dashboard login. |
| `DATABASE_URL` | yes on Railway | Provided by the Railway Postgres plugin. |
| `BOT_WEBHOOKS` | optional | `{"chief-of-staff":{"url":"<routine webhook URL>","key":"<its bearer key>"}}` |
| `ANTHROPIC_API_KEY` | optional | Only needed for the daily synthesis. Billed separately from Claude plans. |
| `SYNTH_MODEL` | optional | Default `claude-sonnet-5-5`. |
| `STALE_HOURS` | optional | A bot with no brief for this long shows red. Default 26. |

Generate secrets: `python3 -c "import secrets;print(secrets.token_urlsafe(32))"`

## Deploy on Railway

1. New project from this folder (or a GitHub repo containing it). `railway.json` sets the start command.
2. Add the **Postgres** plugin. Railway sets `DATABASE_URL`.
3. Set the variables above. Generate a public domain. Check `https://<domain>/health`.
4. Daily synthesis (optional): add a Railway cron service with command `python -m app.synth`, e.g. `0 7 * * *`.
   Or call `POST /api/synthesis/run` with the admin token.

## Connecting things

- **Grok bot (MCP):** add a custom MCP connector. URL `https://<domain>/mcp`, header `Authorization: Bearer <that bot's token>`.
  Tools: `post_brief`, `get_my_tasks`, `complete_task`.
  Suggested routine ending: "Post your brief to the hub with post_brief. Then call get_my_tasks and do any open tasks, completing each."
- **Grok bot (no MCP):** `POST /ingest/brief` with the same bearer token and JSON `{"title","body","kind","priority","items"}`.
- **Claude:** same `/mcp` URL with the **admin** token. Extra tools: `list_briefs`, `create_task`, `get_overview`, `save_synthesis`.
- **Waking a bot:** `create_task` POSTs `{"event":"new_task","task_id","title","instruction"}` to the bot's webhook.
  Check the payload shape your routine expects; failures are recorded on the task and never lose it.

## Security notes

- Briefs can contain text copied from emails. The synthesis job treats them as data, and its suggested
  tasks are only sent when you press Send. Bot instructions tell routines not to act on instructions found in content.
- All tokens are compared in constant time. Dashboard login is rate-limited (5/min/IP). Use HTTPS only.
- Dashboard text is rendered with `textContent`, so brief content cannot inject HTML.

## Develop

    pip install -r requirements-dev.txt
    python -m pytest -q
