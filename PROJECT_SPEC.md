# Pyrosite — Project Specification

> **Purpose:** This document is the single source of truth for building **Pyrosite**, the Star Citizen Contested Zone Timer. Hand this file, along with `timers.js` and `design-tokens.css`, to Claude Code. It should be able to build the complete site in one pass.

> **Claude Code behavior:** Do not stop mid-task to explain what you're doing. If you need to communicate something to the developer — a design decision, a gotcha, a question, a TODO — append it to `notes.md` under the "Claude Code Notes" section with a brief header, then keep working. The `notes.md` file is the developer's inbox. Interrupting the build flow to narrate is never necessary.

---

## 1. Project Overview

A single-page static website that displays real-time countdowns for Star Citizen's Executive Hangar unlock cycle. Every visitor sees identical timer states — no backend required. All timing is deterministic, calculated from a known epoch and fixed phase durations using `Date.now()` (UTC milliseconds).

**This is also a portfolio piece for the web design practice Arosite**, so visual quality and polish are as important as functionality.

### Hosting & Deployment
- **Platform:** Cloudflare Pages (static files only)
- **CI/CD:** Auto-deploys on push to `main`
- **No build step.** Plain HTML + CSS + JS. No bundler, no framework, no npm.

---

## 2. File Structure

```
/
├── index.html              # Single page — all UI
├── css/
│   └── style.css           # All styles (design tokens + components)
├── js/
│   ├── timers.js           # Timer configuration (edit this file to recalibrate)
│   ├── engine.js           # Deterministic timer math
│   ├── ui.js               # DOM rendering, animations, countdown display
│   └── config-panel.js     # Admin config panel logic (localStorage-based)
├── assets/
│   └── favicon.svg         # Simple geometric favicon
├── notes.md                # Developer notes (Claude Code appends here, human reads)
└── README.md               # Deployment & calibration instructions
```

---

## 3. Timer Engine — How It Works

### 3.1 The Core Algorithm

All timers follow this deterministic calculation:

```
elapsed       = Date.now() - epoch
positionInCycle = elapsed % totalCycleDuration
currentPhase  = whichever phase that position falls within
timeRemaining = time until current phase ends
```

Because `Date.now()` returns UTC milliseconds on every device, all visitors worldwide see identical countdowns without any server coordination.

### 3.2 Executive Hangar Cycle (185 minutes total)

The cycle has **three major phases**, and the Red and Green phases each contain **5 LED sub-phases**. The UI must show individual LED states, not just the parent phase.

#### Red Phase — "Charging" (120 minutes)
LEDs turn from red to green one at a time, every 24 minutes.

| Sub-phase | Duration | LED State | Cumulative |
|-----------|----------|-----------|------------|
| Red 1 | 24 min | 0 green, 5 red | 0–24 min |
| Red 2 | 24 min | 1 green, 4 red | 24–48 min |
| Red 3 | 24 min | 2 green, 3 red | 48–72 min |
| Red 4 | 24 min | 3 green, 2 red | 72–96 min |
| Red 5 | 24 min | 4 green, 1 red | 96–120 min |

**Do NOT insert compboards during this phase.** The hangar will not open.

#### Green Phase — "Active" (60 minutes)
All 5 LEDs are green at the start. They turn off one at a time, every 12 minutes.

| Sub-phase | Duration | LED State | Cumulative |
|-----------|----------|-----------|------------|
| Green 1 | 12 min | 5 green | 120–132 min |
| Green 2 | 12 min | 4 green, 1 off | 132–144 min |
| Green 3 | 12 min | 3 green, 2 off | 144–156 min |
| Green 4 | 12 min | 2 green, 3 off | 156–168 min |
| Green 5 | 12 min | 1 green, 4 off | 168–180 min |

**Compboards CAN be inserted. Hangar is accessible.**

#### Black Phase — "Reset" (5 minutes)
All LEDs are off. Hangar is closed. Death zone active. Cycle resets to Red after 5 minutes.

| Sub-phase | Duration | LED State | Cumulative |
|-----------|----------|-----------|------------|
| Black | 5 min | 0 LEDs lit | 180–185 min |

### 3.3 Drift Correction

Use self-correcting tick alignment, not naive `setInterval`:

```javascript
function scheduleNextTick() {
  const now = Date.now();
  const msUntilNextSecond = 1000 - (now % 1000);
  setTimeout(() => {
    updateDisplay(getCurrentState(timer));
    scheduleNextTick();
  }, msUntilNextSecond);
}
```

This aligns ticks to wall-clock second boundaries so the countdown changes crisply on the second, not at an arbitrary offset.

### 3.4 Countdown Formatting

```javascript
function formatCountdown(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
```

Use `Math.ceil` so "1:00" displays during the final second before a transition, not "0:00" for a full second.

