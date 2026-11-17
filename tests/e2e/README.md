# Browser tests

`pytest` covers the server. These cover what only a browser can: the boot sequence, ambient mode, keyboard and focus,
reduced motion, touch targets, layout overflow across widths, and the live login flow.

    npm install -g playwright && npx playwright install chromium     # once
    bash tests/e2e/run-all.sh

`run-all.sh` starts a throwaway hub on port 8801 (temporary sqlite database, made-up secrets that exist nowhere else),
seeds it with realistic bot data (`seed.py`), runs `ambient.js`, `a11y.js` and `live.js`, then stops the hub.
Each script also runs on its own against any running test hub: `HUB=http://localhost:8801 node tests/e2e/ambient.js`.

What is checked, in short:

- **ambient.js**: enter/leave by button, key, palette and URL; the core canvas moves and comes back; sensitive data is absent;
  night dimming and a 24-hour clock; the carousel; offline and expired-session pills.
- **a11y.js**: dialog focus (in, trapped, restored); every control named and visibly focusable; text at least 12px; 44px touch
  targets on phones; no overflow from 320 to 1920px; reduced motion (no boot, static 3D core, no looping animation).
- **live.js**: login gate, boot after login, same-tab skip, finance left out of ambient, offline and session-ended handling,
  and that idle refreshes cause zero DOM mutations in the panels.
