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
const DEFAULT_A4_FREQUENCY = 440;
const MIN_A4_FREQUENCY = 390;
const MAX_A4_FREQUENCY = 490;
const CENTERED_CENTS_THRESHOLD = 3;
const READY_CENTS_THRESHOLD = 5;
const HOLD_TO_MARK_MS = 3000;
const MAX_METER_CENTS = 50;
const HELD_GUIDANCE_MS = 2500;
const DETECTOR_BUFFER_SIZE = 4096;
const POLYGRAPH_HISTORY_MS = 4000;
const POLYGRAPH_SAMPLE_RATE = 20;
const POLYGRAPH_SAMPLE_INTERVAL_MS = Math.round(1000 / POLYGRAPH_SAMPLE_RATE);
const POLYGRAPH_HISTORY_SAMPLES = Math.round((POLYGRAPH_HISTORY_MS / 1000) * POLYGRAPH_SAMPLE_RATE);
const POLYGRAPH_WIDTH = 420;
const POLYGRAPH_HEIGHT = 180;
const POLYGRAPH_POINT_INSET = 6;
const POLYGRAPH_GRID_LEVELS = Object.freeze([50, 25, 10, 5, 0, -5, -10, -25, -50]);
const MIN_DISPLAY_CLARITY = 0.8;
const MIN_DISPLAY_RMS = 0.0025;
const MIN_PITCH_CLARITY = 0.92;
const MIN_STABLE_CLARITY = 0.94;
const MIN_SIGNAL_RMS = 0.006;
const MIN_STABLE_RMS = 0.01;
const MIN_PITCH_FREQUENCY = 30;
const MAX_PITCH_FREQUENCY = 1400;
const DETECTION_SMOOTHING_WINDOW = 5;
const STABILITY_WINDOW = 6;
const STABLE_CENTS_SPREAD = 1.2;

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

function normalizeA4Frequency(value) {
  const frequency = Number.parseFloat(value);
  if (!Number.isFinite(frequency)) {
    return DEFAULT_A4_FREQUENCY;
  }

  return Math.min(MAX_A4_FREQUENCY, Math.max(MIN_A4_FREQUENCY, Math.round(frequency * 10) / 10));
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

export function noteNameToFrequency(noteName, { a4Frequency = DEFAULT_A4_FREQUENCY } = {}) {
  const midi = noteNameToMidi(noteName);
  if (!Number.isFinite(midi)) {
    return null;
  }

  return normalizeA4Frequency(a4Frequency) * 2 ** ((midi - 69) / 12);
}

function frequencyToMidiValue(frequency, { a4Frequency = DEFAULT_A4_FREQUENCY } = {}) {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    return null;
  }

  return 69 + 12 * Math.log2(frequency / normalizeA4Frequency(a4Frequency));
}

function frequencyToMidi(frequency, options = {}) {
  const midi = frequencyToMidiValue(frequency, options);
  return Number.isFinite(midi) ? Math.round(midi) : null;
}