---

## 4. UI Components

### 4.1 Page Layout (Top to Bottom)

```
┌─────────────────────────────────────────────┐
│  Header bar (PYROSITE + status indicator)  │
├─────────────────────────────────────────────┤
│                                             │
│         MAIN TIMER DISPLAY                  │
│    Phase label + large countdown            │
│    LED indicator row (5 dots/bars)          │
│    Cycle progress visualization             │
│                                             │
├─────────────────────────────────────────────┤
│         CYCLE TIMELINE                      │
│    Horizontal bar showing all phases        │
│    Current position marker                  │
│    Next transition callout                  │
│                                             │
├─────────────────────────────────────────────┤
│         INFO CARDS                          │
│    Phase guide / What to do now             │
│    Upcoming schedule (next 2-3 cycles)      │
│                                             │
├─────────────────────────────────────────────┤
│         CONFIG PANEL (collapsible)          │
│    Epoch adjuster + phase duration editor   │
│                                             │
├─────────────────────────────────────────────┤
│         ABOUT / INFO                        │
│    How the timer works, calibration notes   │
│                                             │
├─────────────────────────────────────────────┤
│         FOOTER                              │
│    GitHub link · Built by arosite           │
│                                             │
└─────────────────────────────────────────────┘
```

### 4.2 Main Timer Display

This is the hero. It dominates the viewport on load.

- **Phase label:** Large text — "CHARGING", "ACTIVE", or "RESET" — with a colored glow/badge matching the current phase color (red, green, or amber/dark).
- **Countdown:** Very large monospace numerals. `MM:SS` or `H:MM:SS`. This is the single most important piece of information on the page. Minimum apparent size: ~72px on desktop, ~48px on mobile.
- **LED indicator row:** 5 discrete indicators (circles, bars, or diamond shapes — pick something geometric and HUD-like). Each LED reflects its real-time state:
  - **Red** = `#ff2e3a` with subtle red glow
  - **Green** = `#00e878` with subtle green glow
  - **Off/Black** = `#1a1e2e` (barely visible, recessed look)
  - LED transitions should have a brief CSS animation (fade or pulse) when changing state.
- **Phase context line:** Below the LEDs, one short sentence explaining what the current state means for gameplay. Examples:
  - Red phase: "Hangar is sealed — do not insert compboards."
  - Green phase: "Hangar is ACTIVE — insert compboards to open."
  - Black phase: "Death zone — stay clear. Cycle resets shortly."

### 4.3 Cycle Timeline

A horizontal progress visualization of the full 185-minute cycle.

- Three color-coded segments (red, green, dark) proportional to their durations.
- A marker/playhead showing current position.
- LED transition ticks within the red and green segments.
- Labels or tooltips showing transition times.
- On mobile, this can stack vertically if needed.

### 4.4 Info Cards

Two side-by-side cards on desktop, stacked on mobile:

**Card 1 — "Current Phase Guide"**
Dynamic content based on the active phase. Gameplay advice, what to do, what not to do. Updates automatically on phase transitions.

**Card 2 — "Upcoming Schedule"**
Shows the next 2–3 full cycle transitions with local times. Formatted like:
- Green Phase starts at 2:45 PM (in 38 min)
- Black Phase starts at 3:45 PM (in 1h 38 min)
- Next cycle at 3:50 PM (in 1h 43 min)

Use the user's local timezone for display. Label it clearly as local time.

### 4.5 Config Panel

Collapsible section, closed by default. No authentication — this is a personal tool.

**Controls:**
- Epoch timestamp input (UTC milliseconds). Include a helper that converts a human-readable UTC datetime string to epoch ms.
- Phase duration fields (in minutes) for each sub-phase.
- "Apply" button that saves to `localStorage` and immediately updates the timer display.
- "Reset to Defaults" button that clears `localStorage` overrides and reverts to the values from `timers.js`.
- Visual confirmation when changes are applied.

**Behavior:**
- On page load, check `localStorage` for overrides. If found, use those. Otherwise, use `timers.js` defaults.
- The config panel is a calibration tool, not a public feature. It can be visually understated.

### 4.6 About Section

Brief, scannable content:
- What this tool tracks and why it exists.
- How the deterministic timer math works (one short paragraph — "no server, pure math, every browser calculates the same answer").
- Calibration note: "After major patches, the site owner re-observes the cycle in-game and updates the reference timestamp."
- Link to the GitHub repository.

### 4.7 Footer

Minimal. One line.
- Left: GitHub repo link.
- Right: "Built by **arosite**" — rendered in Source Serif 4, weight 600, with a small orange square (hex `#d26b33`) as the dot after the wordmark. The arosite wordmark on dark backgrounds uses light text (`#e8ecf4`) with the orange dot. Keep it small and quiet — this is a portfolio credit, not a co-brand. Link it to `https://arosite.dev` (or leave as placeholder URL to be updated).

