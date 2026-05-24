# Pyrosite 

Real-time countdown for the Star Citizen Executive Hangar LED cycle in Pyro (PYAM-EXHANG-0-1). Static site — no server, no build step, no dependencies. Every visitor in every timezone sees identical timer state because the math runs from `Date.now()` (UTC ms) against a single anchor timestamp.

---

## What's in the box

```
/
├── index.html              Single page — all UI
├── css/
│   └── style.css           Design tokens + all component styles
├── js/
│   ├── timers.js           ★ Timer config — edit this to recalibrate
│   ├── engine.js           Deterministic timer math
│   ├── ui.js               DOM rendering, countdown, animations
│   └── config-panel.js     localStorage-backed override panel
├── assets/
│   └── favicon.svg         Geometric cyan favicon
├── README.md               This file
├── PROJECT_SPEC.md         Build specification
├── design-tokens.css       Source design tokens (mirrored inline in style.css)
└── notes.md                Developer notes (Claude Code log + human reference)
```

The only file you'll touch after launch is **`js/timers.js`**.

---

## Deploy

Pyrosite is plain static files — drop them on any static host. The intended path is GitHub + Cloudflare Pages.

### One-time setup

```bash
git init
git add .
git commit -m "Initial commit"

# Using the GitHub CLI:
gh repo create pyrosite --public --source=. --push

# Or manually:
git remote add origin git@github.com:YOUR_USERNAME/pyrosite.git
git branch -M main
git push -u origin main
```

Then in Cloudflare:

1. dash.cloudflare.com → Workers & Pages → Create → Pages
2. Connect the `pyrosite` GitHub repo
3. Build settings:
   - **Build command:** *(leave blank)*
   - **Build output directory:** `/`
4. Deploy — you'll get `pyrosite.pages.dev` automatically.

### After the initial deploy

```bash
git add .
git commit -m "Recalibrate epoch for patch X.X.X"
git push
# Cloudflare auto-deploys in ~60 seconds.
```

---

## Recalibrate after a Star Citizen patch

The whole site rides on one number — the anchor `epoch` in `js/timers.js`. If CIG resets the cycle (intentionally or otherwise), re-observe and update.

1. **Enter the contested zone** in Star Citizen. Fly to the Executive Hangar.
2. **Watch for a phase transition.** Any LED turning green, any LED turning off, or the entire bank going dark for the black phase.
3. **At the exact moment of the transition,** read the UTC time from [time.is/UTC](https://time.is/UTC) on a second monitor or your phone.
4. **Convert to epoch milliseconds.** In a browser console:
   ```js
   new Date("2026-05-23T14:30:00Z").getTime()
   // → 1779890400000
   ```
5. **Update `js/timers.js`:**
   - Set `epoch` to that number.
   - Set `epochPhaseId` to the id of the phase that was **starting** at that moment. If the second LED just turned green, you observed the start of `red-2`. If the doors just went green (all five lit), you observed `green-1`. If the bank just went dark, you observed `black`.
6. **Verify in-browser before committing.** Open Pyrosite locally — the countdown should match what you saw in-game across the next full cycle.
7. **Commit and push.** Cloudflare deploys in ~60 seconds.

> Durations are almost always round minutes. If you measure a sub-phase at 23:47, the real value is 24:00 and your stopwatch is wrong, not CIG. Don't change durations unless you've measured at least two full cycles and they consistently disagree with the defaults.

---

## Config panel — test before you commit

The collapsible config panel on the page is for trying values without touching code:

- Type a UTC datetime into the **UTC Datetime** field. The epoch ms below auto-syncs.
- Pick the phase that was starting at that moment from **Epoch Phase**.
- Adjust **Phase Durations** in minutes if you really need to.
- Hit **Apply**. The timer updates immediately. Values are saved to `localStorage` on this browser only.
- Hit **Reset to defaults** to clear the overrides and use the values from `timers.js`.

This is a personal calibration tool, not a public-facing feature. There's no auth — it's intentionally understated. Use it to validate a candidate `epoch` against a couple of transitions, then commit the value to `timers.js` and push.

---

## How the math works

All timers use a single deterministic calculation:

```
elapsed         = Date.now() - epoch
positionInCycle = elapsed mod totalCycleDuration
currentPhase    = the phase whose offset range contains positionInCycle
timeRemaining   = currentPhase end - positionInCycle
```

`Date.now()` returns UTC milliseconds on every device, so two clients on opposite sides of the planet compute the same `positionInCycle` and the same `timeRemaining`. No backend, no API calls, no server clock drift.

The tick is self-correcting: every fire re-computes the gap to the next wall-clock second and reschedules. The digits change crisply on the second, not at an arbitrary offset.

For full details, read `PROJECT_SPEC.md` (build specification) and `js/engine.js` (implementation).

---

## Extending

The engine and UI render generically from `TIMERS`. To add a second contested-zone timer:

1. Add an entry to `TIMERS` in `js/timers.js` with the same shape as `executiveHangar` (id, epoch, epochPhaseId, phases array).
2. Refresh. A second timer card appears automatically.

To reskin for a different game, swap `design-tokens.css` (and re-inline into `css/style.css` since there's no build step).

---

## Credits

Built by **arosite**.

Pyrosite is fan-made and not affiliated with Cloud Imperium Games. Star Citizen, Pyro, and all related marks belong to CIG.
