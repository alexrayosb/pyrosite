/**
 * Pyrosite — UI Layer
 * ============================================================
 *
 * Builds the DOM for each timer, attaches it to #timer-stack,
 * and runs a single self-aligning ticker that updates every
 * mounted timer on the second boundary.
 *
 * Renders generically from the TIMERS config. Adding a second
 * timer to that config will make it appear automatically.
 * ============================================================
 */
(function (global) {
  'use strict';

  const PARENT_PHASE_COPY = {
    red:   { headline: 'CHARGING', kicker: 'LOCKED' },
    green: { headline: 'ACTIVE',   kicker: 'GO' },
    black: { headline: 'RESET',    kicker: 'DEATH ZONE' }
  };

  // ── Timezone preference ──────────────────────────────────────
  // Global across all timer cards on the page. Persisted to
  // localStorage so the choice survives reloads.
  const TIMEZONE_STORAGE_KEY = 'pyrosite.timezone';
  const TIMEZONE_OPTIONS = [
    { value: 'auto',                 label: 'Local' },
    { value: 'UTC',                  label: 'UTC' },
    { value: 'America/Los_Angeles',  label: 'US Pacific · Los Angeles' },
    { value: 'America/Denver',       label: 'US Mountain · Denver' },
    { value: 'America/Chicago',      label: 'US Central · Chicago' },
    { value: 'America/New_York',     label: 'US Eastern · New York' },
    { value: 'Europe/London',        label: 'UK · London' },
    { value: 'Europe/Berlin',        label: 'Europe Central · Berlin' },
    { value: 'Asia/Tokyo',           label: 'Japan · Tokyo' },
    { value: 'Australia/Sydney',     label: 'Australia East · Sydney' }
  ];

  function getStoredTimezone() {
    try {
      const stored = localStorage.getItem(TIMEZONE_STORAGE_KEY);
      if (!stored) return 'auto';
      // Validate against our known list — a stale or corrupt value
      // should fall back to 'auto' rather than crash Intl below.
      return TIMEZONE_OPTIONS.some(o => o.value === stored) ? stored : 'auto';
    } catch (e) { return 'auto'; }
  }

  function setStoredTimezone(tz) {
    try { localStorage.setItem(TIMEZONE_STORAGE_KEY, tz); }
    catch (e) { /* private mode / quota — non-fatal */ }
  }

  // Resolves the storage value into an arg suitable for Intl options.
  // 'auto' → undefined (let the browser pick); anything else → the IANA id.
  function effectiveTimezone(stored) {
    return stored === 'auto' ? undefined : stored;
  }

  function escape(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function collectRefs(root) {
    const refs = {};
    root.querySelectorAll('[data-ref]').forEach(function (node) {
      refs[node.dataset.ref] = node;
    });
    return refs;
  }

  // Orbitron's digits are proportional — "1" is much narrower than "0",
  // so the countdown drifts a few pixels per tick when displayed as plain
  // text and centered. Wrapping each glyph in a fixed-width cell pins
  // every digit position regardless of which numeral occupies it.
  function renderCountdownCells(value) {
    let html = '';
    for (let i = 0; i < value.length; i++) {
      const ch = value.charAt(i);
      const variant = (ch === ':') ? 'sep' : 'digit';
      html += '<span class="countdown__cell countdown__cell--' + variant + '">' + ch + '</span>';
    }
    return html;
  }

  function buildTimerCard(timer) {
    const ts = PyrositeEngine.createTimerState(timer);
    const totalCycle = ts.totalCycle;
    const ledCount = (timer.phases[0].leds || []).length || 5;

    // Major-phase blocks group adjacent sub-phases that share a parentPhase.
    // Used to draw the big colored segments (Red 120m, Green 60m, Black 5m)
    // while still rendering thin tick marks for each sub-phase boundary.
    const majorBlocks = [];
    for (const phase of ts.narrativePhases) {
      const last = majorBlocks[majorBlocks.length - 1];
      if (last && last.parentPhase === phase.parentPhase) {
        last.subPhases.push(phase);
        last.duration += phase.duration;
        last.end = phase.end;
      } else {
        majorBlocks.push({
          parentPhase: phase.parentPhase,
          subPhases: [phase],
          offset: phase.offset,
          end: phase.end,
          duration: phase.duration
        });
      }
    }

    const card = document.createElement('article');
    card.className = 'timer-card';
    card.dataset.timerId = timer.id;

    card.innerHTML =
      '<header class="timer-card__header">' +
        '<div class="timer-card__title">' +
          '<span class="timer-card__eyebrow">CONTESTED ZONE TIMER</span>' +
          '<h2 class="timer-card__name">' + escape(timer.name) + '</h2>' +
          '<p class="timer-card__desc">' + escape(timer.description) + '</p>' +
        '</div>' +
        '<div class="timer-card__meta">' +
          '<div class="timer-card__patch">' +
            '<span class="timer-card__patch-label">PATCH</span>' +
            '<span class="timer-card__patch-value">' + escape(timer.patch || '—') + '</span>' +
          '</div>' +
        '</div>' +
      '</header>' +

      '<div class="timer-card__main">' +
        '<span class="bracket bracket--tl" aria-hidden="true"></span>' +
        '<span class="bracket bracket--tr" aria-hidden="true"></span>' +
        '<span class="bracket bracket--bl" aria-hidden="true"></span>' +
        '<span class="bracket bracket--br" aria-hidden="true"></span>' +
        '<span class="main-glow" aria-hidden="true" data-ref="mainGlow"></span>' +

        '<div class="phase-label">' +
          '<span class="phase-label__main" data-ref="phaseLabelMain">—</span>' +
        '</div>' +

        '<div class="countdown">' +
          '<span class="countdown__value" data-ref="countdown" aria-live="polite" aria-atomic="true">—:—</span>' +
        '</div>' +

        '<div class="led-row" data-ref="ledRow" role="group" aria-label="LED indicators"></div>' +

        '<p class="phase-context" data-ref="phaseContext">—</p>' +
      '</div>' +

      '<section class="timeline" aria-label="Full cycle timeline">' +
        '<header class="timeline__header">' +
          '<h3 class="timeline__heading">Cycle Timeline</h3>' +
          '<span class="timeline__total">' + Math.round(totalCycle / 60000) + ' MIN TOTAL</span>' +
        '</header>' +
        '<div class="timeline__track">' +
          '<div class="timeline__ruler" data-ref="timelineRuler"></div>' +
          '<div class="timeline__playhead" data-ref="playhead">' +
            '<span class="timeline__playhead-line"></span>' +
            '<span class="timeline__playhead-marker"></span>' +
          '</div>' +
        '</div>' +
        '<div class="timeline__legend">' +
          '<span class="timeline__legend-item timeline__legend-item--red">' +
            '<span class="timeline__legend-swatches">' +
              '<span class="timeline__legend-swatch timeline__legend-swatch--inactive"></span>' +
              '<span class="timeline__legend-swatch timeline__legend-swatch--active"></span>' +
            '</span>Charging · 120m</span>' +
          '<span class="timeline__legend-item timeline__legend-item--green">' +
            '<span class="timeline__legend-swatches">' +
              '<span class="timeline__legend-swatch timeline__legend-swatch--inactive"></span>' +
              '<span class="timeline__legend-swatch timeline__legend-swatch--active"></span>' +
            '</span>Active · 60m</span>' +
          '<span class="timeline__legend-item timeline__legend-item--black">' +
            '<span class="timeline__legend-swatches">' +
              '<span class="timeline__legend-swatch timeline__legend-swatch--inactive"></span>' +
              '<span class="timeline__legend-swatch timeline__legend-swatch--active"></span>' +
            '</span>Reset · 5m</span>' +
        '</div>' +
      '</section>' +

      '<div class="info-cards">' +
        '<article class="info-card info-card--schedule">' +
          '<header class="info-card__header">' +
            '<span class="info-card__eyebrow">UPCOMING SCHEDULE</span>' +
            '<div class="info-card__tz-control">' +
              '<label class="info-card__tz-label" for="tz-' + escape(timer.id) + '">Timezone</label>' +
              '<div class="info-card__tz-select-wrap">' +
                '<select class="info-card__tz-select" id="tz-' + escape(timer.id) + '" data-ref="tzSelect" aria-label="Display timezone for upcoming transitions"></select>' +
                '<span class="info-card__tz-chevron" aria-hidden="true">▾</span>' +
              '</div>' +
            '</div>' +
          '</header>' +
          '<ol class="schedule-list" data-ref="scheduleList"></ol>' +
        '</article>' +
      '</div>';

    // LEDs
    const ledRow = card.querySelector('[data-ref="ledRow"]');
    const leds = [];
    for (let i = 0; i < ledCount; i++) {
      const led = document.createElement('span');
      led.className = 'led led--off';
      led.setAttribute('role', 'img');
      led.setAttribute('aria-label', 'LED ' + (i + 1) + ': off');
      ledRow.appendChild(led);
      leds.push(led);
    }

    // Timeline visual widths. Two-pass warp:
    //   1. Pull any sub-min segment up to MIN_SEGMENT_PCT (so "RESET"
    //      label is readable), redistributing the deficit proportionally
    //      from over-min segments.
    //   2. Shift REBALANCE_SHIFT_PCT from the largest non-tiny segment
    //      into the next-largest non-tiny segment. Without this the chart
    //      over-emphasizes the longest phase — for Pyro's hangar, raw
    //      proportional + min-only leaves Charging visually dominating
    //      Active 2:1, and the 5-min Reset bigger than a 12-min Active
    //      sub-phase. The shift compresses Charging and grows Active so
    //      sub-phase widths read in correct relative order
    //      (charging-sub > active-sub > reset).
    // The playhead later remaps narrative position through the same
    // warped coordinate space so it still lines up with segment edges.
    const MIN_SEGMENT_PCT = 7;
    const REBALANCE_SHIFT_PCT = 6;
    const visualLayout = (function () {
      const items = majorBlocks.map(function (b) {
        return {
          block: b,
          rawPct: (b.duration / totalCycle) * 100,
          visualPct: 0,
          visualOffset: 0
        };
      });
      const deficit = items.reduce(function (s, it) {
        return s + (it.rawPct < MIN_SEGMENT_PCT ? MIN_SEGMENT_PCT - it.rawPct : 0);
      }, 0);
      const adequateTotal = items.reduce(function (s, it) {
        return s + (it.rawPct >= MIN_SEGMENT_PCT ? it.rawPct : 0);
      }, 0);
      for (const it of items) {
        if (it.rawPct < MIN_SEGMENT_PCT) {
          it.visualPct = MIN_SEGMENT_PCT;
        } else if (adequateTotal > 0) {
          it.visualPct = it.rawPct - (it.rawPct / adequateTotal) * deficit;
        } else {
          it.visualPct = it.rawPct;
        }
      }

      const eligible = items.filter(function (it) { return it.rawPct >= MIN_SEGMENT_PCT; });
      if (eligible.length >= 2) {
        const sorted = eligible.slice().sort(function (a, b) { return b.visualPct - a.visualPct; });
        const largest = sorted[0];
        const second = sorted[1];
        // Cap the shift so we never invert the order — keep largest > second.
        const shift = Math.min(REBALANCE_SHIFT_PCT, (largest.visualPct - second.visualPct) / 2);
        if (shift > 0) {
          largest.visualPct -= shift;
          second.visualPct += shift;
        }
      }

      let cum = 0;
      for (const it of items) {
        it.visualOffset = cum;
        cum += it.visualPct;
      }
      return items;
    })();

    // Timeline: render one block per parent phase (with internal sub-phase ticks).
    const ruler = card.querySelector('[data-ref="timelineRuler"]');
    const segments = [];
    for (const layoutItem of visualLayout) {
      const block = layoutItem.block;
      const seg = document.createElement('div');
      seg.className = 'timeline__segment timeline__segment--' + block.parentPhase;
      seg.style.width = layoutItem.visualPct + '%';

      // Sub-phase tick marks (skip the leading edge of the block).
      for (let i = 1; i < block.subPhases.length; i++) {
        const sub = block.subPhases[i];
        const local = ((sub.offset - block.offset) / block.duration) * 100;
        const tick = document.createElement('span');
        tick.className = 'timeline__tick';
        tick.style.left = local + '%';
        seg.appendChild(tick);
      }

      const lbl = document.createElement('span');
      lbl.className = 'timeline__segment-label';
      lbl.textContent = block.parentPhase === 'red'   ? 'CHARGING'
                      : block.parentPhase === 'green' ? 'ACTIVE'
                      : 'RESET';
      seg.appendChild(lbl);

      ruler.appendChild(seg);
      segments.push({
        block: block,
        el: seg,
        visualOffset: layoutItem.visualOffset,
        visualPct: layoutItem.visualPct
      });
    }

    // Populate the timezone dropdown. "Local" gets a parenthetical
    // showing the browser's resolved zone so users know what "Local" means.
    const tzSelect = card.querySelector('[data-ref="tzSelect"]');
    let resolvedLocalLabel = '';
    try {
      const r = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (r) resolvedLocalLabel = ' (' + r.replace(/_/g, ' ') + ')';
    } catch (e) { /* fall through */ }

    for (let i = 0; i < TIMEZONE_OPTIONS.length; i++) {
      const opt = TIMEZONE_OPTIONS[i];
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.value === 'auto' ? (opt.label + resolvedLocalLabel) : opt.label;
      tzSelect.appendChild(o);
    }
    tzSelect.value = getStoredTimezone();

    tzSelect.addEventListener('change', function () {
      setStoredTimezone(tzSelect.value);
      // Mirror across any other tz selects on the page so multi-timer
      // setups stay in sync without re-rendering the whole UI.
      document.querySelectorAll('.info-card__tz-select').forEach(function (s) {
        if (s !== tzSelect) s.value = tzSelect.value;
      });
      PyrositeUI.tick();
    });

    const refs = collectRefs(card);
    refs.leds = leds;
    refs.timelineSegments = segments;

    function update(now) {
      const state = PyrositeEngine.getCurrentState(ts, now);
      const phase = state.currentPhase;
      const parent = phase.parentPhase;
      const copy = PARENT_PHASE_COPY[parent] || { headline: phase.label };
      const tz = effectiveTimezone(getStoredTimezone());

      card.dataset.phase = parent;

      refs.phaseLabelMain.textContent = copy.headline;
      // Hero countdown ticks down to the next MAJOR phase change
      // (CHARGING→ACTIVE→RESET). Sub-phase boundaries are still
      // legible in the timeline and the upcoming-schedule list.
      refs.countdown.innerHTML = renderCountdownCells(
        PyrositeEngine.formatCountdown(state.timeRemainingInParent)
      );
      refs.phaseContext.textContent = phase.description;

      const upcoming = PyrositeEngine.getUpcomingPhases(ts, 3, now);

      // LEDs
      for (let i = 0; i < refs.leds.length; i++) {
        const ledState = (phase.leds && phase.leds[i] != null) ? phase.leds[i] : 2;
        const classes = ['led'];
        let label = 'LED ' + (i + 1) + ': ';
        if (ledState === 0) { classes.push('led--red');   label += 'red'; }
        else if (ledState === 1) { classes.push('led--green'); label += 'green'; }
        else                { classes.push('led--off');   label += 'off'; }
        refs.leds[i].className = classes.join(' ');
        refs.leds[i].setAttribute('aria-label', label);
      }

      // Timeline playhead — uses the warped visual coordinate space
      // computed once at build time so the marker still lines up with
      // segment edges even when the reset block has been inflated for
      // label legibility.
      let playheadPct = 0;
      for (const s of refs.timelineSegments) {
        if (state.narrativePosition >= s.block.offset && state.narrativePosition < s.block.end) {
          const frac = (state.narrativePosition - s.block.offset) / s.block.duration;
          playheadPct = s.visualOffset + frac * s.visualPct;
          break;
        }
      }
      refs.playhead.style.left = playheadPct + '%';

      for (const s of refs.timelineSegments) {
        s.el.classList.toggle('is-active', s.block.parentPhase === parent);
      }

      // Upcoming schedule
      refs.scheduleList.innerHTML = '';
      upcoming.forEach(function (item, idx) {
        const li = document.createElement('li');
        li.className = 'schedule-list__item schedule-list__item--' + item.phase.parentPhase;
        const itemCopy = PARENT_PHASE_COPY[item.phase.parentPhase] || { headline: item.phase.label };
        li.innerHTML =
          '<span class="schedule-list__index">' + String(idx + 1).padStart(2, '0') + '</span>' +
          '<span class="schedule-list__phase">' +
            '<span class="schedule-list__dot" aria-hidden="true"></span>' +
            '<span class="schedule-list__phase-name">' + escape(itemCopy.headline) + '</span>' +
            '<span class="schedule-list__phase-sub">' + escape(item.phase.sublabel || '') + '</span>' +
          '</span>' +
          '<span class="schedule-list__time">' +
            '<span class="schedule-list__abs">' + PyrositeEngine.formatLocalTime(item.startTime, tz) + '</span>' +
            '<span class="schedule-list__rel">in ' + PyrositeEngine.formatDuration(item.timeUntilStart) + '</span>' +
          '</span>';
        refs.scheduleList.appendChild(li);
      });
    }

    return { card: card, update: update };
  }

  const PyrositeUI = {
    _container: null,
    _ticker: null,
    _updaters: [],
    _statusEl: null,

    init: function () {
      this._container = document.getElementById('timer-stack');
      this._statusEl = document.getElementById('status-indicator');
      if (!this._container) {
        console.error('Pyrosite: #timer-stack not found');
        return;
      }
      this.render();
      global.addEventListener('pyrosite:config-change', this.render.bind(this));
    },

    // Synchronous re-render of every mounted timer at the current
    // wall-clock time. Used by the timezone dropdown to redraw the
    // schedule list immediately on selection change instead of
    // waiting for the next second-boundary tick.
    tick: function () {
      const now = Date.now();
      for (let i = 0; i < this._updaters.length; i++) {
        try { this._updaters[i](now); }
        catch (err) { console.error('Pyrosite: updater error', err); }
      }
    },

    getActiveTimers: function () {
      if (global.PyrositeConfig && typeof global.PyrositeConfig.getEffectiveTimers === 'function') {
        return global.PyrositeConfig.getEffectiveTimers();
      }
      return global.TIMERS;
    },

    render: function () {
      if (!this._container) return;
      const timers = this.getActiveTimers();

      if (this._ticker) {
        this._ticker.stop();
        this._ticker = null;
      }

      this._container.innerHTML = '';
      this._updaters = [];

      for (const key in timers) {
        if (!Object.prototype.hasOwnProperty.call(timers, key)) continue;
        try {
          const built = buildTimerCard(timers[key]);
          this._container.appendChild(built.card);
          this._updaters.push(built.update);
        } catch (err) {
          console.error('Pyrosite: failed to build timer "' + key + '"', err);
          const errEl = document.createElement('div');
          errEl.className = 'timer-card timer-card--error';
          errEl.textContent = 'Timer "' + key + '" failed to load: ' + err.message;
          this._container.appendChild(errEl);
        }
      }

      const self = this;
      const tickAll = function () {
        const now = Date.now();
        for (let i = 0; i < self._updaters.length; i++) {
          try { self._updaters[i](now); }
          catch (err) { console.error('Pyrosite: updater error', err); }
        }
      };

      tickAll();
      this._ticker = PyrositeEngine.startTicking(tickAll);

      if (this._statusEl) {
        this._statusEl.classList.add('is-live');
      }
    }
  };

  global.PyrositeUI = PyrositeUI;

  function boot() {
    PyrositeUI.init();
    if (global.PyrositeConfig && typeof global.PyrositeConfig.init === 'function') {
      global.PyrositeConfig.init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