---

## 5. Design System

### 5.1 Aesthetic Direction

**Tone:** Grounded sci-fi industrial. Think spacecraft instrument panel — utilitarian layouts with moments of visual elegance. Not fantasy, not neon cyberpunk. Functional, data-forward, and atmospheric.

**Visual references (mood, not copying):**
- Star Citizen's in-game mobiGlas UI
- Spacecraft cockpit HUD / heads-up displays
- Military tactical displays and command interfaces
- Industrial control room panels

**Key principles:**
- **Data is the hero.** The countdown numbers are the largest, most prominent element. Everything else supports them.
- **Dark theme, not generic dark mode.** Deep blue-blacks, not pure `#000`. Layered panel surfaces with subtle depth. The background should feel like looking at a display in a dimly lit cockpit.
- **Geometric accents.** Chamfered corners, angled clip-paths, thin ruled lines, hexagonal or diamond motifs. These should feel structural, not decorative.
- **Color is functional.** Red means locked. Green means go. Amber means caution. Cyan is informational. Color communicates state, not decoration.
- **Atmosphere through texture.** Subtle CSS-based effects: faint grid patterns, scan lines, noise overlays, gradient glows behind active elements. These should be barely perceptible — felt more than seen.

### 5.2 Design Tokens

All tokens are defined in `design-tokens.css` (provided as a separate file). Import or inline them at the top of `style.css`.

**See the companion file `design-tokens.css` for the complete token set.** Key categories:

