/**
 * Pyrosite — Timer Configuration
 * ============================================================
 * 
 * This file defines all timer parameters. When Star Citizen
 * patches change the timings, edit ONLY this file.
 * 
 * HOW TO RECALIBRATE:
 * 1. Enter the contested zone in-game
 * 2. Watch for a phase transition (e.g., an LED turning green)
 * 3. Record the exact UTC time (use time.is/UTC)
 * 4. Convert to epoch milliseconds:
 *    new Date("2026-05-23T14:30:00Z").getTime()
 * 5. Set that value as the `epoch` below
 * 6. Make sure `epochPhaseId` matches the phase that was
 *    STARTING at the moment you recorded
 * 7. Commit and push — Cloudflare deploys in ~60 seconds
 * 
 * IMPORTANT: Duration values below reflect the known 185-minute
 * cycle as of patch 4.8. If CIG changes the timings, measure
 * at least 2 full cycles with a stopwatch and update accordingly.
 * Durations are almost always round minutes.
 * ============================================================
 */

const TIMERS = {
  executiveHangar: {
    id: "executive-hangar",
    name: "Executive Hangar",
    description: "PYAM-EXHANG-0-1",
    patch: "4.8.1-live.11952564",

    // ── EPOCH ──────────────────────────────────────────────
    // UTC timestamp (ms) of a KNOWN phase start observed in-game.
    // The phase that was starting at this moment must match epochPhaseId.
    epoch: 1781161438105,  // 2026-06-11T07:03:58Z, observed 4th LED turning green
    epochPhaseId: "red-5", // Which phase was starting at the epoch moment

    // ── PHASE DEFINITIONS ──────────────────────────────────
    // Ordered list. The engine walks through these sequentially
    // and loops back to the first phase after the last one ends.
    // Total cycle: 185 minutes (11,100,000 ms)
    phases: [
      // ── RED PHASE: "Charging" (120 min total) ──
      // LEDs turn green one at a time, every 24 minutes.
      // Do NOT insert compboards during this phase.
      {
        id: "red-1",
        label: "Charging",
        sublabel: "LED 1 of 5",
        duration: 24 * 60 * 1000,   // 24 minutes
        color: "#ff2e3a",
        leds: [0, 0, 0, 0, 0],     // 0 = red, 1 = green, 2 = off
        parentPhase: "red",
        description: "Hangar is sealed.",
        advice: "Do not insert compboards, the hangar will not open."
      },
      {
        id: "red-2",
        label: "Charging",
        sublabel: "LED 2 of 5",
        duration: 24 * 60 * 1000,
        color: "#ff2e3a",
        leds: [1, 0, 0, 0, 0],
        parentPhase: "red",
        description: "Still charging.",
        advice: "Do not insert compboards, the hangar will not open."
      },
      {
        id: "red-3",
        label: "Charging",
        sublabel: "LED 3 of 5",
        duration: 24 * 60 * 1000,
        color: "#ff2e3a",
        leds: [1, 1, 0, 0, 0],
        parentPhase: "red",
        description: "Charging continues.",
        advice: "Do not insert compboards, the hangar will not open."
      },
      {
        id: "red-4",
        label: "Charging",
        sublabel: "LED 4 of 5",
        duration: 24 * 60 * 1000,
        color: "#ff2e3a",
        leds: [1, 1, 1, 0, 0],
        parentPhase: "red",
        description: "Over halfway charged.",
        advice: "Do not insert compboards, the hangar will not open."
      },
      {
        id: "red-5",
        label: "Charging",
        sublabel: "LED 5 of 5",
        duration: 24 * 60 * 1000,
        color: "#ff2e3a",
        leds: [1, 1, 1, 1, 0],
        parentPhase: "red",
        description: "Almost ready.",
        advice: "Get to the hangar, green phase is approaching."
      },

      // ── GREEN PHASE: "Active" (60 min total) ──
      // All LEDs start green, then turn off one at a time every 12 min.
      // Compboards CAN be inserted. Hangar is accessible.
      {
        id: "green-1",
        label: "Active",
        sublabel: "All LEDs lit",
        duration: 12 * 60 * 1000,   // 12 minutes
        color: "#00e878",
        leds: [1, 1, 1, 1, 1],
        parentPhase: "green",
        description: "Hangar is fully active.",
        advice: "Insert compboards now, full window available."
      },
      {
        id: "green-2",
        label: "Active",
        sublabel: "4 LEDs remaining",
        duration: 12 * 60 * 1000,
        color: "#00e878",
        leds: [2, 1, 1, 1, 1],
        parentPhase: "green",
        description: "Window closing.",
        advice: "Insert compboards, still active."
      },
      {
        id: "green-3",
        label: "Active",
        sublabel: "3 LEDs remaining",
        duration: 12 * 60 * 1000,
        color: "#00e878",
        leds: [2, 2, 1, 1, 1],
        parentPhase: "green",
        description: "Past the halfway mark.",
        advice: "Insert compboards, window is narrowing."
      },
      {
        id: "green-4",
        label: "Active",
        sublabel: "2 LEDs remaining",
        duration: 12 * 60 * 1000,
        color: "#00e878",
        leds: [2, 2, 2, 1, 1],
        parentPhase: "green",
        description: "Time is running short.",
        advice: "Hurry, compboard insertion still possible."
      },
      {
        id: "green-5",
        label: "Active",
        sublabel: "1 LED remaining",
        duration: 12 * 60 * 1000,
        color: "#00e878",
        leds: [2, 2, 2, 2, 1],
        parentPhase: "green",
        description: "Final window.",
        advice: "Last chance, insert compboards immediately."
      },

      // ── BLACK PHASE: "Reset" (5 min) ──
      // All LEDs off. Death zone active. Cycle resets afterward.
      {
        id: "black",
        label: "Reset",
        sublabel: "Death Zone",
        duration: 5 * 60 * 1000,     // 5 minutes
        color: "#ffaa00",            // amber for warning
        leds: [2, 2, 2, 2, 2],
        parentPhase: "black",
        description: "Hangar closed. Death zone active.",
        advice: "Stay clear, anyone inside will be killed. Cycle resets in minutes."
      }
    ]
  }

  // ── ADD MORE TIMERS HERE ──────────────────────────────
  // Example:
  // ruinStationVault: {
  //   id: "ruin-station-vault",
  //   name: "Ruin Station Vault",
  //   description: "Timer door in Ruin Station contested zone",
  //   epoch: ...,
  //   epochPhaseId: "open",
  //   phases: [
  //     { id: "closed", label: "Closed", duration: 20 * 60 * 1000, ... },
  //     { id: "open", label: "Open", duration: 1 * 60 * 1000, ... }
  //   ]
  // }
};

// Expose to other scripts. Top-level `const` binds in the script's
// lexical scope but does not attach to `window`, so we publish it
// explicitly here. Don't remove — engine.js/ui.js/config-panel.js
// read this via `window.TIMERS`.
if (typeof window !== 'undefined') window.TIMERS = TIMERS;
