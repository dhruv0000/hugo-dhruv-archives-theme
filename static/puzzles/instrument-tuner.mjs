import { renderPuzzlePanelHeader } from './panel.mjs';
import { PitchDetector } from './vendor/pitchy.mjs';

const NOTE_TO_SEMITONE = Object.freeze({
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
});

const NOTE_NAMES_SHARP = Object.freeze(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);
const SCIENTIFIC_NOTE_PATTERN = /^([A-Ga-g])([#b]?)(-?\d+)$/;
const CUSTOM_TUNING_ID_PREFIX = 'custom:';
const TUNED_CENTS_THRESHOLD = 8;
const TUNED_FRAME_THRESHOLD = 3;
const MAX_METER_CENTS = 50;
const HELD_GUIDANCE_MS = 2500;
const DETECTOR_BUFFER_SIZE = 4096;
const MIN_PITCH_CLARITY = 0.92;
const MIN_PITCH_FREQUENCY = 30;
const MAX_PITCH_FREQUENCY = 1400;
const DETECTION_SMOOTHING_WINDOW = 5;

export const PRESET_TUNINGS = Object.freeze([
  { id: 'preset:guitar', label: 'Guitar', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'preset:ukulele', label: 'Ukulele', notes: ['G4', 'C4', 'E4', 'A4'] },
  { id: 'preset:bass', label: 'Bass', notes: ['E1', 'A1', 'D2', 'G2'] },
  { id: 'preset:violin', label: 'Violin', notes: ['G3', 'D4', 'A4', 'E5'] },
  { id: 'preset:mandolin', label: 'Mandolin', notes: ['G3', 'D4', 'A4', 'E5'] },
]);

function escapeHtml(value) {
  return `${value ?? ''}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeNoteToken(token) {
  const match = `${token || ''}`.trim().match(SCIENTIFIC_NOTE_PATTERN);
  if (!match) {
    return null;
  }

  const letter = match[1].toUpperCase();
  const accidental = match[2] || '';
  const octave = match[3];
  const note = `${letter}${accidental}`;

  if (!(note in NOTE_TO_SEMITONE)) {
    return null;
  }

  return `${note}${octave}`;
}

export function noteNameToMidi(noteName) {
  const normalized = normalizeNoteToken(noteName);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(SCIENTIFIC_NOTE_PATTERN);
  const octave = Number.parseInt(match[3], 10);
  return NOTE_TO_SEMITONE[`${match[1]}${match[2] || ''}`] + (octave + 1) * 12;
}

export function noteNameToFrequency(noteName) {
  const midi = noteNameToMidi(noteName);
  if (!Number.isFinite(midi)) {
    return null;
  }

  return 440 * 2 ** ((midi - 69) / 12);
}

function frequencyToMidi(frequency) {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    return null;
  }

  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

export function frequencyToNoteName(frequency) {
  const midi = frequencyToMidi(frequency);
  if (!Number.isFinite(midi)) {
    return null;
  }

  const note = NOTE_NAMES_SHARP[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

export function centsBetween(frequency, targetFrequency) {
  if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(targetFrequency) || targetFrequency <= 0) {
    return null;
  }

  return 1200 * Math.log2(frequency / targetFrequency);
}

export function parseTuningInput(value) {
  const tokens = Array.isArray(value)
    ? value
    : `${value || ''}`.split(/\s+/).filter(Boolean);
  const notes = [];
  const invalidTokens = [];

  for (const token of tokens) {
    const normalized = normalizeNoteToken(token);
    if (!normalized) {
      invalidTokens.push(`${token}`);
      continue;
    }

    notes.push(normalized);
  }

  return {
    notes,
    invalidTokens,
  };
}

function slugify(value) {
  return `${value || ''}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'tuning';
}

export function createCustomTuningId(label) {
  return `${CUSTOM_TUNING_ID_PREFIX}${slugify(label)}:${Date.now().toString(36)}`;
}

export function buildTuningTargets(tuning) {
  return (tuning?.notes || [])
    .map((note, index) => {
      const frequency = noteNameToFrequency(note);
      if (!Number.isFinite(frequency)) {
        return null;
      }

      return {
        index,
        note,
        frequency,
      };
    })
    .filter(Boolean);
}

export function findClosestTuningTarget(targets, frequency, { completed = [], incompleteOnly = false } = {}) {
  if (!Array.isArray(targets) || !targets.length || !Number.isFinite(frequency) || frequency <= 0) {
    return null;
  }

  const candidates = targets.filter((target) => !(incompleteOnly && completed[target.index]));
  const pool = candidates.length ? candidates : targets;

  return pool
    .map((target) => ({
      target,
      cents: centsBetween(frequency, target.frequency),
    }))
    .filter((entry) => Number.isFinite(entry.cents))
    .sort((left, right) => Math.abs(left.cents) - Math.abs(right.cents))[0] || null;
}

export function isTuningSessionComplete(completed) {
  return Array.isArray(completed) && completed.length > 0 && completed.every(Boolean);
}

function median(values) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function getPitchGuidance(cents) {
  if (!Number.isFinite(cents)) {
    return {
      state: 'unknown',
      label: 'Listen',
      detail: 'Pluck a string cleanly to place it on the meter.',
      instruction: 'No stable pitch yet',
    };
  }

  const rounded = Math.abs(Math.round(cents));
  if (Math.abs(cents) <= TUNED_CENTS_THRESHOLD) {
    return {
      state: 'in-tune',
      label: 'In tune',
      detail: `Within ${rounded} cents of center.`,
      instruction: 'Hold steady',
    };
  }

  if (cents < 0) {
    return {
      state: 'flat',
      label: 'Tune up',
      detail: `${rounded} cents flat.`,
      instruction: 'Tighten or raise pitch',
    };
  }

  return {
    state: 'sharp',
    label: 'Tune down',
    detail: `${rounded} cents sharp.`,
    instruction: 'Loosen or lower pitch',
  };
}

function getAudioSupportState() {
  return {
    hasMediaDevices: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    AudioContextClass:
      typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext || null) : null,
  };
}

function resolveTuningOptions(customTunings = []) {
  return [...PRESET_TUNINGS, ...customTunings];
}

function resolveSelectedTuning(options, tuningId) {
  return options.find((entry) => entry.id === tuningId) || options[0] || null;
}

function getMeterOffset(cents) {
  if (!Number.isFinite(cents)) {
    return 50;
  }

  const clamped = Math.max(-MAX_METER_CENTS, Math.min(MAX_METER_CENTS, cents));
  return ((clamped + MAX_METER_CENTS) / (MAX_METER_CENTS * 2)) * 100;
}

export function createInstrumentTunerModule() {
  let root = null;
  let context = null;
  let audioContext = null;
  let mediaStream = null;
  let analyser = null;
  let sourceNode = null;
  let frameId = 0;
  let sampleBuffer = null;
  let pitchDetector = null;
  let currentTuningId = PRESET_TUNINGS[0].id;
  let tuningTargets = [];
  let completed = [];
  let consecutiveHits = [];
  let recentFrequencies = [];
  let sessionStartedAt = 0;
  let isListening = false;
  let statusMessage = 'Choose a tuning and start the mic.';
  let errorMessage = '';
  let detectedNote = '—';
  let detectedFrequency = null;
  let targetInfo = null;
  let lastHeardAt = 0;
  let lastStableReading = null;
  let lockedTargetIndex = null;
  let listMarkupCache = '';
  let customName = '';
  let customNotes = '';

  function resetSessionProgress() {
    completed = tuningTargets.map(() => false);
    consecutiveHits = tuningTargets.map(() => 0);
    detectedNote = '—';
    detectedFrequency = null;
    targetInfo = null;
    lastHeardAt = 0;
    lastStableReading = null;
    recentFrequencies = [];
    lockedTargetIndex = null;
    listMarkupCache = '';
  }

  function getLockedTarget() {
    return Number.isInteger(lockedTargetIndex) ? tuningTargets[lockedTargetIndex] || null : null;
  }

  function clearLockedTarget() {
    lockedTargetIndex = null;
  }

  function toggleLockedTarget(index) {
    lockedTargetIndex = lockedTargetIndex === index ? null : index;
    targetInfo = null;
    lastStableReading = null;
    detectedFrequency = null;
    detectedNote = '—';
    recentFrequencies = [];
  }

  function getModeState() {
    return context?.getModeState?.() || {};
  }

  function getOptions() {
    return resolveTuningOptions(context?.getCustomTunings?.() || []);
  }

  function getSelectedTuning() {
    return resolveSelectedTuning(getOptions(), currentTuningId);
  }

  function syncSelectedTuning() {
    const modeState = getModeState();
    const options = getOptions();
    const selected = resolveSelectedTuning(options, modeState.selectedTuningId || currentTuningId);
    if (!selected) {
      return null;
    }

    currentTuningId = selected.id;
    tuningTargets = buildTuningTargets(selected);
    if (!tuningTargets.length) {
      tuningTargets = buildTuningTargets(PRESET_TUNINGS[0]);
      currentTuningId = PRESET_TUNINGS[0].id;
    }
    resetSessionProgress();
    return selected;
  }

  function setStatus(nextStatus, nextError = '') {
    statusMessage = nextStatus;
    errorMessage = nextError;
    updateLiveState();
  }

  function stopAudio(clearProgress = true) {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }

    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }

    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        track.stop();
      }
      mediaStream = null;
    }

    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }

    analyser = null;
    sampleBuffer = null;
    pitchDetector = null;
    isListening = false;

    if (clearProgress) {
      context?.clearProgress?.();
    }
  }

  function updateLiveState() {
    if (!root) {
      return;
    }

    const selected = getSelectedTuning();
    const statusNode = root.querySelector('[data-tuner-status]');
    const errorNode = root.querySelector('[data-tuner-error]');
    const buttonNode = root.querySelector('[data-tuner-toggle]');
    const detectedNode = root.querySelector('[data-tuner-detected]');
    const frequencyNode = root.querySelector('[data-tuner-frequency]');
    const targetNode = root.querySelector('[data-tuner-target]');
    const driftNode = root.querySelector('[data-tuner-drift]');
    const detailNode = root.querySelector('[data-tuner-detail]');
    const cueNode = root.querySelector('[data-tuner-cue]');
    const heardNode = root.querySelector('[data-tuner-heard]');
    const needleNode = root.querySelector('[data-tuner-needle]');
    const meterNode = root.querySelector('[data-tuner-meter]');
    const listNode = root.querySelector('[data-tuner-strings]');
    const lockedTarget = getLockedTarget();
    const effectiveReading = targetInfo || lastStableReading;
    const guidance = getPitchGuidance(effectiveReading?.cents);
    const isHeldReading = !targetInfo && Boolean(lastStableReading) && isListening;

    if (statusNode) {
      statusNode.textContent = statusMessage;
    }
    if (errorNode) {
      errorNode.textContent = errorMessage;
      errorNode.hidden = !errorMessage;
    }
    if (buttonNode) {
      buttonNode.textContent = isListening ? 'Stop mic' : 'Start mic';
    }
    if (detectedNode) {
      detectedNode.textContent = detectedNote;
    }
    if (frequencyNode) {
      frequencyNode.textContent = Number.isFinite(detectedFrequency)
        ? `${detectedFrequency.toFixed(1)} Hz live`
        : isHeldReading && Number.isFinite(lastStableReading?.frequency)
          ? `${lastStableReading.frequency.toFixed(1)} Hz last heard`
          : 'No stable pitch yet';
    }
    if (targetNode) {
      targetNode.textContent = effectiveReading?.target?.note || lockedTarget?.note || (selected?.notes?.[0] || '—');
    }
    if (driftNode) {
      driftNode.textContent = guidance.label;
    }
    if (detailNode) {
      detailNode.textContent = guidance.detail;
    }
    if (cueNode) {
      cueNode.textContent = guidance.instruction;
    }
    if (heardNode) {
      heardNode.textContent = lockedTarget
        ? `Locked ${lockedTarget.note}`
        : isHeldReading
          ? 'Held reading'
          : isListening
            ? 'Live'
            : 'Idle';
    }
    if (needleNode) {
      needleNode.style.left = `${getMeterOffset(effectiveReading?.cents)}%`;
    }
    if (meterNode) {
      meterNode.dataset.state = guidance.state;
      meterNode.dataset.mode = lockedTarget ? 'locked' : 'auto';
    }
    if (listNode) {
      const nextMarkup = tuningTargets
        .map((target) => {
          const isComplete = completed[target.index];
          const isActive = effectiveReading?.target?.index === target.index;
          const isLocked = lockedTarget?.index === target.index;
          return `
            <li class="tuner-string-item${isComplete ? ' is-complete' : ''}${isActive ? ' is-active' : ''}${isLocked ? ' is-locked' : ''}" data-target-index="${target.index}" tabindex="0" role="button" aria-pressed="${isLocked ? 'true' : 'false'}">
              <span class="tuner-string-note">${escapeHtml(target.note)}</span>
              <span class="tuner-string-state">${isComplete ? 'Locked' : isLocked ? `${guidance.label} target` : isActive ? guidance.label : 'Pending'}</span>
            </li>
          `;
        })
        .join('');

      if (nextMarkup !== listMarkupCache) {
        listNode.innerHTML = nextMarkup;
        listMarkupCache = nextMarkup;
      }
    }
  }

  function render() {
    const modeState = getModeState();
    const options = getOptions();
    const selected = resolveSelectedTuning(options, currentTuningId) || PRESET_TUNINGS[0];
    const header = renderPuzzlePanelHeader({
      title: 'Instrument Tuner',
      description: 'Pick a preset, allow the mic, and lock each string once to count a full local tuning. Advanced options let you save a custom note sequence locally.',
      levelPicker: `
        <div class="tuner-level-placeholder">
          <span>${escapeHtml(selected.label)}</span>
        </div>
      `,
      statsLabel: 'Instrument tuner stats',
      rows: [
        [
          { label: 'Selected', value: escapeHtml(modeState.selectedInstrumentLabel || selected.label) },
        ],
        [
          { label: 'Notes', value: escapeHtml(selected.notes.join(' ')), valueColSpan: 3 },
        ],
      ],
    });

    root.innerHTML = `
      <section class="puzzle-card tuner-card">
        ${header}
        <div class="tuner-workbench">
          <section class="tuner-controls-card">
            <label class="tuner-field">
              <span>Tuning source</span>
              <select class="tuner-select" data-tuner-select>
                ${options.map((option) => `
                  <option value="${escapeHtml(option.id)}"${option.id === currentTuningId ? ' selected' : ''}>
                    ${escapeHtml(option.label)}
                  </option>
                `).join('')}
              </select>
            </label>
            <div class="tuner-button-row">
              <button type="button" class="puzzle-button" data-tuner-toggle>${isListening ? 'Stop mic' : 'Start mic'}</button>
            </div>
            <p class="tuner-status" data-tuner-status>${escapeHtml(statusMessage)}</p>
            <p class="tuner-error" data-tuner-error hidden></p>
            <details class="tuner-advanced-panel">
              <summary class="tuner-advanced-toggle">
                <span class="tuner-advanced-copy">
                  <strong>Advanced options</strong>
                  <em>Create and save a custom tuning</em>
                </span>
                <span class="tuner-advanced-chevron" aria-hidden="true">v</span>
              </summary>
              <div class="tuner-advanced-body">
                <form class="tuner-custom-form" data-custom-form>
                  <label class="tuner-field">
                    <span>Custom tuning name</span>
                    <input
                      class="tuner-input"
                      type="text"
                      name="label"
                      value="${escapeHtml(customName)}"
                      placeholder="Open D guitar"
                    />
                  </label>
                  <label class="tuner-field">
                    <span>Ordered notes</span>
                    <input
                      class="tuner-input"
                      type="text"
                      name="notes"
                      value="${escapeHtml(customNotes)}"
                      placeholder="D2 A2 D3 F#3 A3 D4"
                    />
                  </label>
                  <button type="submit" class="puzzle-button puzzle-button-secondary">Save custom tuning</button>
                </form>
              </div>
            </details>
          </section>
          <section class="tuner-meter-card">
            <div class="tuner-meter-head">
              <div class="tuner-note-block">
                <p class="puzzle-kicker">Detected</p>
                <div class="tuner-note-readout" data-tuner-detected>${escapeHtml(detectedNote)}</div>
                <p class="tuner-meter-frequency" data-tuner-frequency>${Number.isFinite(detectedFrequency) ? `${detectedFrequency.toFixed(1)} Hz` : 'No stable pitch yet'}</p>
              </div>
              <div class="tuner-meter-target">
                <span>Target</span>
                <strong data-tuner-target>${escapeHtml(selected.notes[0] || '—')}</strong>
                <em data-tuner-heard>Idle</em>
              </div>
            </div>
            <div class="tuner-guidance-panel" data-tuner-meter data-state="unknown">
              <div class="tuner-guidance-top">
                <strong data-tuner-drift>Listen</strong>
                <span data-tuner-detail>Pluck a string cleanly to place it on the meter.</span>
              </div>
              <div class="tuner-guidance-cue" data-tuner-cue>No stable pitch yet</div>
            </div>
            <div class="tuner-meter-track">
              <span>-50</span>
              <div class="tuner-meter-bar">
                <div class="tuner-meter-center"></div>
                <div class="tuner-meter-needle" data-tuner-needle></div>
              </div>
              <span>+50</span>
            </div>
            <ul class="tuner-string-list" data-tuner-strings></ul>
          </section>
        </div>
      </section>
    `;

    root.querySelector('[data-tuner-select]')?.addEventListener('change', (event) => {
      const nextId = event.currentTarget.value;
      const nextSelected = resolveSelectedTuning(getOptions(), nextId);
      stopAudio(true);
      currentTuningId = nextSelected?.id || PRESET_TUNINGS[0].id;
      tuningTargets = buildTuningTargets(nextSelected || PRESET_TUNINGS[0]);
      resetSessionProgress();
      context?.setSelectedTuning?.({
        tuningId: currentTuningId,
        label: nextSelected?.label || PRESET_TUNINGS[0].label,
      });
      setStatus(`Selected ${nextSelected?.label || PRESET_TUNINGS[0].label}. Start the mic when ready.`);
      render();
    });

    const handleTargetLock = (event) => {
      const item = event.target.closest('[data-target-index]');
      if (!item) {
        return;
      }

      const index = Number.parseInt(item.dataset.targetIndex, 10);
      if (!Number.isInteger(index)) {
        return;
      }

      event.preventDefault();
      toggleLockedTarget(index);
      const target = getLockedTarget();
      setStatus(
        target
          ? `Locked to ${target.note}. The hints will now tune that string specifically.`
          : 'Returned to automatic target detection.',
      );
      updateLiveState();
    };

    root.querySelector('[data-tuner-strings]')?.addEventListener('pointerdown', handleTargetLock);

    root.querySelector('[data-tuner-strings]')?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      const item = event.target.closest('[data-target-index]');
      if (!item) {
        return;
      }

      event.preventDefault();
      item.click();
    });

    root.querySelector('[data-tuner-toggle]')?.addEventListener('click', () => {
      if (isListening) {
        stopAudio(true);
        setStatus('Mic stopped. Start again for another pass.');
        return;
      }

      startListening();
    });

    root.querySelector('[data-custom-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const label = `${formData.get('label') || ''}`.trim();
      const notesInput = `${formData.get('notes') || ''}`.trim();
      const parsed = parseTuningInput(notesInput);

      customName = label;
      customNotes = notesInput;

      if (!label) {
        setStatus('Add a name for the custom tuning.', 'Custom tuning name is required.');
        return;
      }

      if (!parsed.notes.length) {
        setStatus('Add at least one valid target note.', 'No valid note tokens found.');
        return;
      }

      if (parsed.invalidTokens.length) {
        setStatus(
          'Fix the custom note list before saving.',
          `Invalid note tokens: ${parsed.invalidTokens.join(', ')}`,
        );
        return;
      }

      const tuning = {
        id: createCustomTuningId(label),
        label,
        notes: parsed.notes,
      };

      context?.saveCustomTuning?.(tuning);
      context?.setSelectedTuning?.({
        tuningId: tuning.id,
        label: tuning.label,
      });
      stopAudio(true);
      currentTuningId = tuning.id;
      tuningTargets = buildTuningTargets(tuning);
      resetSessionProgress();
      customName = '';
      customNotes = '';
      setStatus(`Saved ${label}. Start the mic to tune it.`);
      render();
    });

    updateLiveState();
  }

  async function startListening() {
    const selected = getSelectedTuning();
    const support = getAudioSupportState();
    if (!selected) {
      setStatus('Choose a valid tuning first.', 'No tuning is selected.');
      return;
    }

    if (!support.hasMediaDevices || !support.AudioContextClass) {
      setStatus('This browser cannot open the tuner mic path.', 'Microphone capture is not supported here.');
      return;
    }

    stopAudio(true);
    tuningTargets = buildTuningTargets(selected);
    resetSessionProgress();

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      audioContext = new support.AudioContextClass();
      sourceNode = audioContext.createMediaStreamSource(mediaStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = DETECTOR_BUFFER_SIZE;
      sampleBuffer = new Float32Array(analyser.fftSize);
      pitchDetector = PitchDetector.forFloat32Array(analyser.fftSize);
      pitchDetector.clarityThreshold = 0.9;
      pitchDetector.minVolumeDecibels = -35;
      sourceNode.connect(analyser);
      isListening = true;
      sessionStartedAt = Date.now();
      context?.setSelectedTuning?.({
        tuningId: selected.id,
        label: selected.label,
      });
      context?.startSession?.({
        tuningId: selected.id,
        label: selected.label,
        startedAt: sessionStartedAt,
        notes: selected.notes,
      });
      context?.markDiscovered?.(true);
      setStatus(`Listening for ${selected.label}. Play one string clearly.`);
      analyzeFrame();
    } catch (error) {
      stopAudio(true);
      setStatus('Mic access was blocked or failed.', error?.message || 'Unable to access the microphone.');
    }
  }

  function analyzeFrame() {
    if (!isListening || !analyser || !sampleBuffer || !pitchDetector) {
      return;
    }

    analyser.getFloatTimeDomainData(sampleBuffer);
    const [rawFrequency, clarity] = pitchDetector.findPitch(sampleBuffer, audioContext.sampleRate);
    const hasUsablePitch = Number.isFinite(rawFrequency)
      && rawFrequency >= MIN_PITCH_FREQUENCY
      && rawFrequency <= MAX_PITCH_FREQUENCY
      && clarity >= MIN_PITCH_CLARITY;
    const frequency = hasUsablePitch ? rawFrequency : null;

    if (!Number.isFinite(frequency)) {
      const recentlyHeard = Date.now() - lastHeardAt <= HELD_GUIDANCE_MS;
      detectedFrequency = null;
      detectedNote = lastStableReading?.detectedNote || '—';
      targetInfo = null;
      if (!recentlyHeard) {
        lastStableReading = null;
      }
      setStatus(
        lastStableReading
          ? `String decayed. Last heard ${lastStableReading.target.note}; adjust ${getPitchGuidance(lastStableReading.cents).label.toLowerCase()} and pluck again.`
          : 'Listening… pluck one target string cleanly.',
      );
      updateLiveState();
      frameId = requestAnimationFrame(analyzeFrame);
      return;
    }

    recentFrequencies.push(frequency);
    if (recentFrequencies.length > DETECTION_SMOOTHING_WINDOW) {
      recentFrequencies.shift();
    }

    const smoothedFrequency = median(recentFrequencies) || frequency;
    detectedFrequency = smoothedFrequency;
    detectedNote = frequencyToNoteName(smoothedFrequency) || '—';
    const lockedTarget = getLockedTarget();
    targetInfo = lockedTarget
      ? {
          target: lockedTarget,
          cents: centsBetween(smoothedFrequency, lockedTarget.frequency),
        }
      : findClosestTuningTarget(tuningTargets, smoothedFrequency, {
          completed,
          incompleteOnly: true,
        }) || findClosestTuningTarget(tuningTargets, smoothedFrequency);

    if (!targetInfo) {
      setStatus('Pitch detected, but no target note matched cleanly yet.');
      updateLiveState();
      frameId = requestAnimationFrame(analyzeFrame);
      return;
    }

    const { target, cents } = targetInfo;
    lastHeardAt = Date.now();
    lastStableReading = {
      target,
      cents,
      frequency: smoothedFrequency,
      detectedNote,
      heardAt: lastHeardAt,
    };
    if (Math.abs(cents) <= TUNED_CENTS_THRESHOLD) {
      consecutiveHits[target.index] += 1;
      setStatus(`${target.note} is nearly centered. Hold it steady.`);

      if (!completed[target.index] && consecutiveHits[target.index] >= TUNED_FRAME_THRESHOLD) {
        completed[target.index] = true;
        if (lockedTargetIndex === target.index) {
          clearLockedTarget();
        }
        setStatus(`${target.note} locked. Move to the next string.`);
      }
    } else {
      consecutiveHits[target.index] = 0;
      setStatus(
        cents < 0
          ? `Bring ${target.note} up ${Math.abs(Math.round(cents))} cents.`
          : `Bring ${target.note} down ${Math.abs(Math.round(cents))} cents.`,
      );
    }

    updateLiveState();

    if (isTuningSessionComplete(completed)) {
      const selected = getSelectedTuning();
      context?.recordInstrumentTuning?.({
        tuningId: selected?.id,
        label: selected?.label,
        durationMs: Date.now() - sessionStartedAt,
      });
      stopAudio(false);
      resetSessionProgress();
      setStatus(`${selected?.label || 'Instrument'} tuned. Start the mic for another pass.`);
      return;
    }

    frameId = requestAnimationFrame(analyzeFrame);
  }

  return {
    mount(nextRoot, nextContext) {
      root = nextRoot;
      context = nextContext;
      const selected = syncSelectedTuning();
      if (selected) {
        context?.setSelectedTuning?.({
          tuningId: selected.id,
          label: selected.label,
        });
      }
      render();
    },
    unmount() {
      stopAudio(true);
      root = null;
      context = null;
    },
  };
}
