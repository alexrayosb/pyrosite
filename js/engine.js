/**
 * Pyrosite — Timer Engine
 * ============================================================
 *
 * Deterministic timer math. Every visitor in every timezone
 * gets the same answer because Date.now() returns UTC ms.
 *
 * Algorithm:
 *   elapsed         = Date.now() - epoch
 *   positionInCycle = elapsed % totalCycleDuration
 *   currentPhase    = the phase whose offset range contains positionInCycle
 *   timeRemaining   = currentPhase end - positionInCycle
 *
 * Phases are reordered internally so the epoch phase sits at
 * offset 0. That keeps the math one subtraction + one modulo
 * regardless of which phase the operator happened to observe
 * when calibrating.
 * ============================================================
 */
(function (global) {
  'use strict';

  function createTimerState(timer) {
    if (!timer || !Array.isArray(timer.phases) || timer.phases.length === 0) {
      throw new Error('Pyrosite: timer config must include a non-empty phases array');
    }

    const epochPhaseIndex = timer.phases.findIndex(p => p.id === timer.epochPhaseId);
    if (epochPhaseIndex === -1) {
      throw new Error(`Pyrosite: epochPhaseId "${timer.epochPhaseId}" not found in phases`);
    }

    const totalCycle = timer.phases.reduce((sum, p) => sum + p.duration, 0);
    if (totalCycle <= 0) {
      throw new Error('Pyrosite: total cycle duration must be positive');
    }

    // Reorder so the epoch phase sits at internal offset 0.
    const rotated = timer.phases
      .slice(epochPhaseIndex)
      .concat(timer.phases.slice(0, epochPhaseIndex));

    let cursor = 0;
    const orderedPhases = rotated.map(phase => {
      const offset = cursor;
      cursor += phase.duration;
      return Object.assign({}, phase, { offset: offset, end: cursor });
    });

    // Cumulative offsets in the *narrative* order (red → green → black),
    // used by the timeline view so it always reads left-to-right by
    // gameplay sequence regardless of where the epoch lands.
    let narrativeCursor = 0;
    const narrativePhases = timer.phases.map(phase => {
      const offset = narrativeCursor;
      narrativeCursor += phase.duration;
      return Object.assign({}, phase, { offset: offset, end: narrativeCursor });
    });

    return {
      timer: timer,
      totalCycle: totalCycle,
      orderedPhases: orderedPhases,
      narrativePhases: narrativePhases
    };
  }

  function getCurrentState(timerState, now) {
    if (now === undefined) now = Date.now();
    const totalCycle = timerState.totalCycle;
    const elapsed = now - timerState.timer.epoch;

    // Double-modulo handles the case where the epoch is in the future
    // (negative elapsed) — without it, JS would return a negative remainder.
    const positionInCycle = ((elapsed % totalCycle) + totalCycle) % totalCycle;

    let currentPhase = timerState.orderedPhases[0];
    for (let i = 0; i < timerState.orderedPhases.length; i++) {
      const p = timerState.orderedPhases[i];
      if (positionInCycle >= p.offset && positionInCycle < p.end) {
        currentPhase = p;
        break;
      }
    }

    const positionInPhase = positionInCycle - currentPhase.offset;
    const timeRemaining = currentPhase.duration - positionInPhase;

    // Position translated back into the narrative (red-first) order
    // so the timeline view can render a stable left-to-right cycle.
    const narrativeMatch = timerState.narrativePhases.find(p => p.id === currentPhase.id);
    const narrativePosition = narrativeMatch
      ? narrativeMatch.offset + positionInPhase
      : positionInCycle;

    // Walk forward in narrative order (with wrap) until parentPhase changes.
    // Sums the remaining sub-phase durations under the current parent so the
    // hero countdown can show time until the next *major* phase boundary
    // (e.g. CHARGING → ACTIVE), not the next sub-phase tick.
    const narrative = timerState.narrativePhases;
    const narrativeIdx = narrative.findIndex(p => p.id === currentPhase.id);
    let timeRemainingInParent = timeRemaining;
    let nextParentSubPhase = null;
    if (narrativeIdx !== -1) {
      for (let i = 1; i < narrative.length; i++) {
        const next = narrative[(narrativeIdx + i) % narrative.length];
        if (next.parentPhase !== currentPhase.parentPhase) {
          nextParentSubPhase = next;
          break;
        }
        timeRemainingInParent += next.duration;
      }
    }

    return {
      currentPhase: currentPhase,
      positionInPhase: positionInPhase,
      positionInCycle: positionInCycle,
      narrativePosition: narrativePosition,
      timeRemaining: timeRemaining,
      timeRemainingInParent: timeRemainingInParent,
      nextParentSubPhase: nextParentSubPhase,
      totalCycle: totalCycle,
      now: now
    };
  }

  function getUpcomingPhases(timerState, count, now) {
    if (now === undefined) now = Date.now();
    const state = getCurrentState(timerState, now);
    const ordered = timerState.orderedPhases;
    const currentIndex = ordered.findIndex(p => p.id === state.currentPhase.id);

    const upcoming = [];
    let cumulative = state.timeRemaining;
    for (let i = 1; i <= count; i++) {
      const nextIndex = (currentIndex + i) % ordered.length;
      const nextPhase = ordered[nextIndex];
      upcoming.push({
        phase: nextPhase,
        timeUntilStart: cumulative,
        startTime: new Date(now + cumulative)
      });
      cumulative += nextPhase.duration;
    }
    return upcoming;
  }

  // Math.ceil so the display reads "1:00" through the entire final
  // second before a transition, not "0:00" for a stuck-looking beat.
  function formatCountdown(ms) {
    if (!isFinite(ms) || ms < 0) ms = 0;
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = n => String(n).padStart(2, '0');

    if (hours > 0) {
      return hours + ':' + pad(minutes) + ':' + pad(seconds);
    }
    return minutes + ':' + pad(seconds);
  }

  function formatDuration(ms) {
    if (!isFinite(ms) || ms < 0) ms = 0;
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return hours + 'h ' + minutes + 'm';
    if (minutes > 0) return minutes + 'm';
    return seconds + 's';
  }

  // timeZone is an IANA name (e.g. "America/Los_Angeles") or null/undefined
  // for the browser's local zone.
  function formatLocalTime(date, timeZone) {
    const opts = { hour: 'numeric', minute: '2-digit' };
    if (timeZone) opts.timeZone = timeZone;
    return date.toLocaleTimeString([], opts);
  }

  // Self-correcting tick aligned to wall-clock second boundaries.
  // setInterval drifts; this re-computes the gap on every fire so
  // the digit-change always lands on the second.
  function startTicking(callback) {
    let timeoutId = null;
    let stopped = false;

    function tick() {
      if (stopped) return;
      try {
        callback();
      } catch (err) {
        console.error('Pyrosite: tick callback threw', err);
      }
      const now = Date.now();
      const msUntilNextSecond = 1000 - (now % 1000);
      timeoutId = setTimeout(tick, msUntilNextSecond);
    }

    const now = Date.now();
    const msUntilNextSecond = 1000 - (now % 1000);
    timeoutId = setTimeout(tick, msUntilNextSecond);

    return {
      stop: function () {
        stopped = true;
        if (timeoutId !== null) clearTimeout(timeoutId);
      }
    };
  }

  global.PyrositeEngine = {
    createTimerState: createTimerState,
    getCurrentState: getCurrentState,
    getUpcomingPhases: getUpcomingPhases,
    formatCountdown: formatCountdown,
    formatDuration: formatDuration,
    formatLocalTime: formatLocalTime,
    startTicking: startTicking
  };
})(typeof window !== 'undefined' ? window : globalThis);
