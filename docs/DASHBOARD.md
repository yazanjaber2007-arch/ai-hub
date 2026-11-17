# The Command Center

`/command` is the live dashboard. `/demo` is the same thing with sample data, safe to share.

## Controls

| Control | What it does |
|---|---|
| **Eye** (`P`) | Privacy blur for sensitive bots (finance by default). Off by default; remembered per browser. |
| **Speaker** (`S`) | Interface sounds. Off by default. Synthesised in the browser (no audio files), soft, and silent until you turn them on. |
| **Expand** (`A`) | Ambient mode: the wall display (below). |
| **Search or command** (`Ctrl/Cmd K`, `/`) | Command palette. In the live dashboard, `task <bot> <what to do>` gives a bot a task. |
| **Executive briefing** | Today in five lines. Sensitive items are hidden when privacy is on. |
| **Approve / Decline** | Only a logged-in dashboard session can decide an approval. The bot is woken with the answer. |

The palette also switches the core between the **3D hologram** (default on desktop) and the **flat 2D** version (default on phones,
and the automatic fallback when WebGL is missing or the device is too slow).

## Boot sequence

On the first load in a browser tab the dashboard plays a ~2 second start-up: the rings draw, the core ignites, every real bot
reports in, then the panels fade in as a light ring passes over them. Press any key or tap to skip.
It is skipped on reload within the same tab, with reduced-motion on, and in ambient mode. After sign-in it plays once.

- `?boot=1` plays it again, `?boot=0` never.

## Ambient mode (wall display)

A calm, full-screen display for a spare monitor, a tablet on a stand or a TV: big clock, the 3D core, the next thing with a
countdown, today's priorities, and a slow carousel of feed items, approvals and numbers.

- **Nothing from a sensitive bot is shown.** It is left out, not blurred: its approvals read "Private item", and its events,
  priorities, numbers and feed items never appear.
- Keeps the screen awake (where the browser allows it), drifts a few pixels over 12 minutes so nothing burns in, dims after 22:00
  until 06:30, and caps the frame rate.
- If data stops arriving it says so quietly (top-left): *Connection lost · retrying* or *Data is 7m old*. If the login ends:
  *Session ended · tap to sign in*.
- Leave with `Esc`, `A`, or the button that appears when you move the mouse or tap.
- Open it directly with **`/command?ambient`** or **`/command#ambient`** (bookmark this on the wall device).
- The login lasts `SESSION_HOURS` (default 24 hours). For a wall display set `SESSION_HOURS=720` (30 days) in Railway.

## URL options

| Option | Effect |
|---|---|
| `?name=Alex` (demo only) | Greets the visitor by name |
| `?ambient` / `#ambient` | Start in ambient mode, no boot sequence |
| `?boot=0` / `?boot=1` | Never / always play the boot sequence |
| `?alert` (demo only) | Start with a bot silent, to see the alert state |

## Shortcuts

`Ctrl/Cmd K` or `/` palette · `P` privacy · `S` sounds · `A` ambient · `Esc` close or leave ambient.

## Accessibility and fallbacks

- Respects `prefers-reduced-motion`: no boot sequence, no looping animation, a static fully-formed 3D core.
- All controls are keyboard reachable with a visible focus ring; touch targets are at least 44px on phones and tablets.
- No WebGL, a lost graphics context, or a slow device: the core falls back to the flat 2D canvas automatically.
- Text is at least 12px; changing numbers use tabular figures and count smoothly to their new value.

## What the 3D core shows

The center is the hub; every bot is a satellite on its own orbit. A bot that reports sends a pulse to the core. Silent bots turn red,
a bot that has never reported is dim, and when anything needs attention the core turns amber. Hover a satellite (or its roster row)
for details, click it to pin them, drag to rotate, double-click to reset.
