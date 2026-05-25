/**
 * Pyrosite — Config Panel
 * ============================================================
 *
 * Owns localStorage overrides and renders the calibration UI.
 * Overrides are stored keyed by timer.id (not the JS key in
 * TIMERS) so the storage survives if a developer renames the
 * config-object key but keeps the same in-game timer.
 *
 * Storage shape:
 *   {
 *     [timerId]: {
 *       epoch?: number,
 *       epochPhaseId?: string,
 *       phases?: { [phaseId]: { duration: number (ms) } }
 *     }
 *   }
 * ============================================================
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'pyrosite.overrides.v1';
  const STATUS_RESET_MS = 3500;

  function escape(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadOverrides() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      console.warn('Pyrosite: could not parse stored overrides', e);
      return {};
    }
  }

  function saveOverrides(overrides) {
    try {
      if (Object.keys(overrides).length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
      }
      return true;
    } catch (e) {
      console.error('Pyrosite: could not save overrides', e);
      return false;
    }
  }

  function buildEffectiveTimer(orig, override) {
    if (!override) return orig;
    const next = Object.assign({}, orig);
    if (override.epoch != null && isFinite(override.epoch)) next.epoch = override.epoch;
    if (override.epochPhaseId) next.epochPhaseId = override.epochPhaseId;
    const phaseOv = override.phases || {};
    next.phases = orig.phases.map(function (p) {
      const ov = phaseOv[p.id];
      if (!ov || ov.duration == null || !isFinite(ov.duration) || ov.duration <= 0) return p;
      return Object.assign({}, p, { duration: ov.duration });
    });
    return next;
  }

  // ISO 8601 datetime fields work with millisecond resolution but
  // <input type="datetime-local"> renders local time. We stay in UTC
  // text so calibration matches what the operator reads on time.is/UTC.
  function epochToIsoUtc(ms) {
    if (!isFinite(ms)) return '';
    try {
      return new Date(ms).toISOString();
    } catch (e) {
      return '';
    }
  }

  function isoToEpoch(iso) {
    if (!iso) return NaN;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? NaN : d.getTime();
  }

  function showStatus(el, message, kind) {
    if (!el) return;
    el.textContent = message;
    el.className = 'config-status';
    if (kind) el.classList.add('is-' + kind);
    clearTimeout(el._resetTimer);
    el._resetTimer = setTimeout(function () {
      el.textContent = '';
      el.className = 'config-status';
    }, STATUS_RESET_MS);
  }

  function buildTimerBlock(timer, root) {
    const overrides = loadOverrides();
    const override = overrides[timer.id] || {};
    const effectiveEpoch = override.epoch != null ? override.epoch : timer.epoch;
    const effectiveEpochPhaseId = override.epochPhaseId || timer.epochPhaseId;
    const idSafe = timer.id.replace(/[^a-z0-9-]/gi, '_');
    const hasOverride = Object.keys(override).length > 0;

    // Slider works against the *narrative* cycle (red-1 → … → black),
    // so its value space is independent of whichever epochPhaseId the
    // operator most recently set. Dragging the slider implicitly
    // resets epochPhaseId to the first phase in the timer config.
    const totalCycleMs = timer.phases.reduce(function (s, p) { return s + p.duration; }, 0);
    const currentPositionMs = ((Date.now() - effectiveEpoch) % totalCycleMs + totalCycleMs) % totalCycleMs;
    const firstPhaseId = timer.phases[0].id;

    // Per-parent dim color for the slider track gradient.
    function dimColorFor(parent) {
      if (parent === 'red')   return 'var(--phase-red-dim)';
      if (parent === 'green') return 'var(--phase-green-dim)';
      return 'var(--phase-amber-dim)';
    }

    // Hard color stops so each parent block is a flat band (not blended).
    // While walking the phases, also record the inner sub-phase boundaries
    // (skipping parent boundaries — those are already marked by the color
    // change in the gradient).
    const gradientStops = [];
    const subPhaseTickPcts = [];
    let gradCursor = 0;
    for (let i = 0; i < timer.phases.length; i++) {
      const p = timer.phases[i];
      const startPct = (gradCursor / totalCycleMs) * 100;
      gradCursor += p.duration;
      const endPct = (gradCursor / totalCycleMs) * 100;
      const c = dimColorFor(p.parentPhase);
      gradientStops.push(c + ' ' + startPct + '%');
      gradientStops.push(c + ' ' + endPct + '%');

      const next = timer.phases[i + 1];
      if (next && next.parentPhase === p.parentPhase) {
        subPhaseTickPcts.push(endPct);
      }
    }
    const trackGradient = 'linear-gradient(to right, ' + gradientStops.join(', ') + ')';

    let sliderTicksHTML = '';
    for (let i = 0; i < subPhaseTickPcts.length; i++) {
      sliderTicksHTML +=
        '<span class="config-slider__tick" style="left:' + subPhaseTickPcts[i] + '%;"></span>';
    }

    // Precompute sub-phase boundaries with cumulative offsets, used by
    // the readout to name the phase under the slider thumb.
    const narrativeWithOffsets = [];
    let nCursor = 0;
    for (let i = 0; i < timer.phases.length; i++) {
      const p = timer.phases[i];
      narrativeWithOffsets.push({ phase: p, offset: nCursor, end: nCursor + p.duration });
      nCursor += p.duration;
    }

    function phaseAtPosition(ms) {
      for (let i = 0; i < narrativeWithOffsets.length; i++) {
        const item = narrativeWithOffsets[i];
        if (ms >= item.offset && ms < item.end) return item;
      }
      return narrativeWithOffsets[narrativeWithOffsets.length - 1];
    }

    const block = document.createElement('div');
    block.className = 'config-block';

    let phaseOptions = '';
    for (let i = 0; i < timer.phases.length; i++) {
      const p = timer.phases[i];
      const selected = p.id === effectiveEpochPhaseId ? ' selected' : '';
      phaseOptions +=
        '<option value="' + escape(p.id) + '"' + selected + '>' +
          escape(p.label) + ' — ' + escape(p.sublabel) + ' (' + escape(p.id) + ')' +
        '</option>';
    }

    let phaseDurationFields = '';
    for (let i = 0; i < timer.phases.length; i++) {
      const p = timer.phases[i];
      const ov = override.phases && override.phases[p.id];
      const effDur = (ov && ov.duration != null) ? ov.duration : p.duration;
      const mins = (effDur / 60000);
      phaseDurationFields +=
        '<div class="config-field">' +
          '<label class="config-field__label" for="dur-' + idSafe + '-' + escape(p.id) + '">' +
            escape(p.id) +
            '<span class="config-field__label-hint">' + escape(p.sublabel) + '</span>' +
          '</label>' +
          '<input class="config-field__input" type="number" step="any" min="0.001" ' +
                 'id="dur-' + idSafe + '-' + escape(p.id) + '" ' +
                 'data-phase-id="' + escape(p.id) + '" ' +
                 'value="' + mins + '">' +
        '</div>';
    }

    block.innerHTML =
      '<h3 class="config-block__title">' +
        escape(timer.name) +
        (hasOverride ? '<span class="config-overrides-flag">OVERRIDES ACTIVE</span>' : '') +
      '</h3>' +

      '<div class="config-field">' +
        '<label class="config-field__label" for="slider-' + idSafe + '">' +
          'Cycle Position (quick calibrate)' +
          '<span class="config-field__label-hint">Drag to roughly where you think the cycle is, then click Apply. Resets epoch phase to ' + escape(firstPhaseId) + '.</span>' +
        '</label>' +
        '<div class="config-slider">' +
          '<div class="config-slider__rail">' +
            '<div class="config-slider__track" style="background:' + trackGradient + ';">' +
              sliderTicksHTML +
            '</div>' +
            '<input type="range" class="config-slider__input" id="slider-' + idSafe + '" ' +
                   'min="0" max="' + (totalCycleMs - 1000) + '" step="1000" ' +
                   'value="' + Math.floor(currentPositionMs) + '" ' +
                   'aria-label="Cycle position">' +
          '</div>' +
          '<div class="config-slider__readout" data-ref="sliderReadout">' +
            '<span class="config-slider__readout-pos" data-ref="sliderPos">—</span>' +
            '<span class="config-slider__readout-phase" data-ref="sliderPhase">—</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="config-field">' +
        '<label class="config-field__label" for="iso-' + idSafe + '">' +
          'UTC Datetime' +
          '<span class="config-field__label-hint">e.g. 2026-05-23T14:30:00Z</span>' +
        '</label>' +
        '<input class="config-field__input" type="text" id="iso-' + idSafe + '" ' +
               'spellcheck="false" autocapitalize="off" autocomplete="off" ' +
               'value="' + escape(epochToIsoUtc(effectiveEpoch)) + '">' +
      '</div>' +

      '<div class="config-field">' +
        '<label class="config-field__label" for="ms-' + idSafe + '">' +
          'Epoch (UTC ms)' +
          '<span class="config-field__label-hint">Auto-syncs with datetime above.</span>' +
        '</label>' +
        '<input class="config-field__input config-field__input--readout" type="number" step="1" ' +
               'id="ms-' + idSafe + '" value="' + effectiveEpoch + '">' +
      '</div>' +

      '<div class="config-field">' +
        '<label class="config-field__label" for="phase-' + idSafe + '">' +
          'Epoch Phase' +
          '<span class="config-field__label-hint">Which phase was starting at the epoch moment.</span>' +
        '</label>' +
        '<select class="config-field__input" id="phase-' + idSafe + '">' +
          phaseOptions +
        '</select>' +
      '</div>' +

      '<div class="config-block__title" style="margin-top: var(--space-2);">' +
        'Phase Durations (minutes)' +
      '</div>' +
      '<div class="config-grid">' +
        phaseDurationFields +
      '</div>' +

      '<div class="config-actions">' +
        '<button type="button" class="config-btn config-btn--primary" data-action="apply">Apply</button>' +
        '<button type="button" class="config-btn config-btn--ghost" data-action="reset">Reset to defaults</button>' +
        '<span class="config-status" data-ref="status" role="status" aria-live="polite"></span>' +
      '</div>';

    root.appendChild(block);

    const isoInput = block.querySelector('#iso-' + idSafe);
    const msInput  = block.querySelector('#ms-' + idSafe);
    const phaseSel = block.querySelector('#phase-' + idSafe);
    const slider   = block.querySelector('#slider-' + idSafe);
    const sliderPosEl   = block.querySelector('[data-ref="sliderPos"]');
    const sliderPhaseEl = block.querySelector('[data-ref="sliderPhase"]');
    const durInputs = block.querySelectorAll('[data-phase-id]');
    const statusEl = block.querySelector('[data-ref="status"]');

    function fmtDur(ms) {
      // Inline shim so the panel doesn't depend on engine load order.
      if (typeof PyrositeEngine !== 'undefined' && PyrositeEngine.formatDuration) {
        return PyrositeEngine.formatDuration(ms);
      }
      const total = Math.max(0, Math.round(ms / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      return h > 0 ? (h + 'h ' + m + 'm') : (m + 'm');
    }

    function updateSliderReadout(positionMs) {
      const item = phaseAtPosition(positionMs);
      const elapsed = positionMs - item.offset;
      sliderPosEl.textContent = fmtDur(positionMs) + ' / ' + fmtDur(totalCycleMs);
      const parent = item.phase.parentPhase;
      const label = parent === 'red'   ? 'CHARGING'
                  : parent === 'green' ? 'ACTIVE'
                                       : 'RESET';
      sliderPhaseEl.textContent =
        label + ' · ' + item.phase.sublabel + ' (' + fmtDur(elapsed) + ' in)';
      sliderPhaseEl.dataset.phase = parent;
    }

    function syncSliderFromEpoch(epoch) {
      if (!isFinite(epoch)) return;
      const pos = ((Date.now() - epoch) % totalCycleMs + totalCycleMs) % totalCycleMs;
      slider.value = String(Math.floor(pos));
      updateSliderReadout(pos);
    }

    updateSliderReadout(currentPositionMs);

    // Programmatic .value writes don't fire input events, so these
    // handlers can update each other freely without a feedback loop.
    isoInput.addEventListener('input', function () {
      const ms = isoToEpoch(isoInput.value);
      if (!isNaN(ms)) {
        msInput.value = String(ms);
        syncSliderFromEpoch(ms);
        isoInput.setCustomValidity('');
      } else {
        isoInput.setCustomValidity('Invalid ISO datetime');
      }
    });

    msInput.addEventListener('input', function () {
      const ms = parseInt(msInput.value, 10);
      if (!isNaN(ms)) {
        isoInput.value = epochToIsoUtc(ms);
        syncSliderFromEpoch(ms);
      }
    });

    slider.addEventListener('input', function () {
      const positionMs = parseInt(slider.value, 10);
      if (isNaN(positionMs)) return;
      const newEpoch = Date.now() - positionMs;
      msInput.value = String(newEpoch);
      isoInput.value = epochToIsoUtc(newEpoch);
      isoInput.setCustomValidity('');
      // Slider works from position-0 = first phase. Force the select
      // to match so the engine math agrees with what the user is seeing.
      phaseSel.value = firstPhaseId;
      updateSliderReadout(positionMs);
    });

    block.querySelector('[data-action="apply"]').addEventListener('click', function () {
      const ms = parseInt(msInput.value, 10);
      if (isNaN(ms)) {
        showStatus(statusEl, 'Invalid epoch value', 'error');
        return;
      }

      const phaseDurations = {};
      let firstError = null;
      durInputs.forEach(function (inp) {
        if (firstError) return;
        const mins = parseFloat(inp.value);
        if (isNaN(mins) || mins <= 0) {
          firstError = 'Invalid duration for "' + inp.dataset.phaseId + '" — must be > 0 minutes';
          return;
        }
        phaseDurations[inp.dataset.phaseId] = { duration: Math.round(mins * 60000) };
      });
      if (firstError) {
        showStatus(statusEl, firstError, 'error');
        return;
      }

      const all = loadOverrides();
      all[timer.id] = {
        epoch: ms,
        epochPhaseId: phaseSel.value,
        phases: phaseDurations
      };
      const ok = saveOverrides(all);
      if (!ok) {
        showStatus(statusEl, 'Could not save — localStorage blocked?', 'error');
        return;
      }
      showStatus(statusEl, 'Applied · timer updated', 'success');
      // Query the DOM each click — a captured-at-render-time variable
      // is stale after the first Apply, so previous versions appended
      // a fresh flag on every click and they piled up.
      const titleEl = block.querySelector('.config-block__title');
      if (titleEl && !titleEl.querySelector('.config-overrides-flag')) {
        const flag = document.createElement('span');
        flag.className = 'config-overrides-flag';
        flag.textContent = 'OVERRIDES ACTIVE';
        titleEl.appendChild(flag);
      }
      global.dispatchEvent(new CustomEvent('pyrosite:config-change'));
    });

    block.querySelector('[data-action="reset"]').addEventListener('click', function () {
      const all = loadOverrides();
      if (!all[timer.id]) {
        showStatus(statusEl, 'Already using defaults', 'info');
        return;
      }
      delete all[timer.id];
      saveOverrides(all);
      showStatus(statusEl, 'Reset to defaults · timer updated', 'info');
      global.dispatchEvent(new CustomEvent('pyrosite:config-change'));
      // Re-render so the form fields reflect the default values.
      PyrositeConfig.render();
    });
  }

  const PyrositeConfig = {
    STORAGE_KEY: STORAGE_KEY,

    init: function () {
      this._container = document.getElementById('config-panel-body');
      if (!this._container) {
        console.warn('Pyrosite: config-panel-body not found');
        return;
      }
      this.render();
    },

    getEffectiveTimers: function () {
      if (!global.TIMERS) return {};
      const overrides = loadOverrides();
      const result = {};
      for (const key in global.TIMERS) {
        if (!Object.prototype.hasOwnProperty.call(global.TIMERS, key)) continue;
        const orig = global.TIMERS[key];
        result[key] = buildEffectiveTimer(orig, overrides[orig.id]);
      }
      return result;
    },

    hasOverrides: function () {
      return Object.keys(loadOverrides()).length > 0;
    },

    render: function () {
      if (!this._container || !global.TIMERS) return;
      this._container.innerHTML = '';
      for (const key in global.TIMERS) {
        if (!Object.prototype.hasOwnProperty.call(global.TIMERS, key)) continue;
        buildTimerBlock(global.TIMERS[key], this._container);
      }
    }
  };

  global.PyrositeConfig = PyrositeConfig;
})(typeof window !== 'undefined' ? window : globalThis);
