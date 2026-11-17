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

## Bot names

Every bot has a Greek god's name and its job in plain words: **Zeus** (chief of staff), **Hermes** (inbox), **Apollo** (social growth),
**Heracles** (fitness), **Plutus** (finance), **Hestia** (personal), **Hephaestus** (store). Other bots get a spare god's name and
keep their own words as the role. Names appear everywhere: roster, 3D core, feed, approvals, boot log, wall display.
Underneath nothing changes: bot ids (`chief-of-staff`…), tokens and webhooks stay as they are.

- `BOT_NAMES` in Railway overrides any of them, e.g. `{"social":"Dionysus"}` or `{"social":{"name":"Dionysus","role":"Social growth"}}`.
- The palette finds a bot by god name, role or id: `task zeus check my calendar`, `task inbox …`.

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

## Performance

The dashboard keeps every effect and spends only what it needs:

- **In use:** full frame rate. **Idle** (30 s untouched, or the window is not focused): half rate. **Calm** (2 min untouched): 20 fps and the
  looping decorative animations pause (they otherwise make the browser repaint the whole page 60 times a second). Any movement or key
  wakes it instantly. The wall display never goes calm, only idle.
- Nothing animates forever without a reason: the background light sits still, the footer wave uses the compositor, the 3D core's soft
  edge is drawn in the shader instead of a CSS mask, and the pixel ratio is capped at 1.5.
- **Search or command → Performance:** *Auto (recommended)*, *Battery saver* (lighter 3D, calmer page, lower rates) or *Full quality*
  (no automatic step-down).

## If the 3D core looks flat

The core protects itself on slow or odd graphics hardware, in this order: the page drops its blurred glass and drifting light ("lite"),
then bloom, then pixel ratio, then antialiasing, and only then does it switch to the flat core. A slow device remembers its level, so
it starts light next time; "too slow" pauses 3D for 30 minutes and then tries again. A canvas that draws nothing (three empty
readbacks) or a lost graphics context falls back for the rest of the tab. Every switch shows a message saying why.
To retry at once: Search or command, then **Core: 3D hologram**. Pages running at 30 fps (a battery saver) are not treated as slow.

## What the 3D core shows

The center is the hub; every bot is a satellite on its own orbit. A bot that reports sends a pulse to the core. Silent bots turn red,
a bot that has never reported is dim, and when anything needs attention the core turns amber. Hover a satellite (or its roster row)
for details, click it to pin them, drag to rotate, double-click to reset.