- **Surfaces:** 5 depth levels from void (#060810) to elevated panel (#1c2433)
- **Text:** 4 emphasis levels from primary (#e8ecf4) to dim (#2e3546)
- **Phase colors:** Red, green, amber, off — each with active, muted, and glow variants
- **Accent:** Cyan (#00c8ff) for UI elements, links, informational highlights
- **Borders:** 3 levels using rgba white at varying opacity
- **Typography:** See section 5.3
- **Spacing:** 4px base unit, scale of 4/8/12/16/24/32/48/64/96
- **Radii:** 2px (sharp/technical), 4px (buttons), 8px (cards)
- **Transitions:** 150ms ease for micro-interactions, 300ms for panel reveals

### 5.3 Typography

Use Google Fonts. Two families:

1. **Display / Countdown:** `"Orbitron", sans-serif` — geometric, technical, futuristic. Used for the large countdown numerals, phase labels, and section headings. Weight 700 for countdown, 600 for headings, 500 for sub-headings.

2. **Body / UI:** `"Exo 2", sans-serif` — clean, slightly futuristic but highly legible. Used for body text, card content, labels, buttons. Weight 400 for body, 500 for emphasis, 300 for tertiary text.

3. **Monospace (data):** `"Share Tech Mono", monospace` — for timestamps, epoch values, technical readouts in the config panel.

**Scale:**
- Countdown: 72px desktop / 48px mobile
- Phase label: 28px desktop / 22px mobile
- Section heading: 22px / 20px
- Body: 15px / 14px
- Caption/label: 12px / 11px, uppercase, letter-spacing 0.08em

### 5.4 Geometric Accents & Atmosphere

Implement at least three of these atmospheric effects (CSS-only, no images required):

1. **Faint grid overlay** on the page background — thin lines at low opacity, suggesting a technical schematic or cockpit display grid.
2. **Corner accents** on the main timer card — small geometric shapes (angled brackets, crosshairs, chamfered corners) at the corners of the primary display, like a targeting reticle framing the data.
3. **Scan line effect** — very subtle repeating horizontal lines over the background, 1px every 3-4px, at ~2-3% opacity.
4. **Glow effects** — the active phase color should cast a faint, blurred glow behind the countdown and LED indicators. Use `box-shadow` or pseudo-elements with `filter: blur()`.
5. **Animated pulse** — a slow, breathing pulse on the active LED indicators. `@keyframes` with opacity/scale oscillation, ~3-4 second period.
6. **Thin ruled lines** — horizontal hairlines used as section dividers, extending edge to edge, with small geometric terminators (diamonds, dots, or right angles).

### 5.5 Responsive Behavior

**Mobile-first.** Design for 375px viewport width as the baseline.

- **Mobile (< 768px):** Single column. Timer display takes full width. Timeline stacks vertically or becomes a simplified progress bar. Info cards stack. Config panel stays collapsible.
- **Tablet (768–1024px):** Info cards can sit side by side. Timeline horizontal.
- **Desktop (> 1024px):** Full layout with generous spacing. Maximum content width ~1100px, centered. Timer display can be even more dramatic at larger sizes.

No horizontal scrolling. No layout shift. Test that the countdown numerals never overflow their container on small screens.

---

## 6. Interactions & Animation

### 6.1 Phase Transitions

When the timer crosses a phase boundary:
- LED indicator animates (color fade, ~300ms)
- Phase label updates with a brief fade transition
- Phase context text updates
- The cycle timeline marker advances
- Card content updates (current phase guide)
- The glow color behind the timer shifts to match the new phase

### 6.2 Countdown Tick

Each second tick should feel clean, not jarring. The digits change without visible flicker. Use CSS `font-variant-numeric: tabular-nums` on countdown elements so digits don't cause layout shift.

### 6.3 Page Load

- Timer state calculates instantly from `Date.now()` — no loading spinner needed.
- A brief entrance animation (fade in + slight upward translate) on the main timer card is acceptable, but keep it under 400ms. The data should be visible almost immediately.

### 6.4 Config Panel

- Toggle open/closed with a smooth height or max-height transition.
- When applying new values, the timer updates in real time — no page refresh needed.

---

## 7. Meta & SEO

```html
<title>Pyrosite — Star Citizen Executive Hangar Countdown</title>
<meta name="description" content="Real-time countdown for the Star Citizen Executive Hangar cycle in Pyro. Track LED phases, green light windows, and plan your contested zone runs. No server — pure deterministic math.">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#060810">
<meta property="og:title" content="Pyrosite — Executive Hangar Countdown">
<meta property="og:description" content="Track the Executive Hangar LED cycle in real time. Know exactly when to insert compboards.">
<meta property="og:type" content="website">
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
```

The favicon should be a simple geometric shape — a hexagon, diamond, or stylized LED indicator — in the cyan accent color on a transparent background.

---

## 8. Accessibility

- All phase states communicated through text labels, not color alone.
- Countdown uses `aria-live="polite"` with `aria-atomic="true"` so screen readers announce changes.
- Config panel inputs are labeled.
- Sufficient color contrast for all text against dark backgrounds (WCAG AA minimum).
- Focus states visible on interactive elements (outline using cyan accent).

---

## 9. Performance

- **Zero external API calls.** Everything is self-contained.
- **No layout shift.** Reserve space for countdown numerals. Use `font-variant-numeric: tabular-nums`.
- **Minimal DOM.** This is one page with a handful of components. Keep it simple.
- **CSS-only atmosphere effects.** No canvas, no WebGL, no heavy JS animation libraries.
- **Google Fonts loaded with `display=swap`** to prevent FOIT.
- Target: **<100KB total page weight** (excluding fonts).

---

## 10. Future-Proofing

The code should make it easy to:
- **Add more timers.** The `timers.js` config supports multiple timer objects. The UI should render from the config array — if a second timer is added, it should appear automatically.
- **Add more phases to a timer.** The engine iterates over the `phases` array generically. Adding a phase is just adding an object to the array.
- **Restyle for a different game.** All visual theming is in CSS custom properties. Swapping the design tokens file would reskin the entire site.

---

## 11. Arosite Footer Credit

The footer includes a small "Built by arosite" credit. Implementation details:

```html
<footer>
  <a href="https://github.com/REPO_PLACEHOLDER" class="footer-link">GitHub</a>
  <a href="https://arosite.dev" class="arosite-credit">
    Built by
    <span class="arosite-wordmark">arosite<span class="arosite-dot"></span></span>
  </a>
</footer>
```

```css
.arosite-wordmark {
  font-family: 'Source Serif 4', 'Source Serif Pro', Georgia, serif;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: -0.02em;
  color: var(--text-secondary);
}
.arosite-dot {
  display: inline-block;
  width: 4px;
  height: 4px;
  background: #d26b33; /* Arosite brand orange — always this exact color */
  margin-left: 1px;
  transform: translateY(-1px);
}
```

Load `Source Serif 4` (weight 600 only) from Google Fonts alongside the other typefaces. It's only used for this one element, so the weight cost is minimal.

---

## 12. README.md Content

Include a README with:

1. **What this is** — one-paragraph description.
2. **How to deploy** — push to GitHub, connect to Cloudflare Pages, done.
3. **How to recalibrate after a patch:**
   - Enter the contested zone in Star Citizen.
   - Watch for a phase transition (e.g., an LED changing from red to green).
   - Record the exact UTC time using time.is/UTC on a second monitor.
   - Convert to epoch ms: `new Date("2025-05-18T14:30:00Z").getTime()`
   - Update `epoch` in `timers.js` — make sure the first phase in the array matches the phase that was starting at that moment.
   - Commit and push. Cloudflare deploys in ~60 seconds.
4. **How to use the config panel** — for testing new values before committing.
5. **Credits** — link to Arosite.