function midiToNoteName(midi) {
  if (!Number.isFinite(midi)) {
    return null;
  }

  const rounded = Math.round(midi);
  const note = NOTE_NAMES_SHARP[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${note}${octave}`;
}

export function frequencyToNoteName(frequency, options = {}) {
  return midiToNoteName(frequencyToMidi(frequency, options));
}

export function centsBetween(frequency, targetFrequency) {
  if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(targetFrequency) || targetFrequency <= 0) {
    return null;
  }

  return 1200 * Math.log2(frequency / targetFrequency);
}

export function frequencyToChromaticReading(frequency, { a4Frequency = DEFAULT_A4_FREQUENCY } = {}) {
  const midiValue = frequencyToMidiValue(frequency, { a4Frequency });
  if (!Number.isFinite(midiValue)) {
    return null;
  }

  const midi = Math.round(midiValue);
  const note = midiToNoteName(midi);
  const targetFrequency = noteNameToFrequency(note, { a4Frequency });

  return {
    note,
    midi,
    frequency,
    targetFrequency,
    cents: centsBetween(frequency, targetFrequency),
  };
}

function getChromaticRangeLabel(noteName) {
  const midi = noteNameToMidi(noteName);
  if (!Number.isFinite(midi)) {
    return '—';
  }

  const previous = midiToNoteName(midi - 1);
  const next = midiToNoteName(midi + 1);
  return `${previous} < ${noteName} < ${next}`;
}

export function computeRms(input) {
  if (!input?.length) {
    return 0;
  }

  let squareSum = 0;
  for (let index = 0; index < input.length; index += 1) {
    squareSum += input[index] ** 2;
  }

  return Math.sqrt(squareSum / input.length);
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

export function buildTuningTargets(tuning, { a4Frequency = DEFAULT_A4_FREQUENCY } = {}) {
  return (tuning?.notes || [])
    .map((note, index) => {
      const frequency = noteNameToFrequency(note, { a4Frequency });
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

function centsSpread(values) {
  const usable = values.filter(Number.isFinite);
  if (usable.length < Math.max(3, Math.floor(STABILITY_WINDOW / 2))) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(...usable) - Math.min(...usable);
}

export function classifyPitchFrame({
  frequency,
  cents,
  clarity = 0,
  rms = 0,
  centsHistory = [],
  isHeld = false,
} = {}) {
  if (isHeld) {
    return {
      state: 'held',
      label: 'Held reading',
      detail: 'The string is decaying; pluck again for a fresh precision reading.',
      stable: false,
      precise: false,
    };
  }

  if (!Number.isFinite(frequency)) {
    return {
      state: 'no-signal',
      label: 'No signal',
      detail: 'Play one string cleanly.',
      stable: false,
      precise: false,
    };
  }

  if (rms < MIN_SIGNAL_RMS || clarity < MIN_PITCH_CLARITY) {
    return {
      state: 'weak',
      label: 'Weak',
      detail: 'Use a stronger, cleaner pluck before trusting the cents.',
      stable: false,
      precise: false,
    };
  }

  const spread = centsSpread(centsHistory);
  const stable = rms >= MIN_STABLE_RMS && clarity >= MIN_STABLE_CLARITY && spread <= STABLE_CENTS_SPREAD;

  if (!stable) {
    return {
      state: 'unstable',
      label: 'Unstable',
      detail: 'Hold the note steady for fine tuning.',
      stable: false,
      precise: false,
    };
  }

  if (Math.abs(cents) <= CENTERED_CENTS_THRESHOLD) {
    return {
      state: 'centered',
      label: 'Centered',
      detail: 'Stable enough for fine tuning.',
      stable: true,
      precise: true,
    };
  }

  if (cents < 0) {
    return {
      state: 'flat',
      label: 'Flat',
      detail: 'Raise pitch.',
      stable: true,
      precise: true,
    };
  }

  return {
    state: 'sharp',
    label: 'Sharp',
    detail: 'Lower pitch.',
    stable: true,
    precise: true,
  };
}

export function getPitchGuidance(cents) {
  if (!Number.isFinite(cents)) {
    return {
      state: 'no-signal',
      label: 'No signal',
      detail: 'Play one string cleanly.',
      instruction: 'No stable pitch yet',
    };
  }

  const rounded = Math.abs(Math.round(cents));
  if (Math.abs(cents) <= CENTERED_CENTS_THRESHOLD) {
    return {
      state: 'centered',
      label: 'Centered',
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

export function createTuningFrame({
  rawFrequency,
  clarity = 0,
  rms = 0,
  recentFrequencies = [],
  centsHistory = [],
  manualTarget = null,
  a4Frequency = DEFAULT_A4_FREQUENCY,
} = {}) {
  const hasFrequencyCandidate = Number.isFinite(rawFrequency)
    && rawFrequency >= MIN_PITCH_FREQUENCY
    && rawFrequency <= MAX_PITCH_FREQUENCY;
  const hasDisplayPitch = hasFrequencyCandidate
    && clarity >= MIN_DISPLAY_CLARITY
    && rms >= MIN_DISPLAY_RMS;

  if (!hasDisplayPitch) {
    return {
      rawFrequency: Number.isFinite(rawFrequency) ? rawFrequency : null,
      frequency: null,
      clarity,
      rms,
      chromatic: null,
      manual: null,
      classification: classifyPitchFrame({
        frequency: hasFrequencyCandidate ? rawFrequency : null,
        clarity,
        rms,
      }),
    };
  }

  const smoothedFrequency = median([...recentFrequencies, rawFrequency].slice(-DETECTION_SMOOTHING_WINDOW)) || rawFrequency;
  const chromatic = frequencyToChromaticReading(smoothedFrequency, { a4Frequency });
  const manual = manualTarget
    ? {
        target: manualTarget,
        cents: centsBetween(smoothedFrequency, manualTarget.frequency),
      }
    : null;
  const cents = manual?.cents ?? chromatic?.cents;
  const classification = classifyPitchFrame({
    frequency: smoothedFrequency,
    cents,
    clarity,
    rms,
    centsHistory: [...centsHistory, cents].slice(-STABILITY_WINDOW),
  });

  return {
    rawFrequency,
    frequency: smoothedFrequency,
    clarity,
    rms,
    chromatic,
    manual,
    classification,
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

function clampDisplayCents(cents, range = MAX_METER_CENTS) {
  if (!Number.isFinite(cents)) {
    return null;
  }

  return Math.max(-range, Math.min(range, cents));
}

function toPolygraphY(cents, { height = POLYGRAPH_HEIGHT, range = MAX_METER_CENTS } = {}) {
  const clamped = clampDisplayCents(cents, range);
  if (!Number.isFinite(clamped)) {
    return null;
  }

  return ((range - clamped) / (range * 2)) * height;
}

function formatSvgNumber(value) {
  return Number.parseFloat(value.toFixed(2)).toString();
}

function getPolygraphGridMarkup() {
  return POLYGRAPH_GRID_LEVELS
    .map((level) => {
      const y = formatSvgNumber(toPolygraphY(level));
      const className = level === 0 ? ' is-center' : Math.abs(level) >= 25 ? ' is-major' : '';
      return `<line class="tuner-polygraph-grid-line${className}" x1="0" y1="${y}" x2="${POLYGRAPH_WIDTH}" y2="${y}"></line>`;
    })
    .join('');
}

function getPolygraphLabelMarkup() {
  return POLYGRAPH_GRID_LEVELS
    .map((level) => {
      const top = ((MAX_METER_CENTS - level) / (MAX_METER_CENTS * 2)) * 100;
      const value = `${level > 0 ? '+' : ''}${level}`;
      const className = level === 0 ? ' is-center' : '';
      return `<span class="tuner-polygraph-label${className}" style="top:${top.toFixed(2)}%">${value}</span>`;
    })
    .join('');
}

export function isPolygraphSampleAccurate(frame, centsHistory = []) {
  if (!frame?.chromatic || !Number.isFinite(frame?.frequency) || frame?.classification?.state === 'held') {
    return false;
  }

  if (frame.classification?.precise) {
    return true;
  }

  const spread = centsSpread([...centsHistory, frame.chromatic.cents].slice(-STABILITY_WINDOW));
  return Number.isFinite(spread) && spread <= STABLE_CENTS_SPREAD;
}

function createPolygraphSample(frame, centsHistory = [], time = Date.now()) {
  if (!isPolygraphSampleAccurate(frame, centsHistory)) {
    return null;
  }

  return {
    time,
    cents: clampDisplayCents(frame.chromatic.cents),
    note: frame.chromatic.note,
    state: frame.classification.precise ? 'precise' : 'weak',
  };
}

export function appendTunerHistory(history, sample, {
  maxSamples = POLYGRAPH_HISTORY_SAMPLES,
} = {}) {
  const next = Array.isArray(history) ? [...history] : [];
  if (!sample || !Number.isFinite(sample.time) || !Number.isFinite(sample.cents)) {
    return next.slice(-maxSamples);
  }

  next.push({
    time: sample.time,
    cents: clampDisplayCents(sample.cents),
    note: sample.note ?? null,
    state: sample.state || 'precise',
  });

  return next.slice(-maxSamples);
}

export function buildPolygraphPaths(history, {
  width = POLYGRAPH_WIDTH,
  height = POLYGRAPH_HEIGHT,
  range = MAX_METER_CENTS,
} = {}) {
  const usable = Array.isArray(history)
    ? history
      .filter((entry) => Number.isFinite(entry?.time))
      .sort((left, right) => left.time - right.time)
    : [];
  const segments = [];
  let current = null;
  let latestPoint = null;
  const denominator = Math.max(1, usable.length - 1);
  const minX = POLYGRAPH_POINT_INSET;
  const maxX = Math.max(minX, width - POLYGRAPH_POINT_INSET);

  usable.forEach((entry, index) => {
    if (!Number.isFinite(entry.cents)) {
      current = null;
      return;
    }

    const x = usable.length === 1
      ? maxX
      : minX + (index / denominator) * (maxX - minX);
    const y = toPolygraphY(entry.cents, { height, range });
    latestPoint = {
      x,
      y,
      state: entry.state,
    };

    const breaksTrace = !current || current.state !== entry.state || current.note !== entry.note;
    if (breaksTrace) {
      current = {
        state: entry.state,
        note: entry.note,
        points: 1,
        d: `M ${formatSvgNumber(x)} ${formatSvgNumber(y)}`,
      };
      segments.push(current);
      return;
    }

    current.points += 1;
    current.d += ` L ${formatSvgNumber(x)} ${formatSvgNumber(y)}`;
  });

  return {
    count: usable.length,
    segments: segments.map(({ state, d, points }) => ({ state, d, points })),
    latestPoint,
  };
}

function getPolygraphTraceMarkup(history) {
  const { segments, latestPoint } = buildPolygraphPaths(history);
  const paths = segments
    .map((segment) => `<path class="tuner-polygraph-path is-${segment.state}" d="${segment.d}"></path>`)
    .join('');
  const latest = latestPoint
    ? `<circle class="tuner-polygraph-point is-${latestPoint.state}" cx="${formatSvgNumber(latestPoint.x)}" cy="${formatSvgNumber(latestPoint.y)}" r="4.5"></circle>`
    : '';
  return `${paths}${latest}`;
}

function formatCents(cents, { precise = false, signed = true } = {}) {
  if (!Number.isFinite(cents)) {
    return '—';
  }

  const value = precise ? cents.toFixed(1) : `${Math.round(cents)}`;
  return `${signed && cents > 0 ? '+' : ''}${value}¢`;
}

function formatFrequency(frequency) {
  return Number.isFinite(frequency) ? `${frequency.toFixed(1)} Hz` : '—';
}

function formatPercent(value) {
  return `${Math.round(Math.max(0, Math.min(1, value || 0)) * 100)}%`;
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
  let a4Frequency = DEFAULT_A4_FREQUENCY;
  let tuningTargets = [];
  let completed = [];
  let recentFrequencies = [];
  let recentCents = [];
  let sessionStartedAt = 0;
  let isListening = false;
  let statusMessage = 'Choose a tuning and start the mic.';
  let errorMessage = '';
  let currentFrame = null;
  let lastHeardAt = 0;
  let lastStableFrame = null;
  let heldCenteredNote = null;
  let heldCenteredSince = 0;
  let polygraphHistory = [];
  let lastPolygraphSampleAt = 0;
  let listMarkupCache = '';
  let polygraphMarkupCache = '';
  let customName = '';
  let customNotes = '';

  function resetSessionProgress({ clearCompleted = true } = {}) {
    if (clearCompleted) {
      completed = tuningTargets.map(() => false);
    }
    recentFrequencies = [];
    recentCents = [];
    currentFrame = null;
    lastHeardAt = 0;
    lastStableFrame = null;
    heldCenteredNote = null;
    heldCenteredSince = 0;
    polygraphHistory = [];
    lastPolygraphSampleAt = 0;
    listMarkupCache = '';
    polygraphMarkupCache = '';
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

  function rebuildTargets(selected = getSelectedTuning()) {
    tuningTargets = buildTuningTargets(selected || PRESET_TUNINGS[0], { a4Frequency });
    if (!tuningTargets.length) {
      tuningTargets = buildTuningTargets(PRESET_TUNINGS[0], { a4Frequency });
      currentTuningId = PRESET_TUNINGS[0].id;
    }
  }

  function syncSelectedTuning() {
    const modeState = getModeState();
    const options = getOptions();
    const selected = resolveSelectedTuning(options, modeState.selectedTuningId || currentTuningId);
    if (!selected) {
      return null;
    }

    currentTuningId = selected.id;
    a4Frequency = normalizeA4Frequency(modeState.a4Frequency ?? a4Frequency);
    rebuildTargets(selected);
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

  function getDisplayFrame() {
    if (currentFrame?.frequency) {
      return { ...currentFrame, isHeld: false };
    }

    if (lastStableFrame && isListening && Date.now() - lastHeardAt <= HELD_GUIDANCE_MS) {
      return {
        ...lastStableFrame,
        classification: classifyPitchFrame({ isHeld: true }),
        isHeld: true,
      };
    }

    return {
      frequency: null,
      clarity: 0,
      rms: 0,
      chromatic: null,
      manual: null,
      classification: classifyPitchFrame(),
      isHeld: false,
    };
  }

  function updateLiveState() {
    if (!root) {
      return;
    }

    const frame = getDisplayFrame();
    const classification = frame.classification;
    const comparisonCents = frame.chromatic?.cents;
    const centeredHoldMs = heldCenteredSince && heldCenteredNote === frame.chromatic?.note
      ? Date.now() - heldCenteredSince
      : 0;
    const statusNode = root.querySelector('[data-tuner-status]');
    const errorNode = root.querySelector('[data-tuner-error]');
    const buttonNode = root.querySelector('[data-tuner-toggle]');
    const detectedNode = root.querySelector('[data-tuner-detected]');
    const centsNode = root.querySelector('[data-tuner-cents]');
    const fineNode = root.querySelector('[data-tuner-fine]');
    const frequencyNode = root.querySelector('[data-tuner-frequency]');
    const targetNode = root.querySelector('[data-tuner-target]');
    const targetCentsNode = root.querySelector('[data-tuner-target-cents]');
    const rangeNode = root.querySelector('[data-tuner-range]');
    const stateNode = root.querySelector('[data-tuner-state]');
    const guidanceNode = root.querySelector('[data-tuner-guidance]');
    const clarityNode = root.querySelector('[data-tuner-clarity]');
    const rmsNode = root.querySelector('[data-tuner-rms]');
    const heardNode = root.querySelector('[data-tuner-heard]');
    const meterNode = root.querySelector('[data-tuner-meter]');
    const polygraphNode = root.querySelector('[data-tuner-polygraph-paths]');
    const listNode = root.querySelector('[data-tuner-strings]');
    const a4Node = root.querySelector('[data-tuner-a4]');
    const holdNode = root.querySelector('[data-tuner-hold]');

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
      detectedNode.textContent = frame.chromatic?.note || '—';
    }
    if (centsNode) {
      centsNode.textContent = formatCents(frame.chromatic?.cents);
    }
    if (fineNode) {
      fineNode.textContent = classification.precise ? formatCents(comparisonCents, { precise: true }) : 'Unstable';
    }
    if (frequencyNode) {
      frequencyNode.textContent = frame.isHeld
        ? `${formatFrequency(frame.frequency)} held`
        : frame.frequency
          ? `${formatFrequency(frame.frequency)} live`
          : 'No stable pitch yet';
    }
    if (targetNode) {
      targetNode.textContent = frame.chromatic
        ? `${frame.chromatic.note} ${formatFrequency(frame.chromatic.targetFrequency)}`
        : 'Closest note will appear here';
    }
    if (targetCentsNode) {
      targetCentsNode.textContent = Number.isFinite(comparisonCents)
        ? `${formatCents(comparisonCents, { precise: classification.precise })} from ${frame.chromatic.note}`
        : 'Play a string to get a live offset';
    }
    if (rangeNode) {
      rangeNode.textContent = frame.chromatic ? getChromaticRangeLabel(frame.chromatic.note) : '—';
    }
    if (stateNode) {
      stateNode.textContent = classification.label;
    }
    if (guidanceNode) {
      guidanceNode.textContent = classification.detail;
    }
    if (clarityNode) {
      clarityNode.textContent = formatPercent(frame.clarity);
    }
    if (rmsNode) {
      rmsNode.textContent = frame.rms ? `${(frame.rms * 100).toFixed(1)}%` : '—';
    }
    if (heardNode) {
      heardNode.textContent = frame.isHeld
        ? 'Held reading'
        : isListening
          ? 'Chromatic live'
          : 'Idle';
    }
    if (meterNode) {
      meterNode.dataset.state = classification.state;
      meterNode.dataset.mode = 'chromatic';
    }
    if (polygraphNode) {
      const nextMarkup = getPolygraphTraceMarkup(polygraphHistory);
      if (nextMarkup !== polygraphMarkupCache) {
        polygraphNode.innerHTML = nextMarkup;
        polygraphMarkupCache = nextMarkup;
      }
    }
    if (a4Node) {
      a4Node.value = a4Frequency.toFixed(1);
    }
    if (holdNode) {
      holdNode.textContent = centeredHoldMs > 0
        ? `${(centeredHoldMs / 1000).toFixed(1)}s centered hold`
        : '0.0s centered hold';
    }
    if (listNode) {
      const nextMarkup = tuningTargets
        .map((target) => {
          const isComplete = completed[target.index];
          const rowReady = heldCenteredNote === target.note && centeredHoldMs >= HOLD_TO_MARK_MS;
          return `
            <li class="tuner-string-item${isComplete ? ' is-complete' : ''}${rowReady ? ' is-ready' : ''}" data-target-index="${target.index}">
              <div class="tuner-string-target">
                <span class="tuner-string-note">${escapeHtml(target.note)}</span>
                <span class="tuner-string-frequency">${escapeHtml(formatFrequency(target.frequency))}</span>
              </div>
              <button type="button" class="tuner-string-done" data-target-action="done" aria-pressed="${isComplete ? 'true' : 'false'}">
                ${isComplete ? 'Done' : rowReady ? 'Ready' : 'Mark'}
              </button>
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
      description: 'Chromatic precision first. Preset strings are references you mark manually when they sound right.',
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
          { label: 'Reference', value: `A4 ${a4Frequency.toFixed(1)} Hz`, valueColSpan: 3 },
        ],
      ],
    });

    root.innerHTML = `
      <section class="puzzle-card tuner-card">
        ${header}
        <div class="tuner-workbench">
          <section class="tuner-console-card" data-tuner-meter data-state="no-signal" data-mode="chromatic" data-ready="false">
            <div class="tuner-console-top">
              <div class="tuner-note-block">
                <p class="puzzle-kicker">Detected</p>
                <div class="tuner-note-readout" data-tuner-detected>—</div>
                <p class="tuner-meter-frequency" data-tuner-frequency>No stable pitch yet</p>
              </div>
              <div class="tuner-cents-block">
                <span data-tuner-state>No signal</span>
                <strong data-tuner-cents>—</strong>
                <em data-tuner-fine>Unstable</em>
              </div>
            </div>
            <div class="tuner-polygraph-shell" aria-label="Chromatic cents history graph">
              <div class="tuner-polygraph-labels" aria-hidden="true">
                ${getPolygraphLabelMarkup()}
              </div>
              <svg class="tuner-polygraph-viewport" viewBox="0 0 ${POLYGRAPH_WIDTH} ${POLYGRAPH_HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
                <g class="tuner-polygraph-grid">
                  ${getPolygraphGridMarkup()}
                  <line class="tuner-polygraph-nowline" x1="${POLYGRAPH_WIDTH - 1}" y1="0" x2="${POLYGRAPH_WIDTH - 1}" y2="${POLYGRAPH_HEIGHT}"></line>
                </g>
                <g data-tuner-polygraph-paths></g>
              </svg>
            </div>
            <div class="tuner-guidance-panel">
              <div class="tuner-guidance-primary">
                <strong data-tuner-target>Closest note will appear here</strong>
                <span data-tuner-target-cents>Play a string to get a live offset</span>
              </div>
              <p class="tuner-guidance-note" data-tuner-guidance>Play one string cleanly.</p>
              <p class="tuner-guidance-range">Range <span data-tuner-range>—</span></p>
            </div>
            <div class="tuner-signal-grid">
              <div><span>Clarity</span><strong data-tuner-clarity>0%</strong></div>
              <div><span>Signal</span><strong data-tuner-rms>—</strong></div>
              <div><span>Live</span><strong data-tuner-heard>Idle</strong></div>
              <div><span>Hold</span><strong data-tuner-hold>0.0s centered hold</strong></div>
            </div>
          </section>

          <section class="tuner-side-card">
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
            <ul class="tuner-string-list" data-tuner-strings></ul>
            <details class="tuner-advanced-panel">
              <summary class="tuner-advanced-toggle">
                <span class="tuner-advanced-copy">
                  <strong>Advanced options</strong>
                  <em>Calibration and custom tuning</em>
                </span>
                <span class="tuner-advanced-chevron" aria-hidden="true">v</span>
              </summary>
              <div class="tuner-advanced-body">
                <form class="tuner-calibration-form" data-calibration-form>
                  <label class="tuner-field">
                    <span>A4 reference</span>
                    <input
                      class="tuner-input"
                      type="number"
                      name="a4"
                      data-tuner-a4
                      min="${MIN_A4_FREQUENCY}"
                      max="${MAX_A4_FREQUENCY}"
                      step="0.1"
                      value="${a4Frequency.toFixed(1)}"
                    />
                  </label>
                  <div class="tuner-button-row">
                    <button type="submit" class="puzzle-button puzzle-button-secondary">Apply A4</button>
                    <button type="button" class="puzzle-button puzzle-button-secondary" data-reset-a4>Reset 440</button>
                  </div>
                </form>
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
        </div>
      </section>
    `;

    root.querySelector('[data-tuner-select]')?.addEventListener('change', (event) => {
      const nextId = event.currentTarget.value;
      const nextSelected = resolveSelectedTuning(getOptions(), nextId);
      stopAudio(true);
      currentTuningId = nextSelected?.id || PRESET_TUNINGS[0].id;
      rebuildTargets(nextSelected || PRESET_TUNINGS[0]);
      resetSessionProgress();
      context?.setSelectedTuning?.({
        tuningId: currentTuningId,
        label: nextSelected?.label || PRESET_TUNINGS[0].label,
      });
      setStatus(`Selected ${nextSelected?.label || PRESET_TUNINGS[0].label}. Start the mic when ready.`);
      render();
    });

    root.querySelector('[data-tuner-strings]')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-target-action]');
      const item = event.target.closest('[data-target-index]');
      if (!button || !item) {
        return;
      }

      const index = Number.parseInt(item.dataset.targetIndex, 10);
      if (!Number.isInteger(index)) {
        return;
      }

      completed[index] = !completed[index];
      listMarkupCache = '';
      updateLiveState();

      if (isTuningSessionComplete(completed)) {
        const selectedTuning = getSelectedTuning();
        context?.recordInstrumentTuning?.({
          tuningId: selectedTuning?.id,
          label: selectedTuning?.label,
          durationMs: sessionStartedAt ? Date.now() - sessionStartedAt : 0,
        });
        setStatus(`${selectedTuning?.label || 'Instrument'} marked tuned. The meter stays fully chromatic.`);
      } else {
        setStatus(completed[index] ? `${tuningTargets[index]?.note || 'String'} marked done.` : `${tuningTargets[index]?.note || 'String'} returned to pending.`);
      }
    });

    root.querySelector('[data-tuner-toggle]')?.addEventListener('click', () => {
      if (isListening) {
        stopAudio(true);
        setStatus('Mic stopped. Start again for another pass.');
        return;
      }

      startListening();
    });

    root.querySelector('[data-calibration-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      a4Frequency = normalizeA4Frequency(formData.get('a4'));
      rebuildTargets();
      resetSessionProgress({ clearCompleted: false });
      context?.setTunerCalibration?.({ a4Frequency });
      setStatus(`A4 reference set to ${a4Frequency.toFixed(1)} Hz.`);
      updateLiveState();
    });

    root.querySelector('[data-reset-a4]')?.addEventListener('click', () => {
      a4Frequency = DEFAULT_A4_FREQUENCY;
      rebuildTargets();
      resetSessionProgress({ clearCompleted: false });
      context?.setTunerCalibration?.({ a4Frequency });
      setStatus('A4 reference reset to 440.0 Hz.');
      updateLiveState();
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
      rebuildTargets(tuning);
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
    rebuildTargets(selected);
    resetSessionProgress();

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 44100 },
          latency: { ideal: 0.01 },
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
      pitchDetector.minVolumeDecibels = -42;
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
        a4Frequency,
      });
      context?.markDiscovered?.(true);
      setStatus(`Listening for ${selected.label}. The meter will follow the closest note only.`);
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
    const rms = computeRms(sampleBuffer);
    const [rawFrequency, clarity] = pitchDetector.findPitch(sampleBuffer, audioContext.sampleRate);
    const frame = createTuningFrame({
      rawFrequency,
      clarity,
      rms,
      recentFrequencies,
      centsHistory: recentCents,
      a4Frequency,
    });

    currentFrame = frame;

    if (!Number.isFinite(frame.frequency)) {
      const recentlyHeard = Date.now() - lastHeardAt <= HELD_GUIDANCE_MS;
      if (!recentlyHeard) {
        lastStableFrame = null;
      }
      setStatus(lastStableFrame ? 'Held reading. Pluck again for a fresh value.' : 'Listening... play one string cleanly.');
      updateLiveState();
      frameId = requestAnimationFrame(analyzeFrame);
      return;
    }

    recentFrequencies.push(rawFrequency);
    if (recentFrequencies.length > DETECTION_SMOOTHING_WINDOW) {
      recentFrequencies.shift();
    }

    const comparisonCents = frame.chromatic?.cents;
    recentCents.push(comparisonCents);
    if (recentCents.length > STABILITY_WINDOW) {
      recentCents.shift();
    }

    const now = Date.now();
    if (!lastPolygraphSampleAt || now - lastPolygraphSampleAt >= POLYGRAPH_SAMPLE_INTERVAL_MS) {
      const nextSample = createPolygraphSample(frame, recentCents, now);
      if (nextSample) {
        polygraphHistory = appendTunerHistory(polygraphHistory, nextSample);
        polygraphMarkupCache = '';
      }
      lastPolygraphSampleAt = now;
    }

    if (frame.classification.stable) {
      lastHeardAt = Date.now();
      lastStableFrame = frame;
    }

    const note = frame.chromatic?.note || 'pitch';
    const isCentered = frame.classification.stable && Math.abs(comparisonCents) <= READY_CENTS_THRESHOLD;
    if (isCentered && note) {
      if (heldCenteredNote === note) {
        if (!heldCenteredSince) {
          heldCenteredSince = Date.now();
        }
      } else {
        heldCenteredNote = note;
        heldCenteredSince = Date.now();
      }
    } else {
      heldCenteredNote = null;
      heldCenteredSince = 0;
    }

    if (frame.classification.state === 'weak') {
      setStatus('Weak signal. Pluck closer to the mic or reduce background noise.');
    } else if (frame.classification.state === 'unstable') {
      setStatus(`Closest note is ${note}. Hold it steady to get a precise offset.`);
    } else if (frame.classification.state === 'centered') {
      const centeredHoldMs = heldCenteredNote === note && heldCenteredSince ? Date.now() - heldCenteredSince : 0;
      if (centeredHoldMs >= HOLD_TO_MARK_MS) {
        setStatus(`${note} has stayed centered for ${(centeredHoldMs / 1000).toFixed(1)}s. Mark the string if that's what you tuned.`);
      } else {
        setStatus(`${note} is centered. Hold it a bit longer or mark it whenever it sounds right.`);
      }
    } else if (frame.classification.state === 'flat') {
      setStatus(`Closest note is ${note}. Live offset: ${formatCents(comparisonCents, { precise: true })}.`);
    } else if (frame.classification.state === 'sharp') {
      setStatus(`Closest note is ${note}. Live offset: ${formatCents(comparisonCents, { precise: true })}.`);
    }

    updateLiveState();
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
