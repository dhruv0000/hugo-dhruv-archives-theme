import { LEVEL_KEYS } from './levels.mjs';

export const STORAGE_KEY_V1 = 'dhruv-archives:puzzles:v1';
export const STORAGE_KEY = 'dhruv-archives:puzzles:v2';

const DEFAULT_TUNER_TUNING_ID = 'preset:guitar';
const DEFAULT_TUNER_LABEL = 'Guitar';
const TUNER_PRESET_LABELS = Object.freeze({
  'preset:guitar': 'Guitar',
  'preset:ukulele': 'Ukulele',
  'preset:bass': 'Bass',
  'preset:violin': 'Violin',
  'preset:mandolin': 'Mandolin',
});

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function createSolvesByLevel() {
  return {
    easy: 0,
    medium: 0,
    hard: 0,
  };
}

function createTimedModeState(defaultLevel = 'easy') {
  return {
    discover: false,
    selectedLevel: defaultLevel,
    solvesByLevel: createSolvesByLevel(),
    plays: 0,
    solves: 0,
    bestTimeMs: null,
    averageTimeMs: null,
    totalCompletedTimeMs: 0,
    bestScore: 0,
    bestTile: 0,
    completedSessions: 0,
    inProgress: null,
  };
}

function create2048ModeState(defaultLevel = 'easy') {
  return {
    ...createTimedModeState(defaultLevel),
  };
}

function createTunerModeState() {
  return {
    discover: false,
    selectedLevel: 'easy',
    solvesByLevel: createSolvesByLevel(),
    plays: 0,
    solves: 0,
    bestTimeMs: null,
    averageTimeMs: null,
    totalCompletedTimeMs: 0,
    completedTunings: 0,
    selectedTuningId: DEFAULT_TUNER_TUNING_ID,
    selectedInstrumentLabel: DEFAULT_TUNER_LABEL,
    inProgress: null,
  };
}

function createModeDefaults(defaultLevels = {}) {
  return {
    'equation-grid': defaultLevels['equation-grid'] || 'easy',
    'cage-logic': defaultLevels['cage-logic'] || 'easy',
    '2048': defaultLevels['2048'] || 'easy',
    'instrument-tuner': defaultLevels['instrument-tuner'] || 'easy',
  };
}

function createDefaultState(defaultLevels = {}) {
  const modeDefaults = createModeDefaults(defaultLevels);
  return {
    streak: {
      current: 0,
      best: 0,
      lastCompletedDate: '',
    },
    modes: {
      'equation-grid': createTimedModeState(modeDefaults['equation-grid']),
      'cage-logic': createTimedModeState(modeDefaults['cage-logic']),
      '2048': create2048ModeState(modeDefaults['2048']),
      'instrument-tuner': createTunerModeState(),
    },
    customTunings: [],
  };
}

function normalizeCount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function normalizeDuration(value) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

function normalizeLabel(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeSolvesByLevel(value) {
  const solvesByLevel = createSolvesByLevel();
  const source = value && typeof value === 'object' ? value : {};

  for (const level of LEVEL_KEYS) {
    solvesByLevel[level] = normalizeCount(source[level]);
  }

  return solvesByLevel;
}

function normalizeSelectedLevel(value, defaultLevel) {
  return LEVEL_KEYS.includes(value) ? value : defaultLevel;
}

function normalizeTuningNotes(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function normalizeCustomTuning(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const id = normalizeLabel(value.id);
  const label = normalizeLabel(value.label);
  const notes = normalizeTuningNotes(value.notes);

  if (!id || !label || !notes.length) {
    return null;
  }

  return { id, label, notes };
}

function normalizeCustomTunings(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const tunings = [];

  for (const entry of value) {
    const normalized = normalizeCustomTuning(entry);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }

    seen.add(normalized.id);
    tunings.push(normalized);
  }

  return tunings;
}

function resolveTuningLabel(tuningId, customTunings = []) {
  const custom = customTunings.find((entry) => entry.id === tuningId);
  if (custom) {
    return custom.label;
  }

  return TUNER_PRESET_LABELS[tuningId] || DEFAULT_TUNER_LABEL;
}

function normalizeModeState(value, defaultLevel, is2048 = false) {
  const source = value && typeof value === 'object' ? value : {};
  const solves = normalizeCount(source.solves);
  const completedSessions = normalizeCount(source.completedSessions);
  const totalCompletedTimeMs = normalizeCount(source.totalCompletedTimeMs);

  return {
    discover: Boolean(source.discover),
    selectedLevel: normalizeSelectedLevel(source.selectedLevel, defaultLevel),
    solvesByLevel: normalizeSolvesByLevel(source.solvesByLevel),
    plays: normalizeCount(source.plays),
    solves,
    bestTimeMs: normalizeDuration(source.bestTimeMs),
    averageTimeMs: normalizeDuration(source.averageTimeMs)
      ?? ((is2048 ? completedSessions : solves) > 0 && totalCompletedTimeMs > 0
        ? Math.round(totalCompletedTimeMs / (is2048 ? completedSessions : solves))
        : null),
    totalCompletedTimeMs,
    bestScore: normalizeCount(source.bestScore),
    bestTile: normalizeCount(source.bestTile),
    completedSessions,
    inProgress: source.inProgress && typeof source.inProgress === 'object' ? clone(source.inProgress) : null,
  };
}

function normalizeTunerModeState(value, customTunings = []) {
  const source = value && typeof value === 'object' ? value : {};
  const completedTunings = normalizeCount(source.completedTunings ?? source.solves);
  const totalCompletedTimeMs = normalizeCount(source.totalCompletedTimeMs);
  const selectedTuningId = normalizeLabel(source.selectedTuningId, DEFAULT_TUNER_TUNING_ID);

  return {
    discover: Boolean(source.discover || source.plays > 0 || completedTunings > 0),
    selectedLevel: 'easy',
    solvesByLevel: {
      easy: completedTunings,
      medium: completedTunings,
      hard: completedTunings,
    },
    plays: normalizeCount(source.plays ?? source.micSessions),
    solves: completedTunings,
    bestTimeMs: normalizeDuration(source.bestTimeMs),
    averageTimeMs: normalizeDuration(source.averageTimeMs)
      ?? (completedTunings > 0 && totalCompletedTimeMs > 0 ? Math.round(totalCompletedTimeMs / completedTunings) : null),
    totalCompletedTimeMs,
    completedTunings,
    selectedTuningId,
    selectedInstrumentLabel: normalizeLabel(
      source.selectedInstrumentLabel,
      resolveTuningLabel(selectedTuningId, customTunings),
    ),
    inProgress: source.inProgress && typeof source.inProgress === 'object' ? clone(source.inProgress) : null,
  };
}

export function normalizeState(rawState, defaultLevels = {}) {
  const base = createDefaultState(defaultLevels);
  const source = rawState && typeof rawState === 'object' ? rawState : {};
  const rawModes = source.modes && typeof source.modes === 'object' ? source.modes : {};
  const customTunings = normalizeCustomTunings(source.customTunings);

  return {
    streak: {
      current: normalizeCount(source.streak?.current),
      best: normalizeCount(source.streak?.best),
      lastCompletedDate:
        typeof source.streak?.lastCompletedDate === 'string' ? source.streak.lastCompletedDate : '',
    },
    modes: {
      'equation-grid': normalizeModeState(rawModes['equation-grid'], base.modes['equation-grid'].selectedLevel),
      'cage-logic': normalizeModeState(rawModes['cage-logic'], base.modes['cage-logic'].selectedLevel),
      '2048': normalizeModeState(rawModes['2048'], base.modes['2048'].selectedLevel, true),
      'instrument-tuner': normalizeTunerModeState(rawModes['instrument-tuner'], customTunings),
    },
    customTunings,
  };
}

export function createMemoryStorage(seed = {}) {
  const store = new Map(Object.entries(seed));

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayDiff(previousDateString, nextDateString) {
  if (!previousDateString || !nextDateString) {
    return Number.NaN;
  }

  const previousDate = new Date(`${previousDateString}T00:00:00`);
  const nextDate = new Date(`${nextDateString}T00:00:00`);
  return Math.round((nextDate - previousDate) / 86400000);
}

function updateStreakDraft(draft, now = new Date()) {
  const currentDate = getLocalDateString(now);
  const lastCompletedDate = draft.streak.lastCompletedDate;

  if (lastCompletedDate === currentDate) {
    return;
  }

  const delta = dayDiff(lastCompletedDate, currentDate);
  draft.streak.current = delta === 1 ? draft.streak.current + 1 : 1;
  draft.streak.best = Math.max(draft.streak.best, draft.streak.current);
  draft.streak.lastCompletedDate = currentDate;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '—';
  }

  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainderMinutes = minutes % 60;
    return `${hours}h ${remainderMinutes}m`;
  }

  return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
}

function getDefaultStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }

  return createMemoryStorage();
}

function updateAverage(mode, completedCount) {
  if (completedCount > 0 && mode.totalCompletedTimeMs > 0) {
    mode.averageTimeMs = Math.round(mode.totalCompletedTimeMs / completedCount);
  } else {
    mode.averageTimeMs = null;
  }
}

function migrateTimedMode(sourceMode = {}, defaultLevel = 'easy') {
  const plays = normalizeCount(sourceMode.plays);
  const solves = normalizeCount(sourceMode.solves);
  const totalCompletedTimeMs = normalizeCount(sourceMode.totalCompletedTimeMs);
  const mode = createTimedModeState(defaultLevel);

  mode.discover = Boolean(sourceMode.matrix?.discover || plays > 0 || solves > 0);
  mode.selectedLevel = defaultLevel;
  mode.solvesByLevel.medium = solves;
  mode.plays = plays;
  mode.solves = solves;
  mode.bestTimeMs = normalizeDuration(sourceMode.bestTimeMs);
  mode.averageTimeMs = normalizeDuration(sourceMode.averageTimeMs)
    ?? (solves > 0 && totalCompletedTimeMs > 0 ? Math.round(totalCompletedTimeMs / solves) : null);
  mode.totalCompletedTimeMs = totalCompletedTimeMs;
  mode.inProgress = sourceMode.inProgress && typeof sourceMode.inProgress === 'object' ? clone(sourceMode.inProgress) : null;

  return mode;
}

function migrate2048Mode(sourceMode = {}, defaultLevel = 'easy') {
  const plays = normalizeCount(sourceMode.plays);
  const completedSessions = normalizeCount(sourceMode.completedSessions);
  const totalCompletedTimeMs = normalizeCount(sourceMode.totalCompletedTimeMs);
  const bestTile = normalizeCount(sourceMode.bestTile);
  const mode = create2048ModeState(defaultLevel);

  mode.discover = Boolean(sourceMode.matrix?.discover || plays > 0 || completedSessions > 0);
  mode.selectedLevel = defaultLevel;
  mode.plays = plays;
  mode.completedSessions = completedSessions;
  mode.bestScore = normalizeCount(sourceMode.bestScore);
  mode.bestTile = bestTile;
  mode.bestTimeMs = normalizeDuration(sourceMode.bestTimeMs);
  mode.averageTimeMs = normalizeDuration(sourceMode.averageTimeMs)
    ?? (completedSessions > 0 && totalCompletedTimeMs > 0 ? Math.round(totalCompletedTimeMs / completedSessions) : null);
  mode.totalCompletedTimeMs = totalCompletedTimeMs;
  mode.inProgress = sourceMode.inProgress && typeof sourceMode.inProgress === 'object' ? clone(sourceMode.inProgress) : null;

  if (bestTile >= 512) {
    mode.solvesByLevel.easy += 1;
  }
  if (bestTile >= 1024) {
    mode.solvesByLevel.medium += 1;
  }
  if (bestTile >= 2048) {
    mode.solvesByLevel.hard += 1;
  }

  return mode;
}

function migrateFromV1(rawState, defaultLevels = {}) {
  const source = rawState && typeof rawState === 'object' ? rawState : {};
  const rawModes = source.modes && typeof source.modes === 'object' ? source.modes : {};
  return {
    streak: {
      current: normalizeCount(source.streak?.current),
      best: normalizeCount(source.streak?.best),
      lastCompletedDate:
        typeof source.streak?.lastCompletedDate === 'string' ? source.streak.lastCompletedDate : '',
    },
    modes: {
      'equation-grid': migrateTimedMode(rawModes['equation-grid'], defaultLevels['equation-grid'] || 'easy'),
      'cage-logic': migrateTimedMode(rawModes['cage-logic'], defaultLevels['cage-logic'] || 'easy'),
      '2048': migrate2048Mode(rawModes['2048'], defaultLevels['2048'] || 'easy'),
      'instrument-tuner': createTunerModeState(),
    },
    customTunings: [],
  };
}

export function createStore({
  storage = getDefaultStorage(),
  storageKey = STORAGE_KEY,
  legacyStorageKey = STORAGE_KEY_V1,
  defaultLevels = {},
} = {}) {
  const defaults = createModeDefaults(defaultLevels);
  let state = load();
  const listeners = new Set();

  function persist() {
    storage.setItem(storageKey, JSON.stringify(state));
  }

  function load() {
    try {
      const saved = storage.getItem(storageKey);
      if (saved) {
        return normalizeState(JSON.parse(saved), defaults);
      }

      const legacy = storage.getItem(legacyStorageKey);
      if (legacy) {
        const migrated = normalizeState(migrateFromV1(JSON.parse(legacy), defaults), defaults);
        storage.setItem(storageKey, JSON.stringify(migrated));
        return migrated;
      }
    } catch (error) {
      return createDefaultState(defaults);
    }

    return createDefaultState(defaults);
  }

  function emit() {
    for (const listener of listeners) {
      listener(getState());
    }
  }

  function update(mutator) {
    const draft = clone(state);
    mutator(draft);
    state = normalizeState(draft, defaults);
    persist();
    emit();
    return getState();
  }

  function getMode(modeId, draft = state) {
    if (!draft.modes[modeId]) {
      draft.modes[modeId] = modeId === '2048'
        ? create2048ModeState(defaults[modeId] || 'easy')
        : modeId === 'instrument-tuner'
          ? createTunerModeState()
          : createTimedModeState(defaults[modeId] || 'easy');
    }

    return draft.modes[modeId];
  }

  function getState() {
    return clone(state);
  }

  return {
    getState,
    getModeState(modeId) {
      return clone(getMode(modeId));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    startMode(modeId, snapshot) {
      return update((draft) => {
        const mode = getMode(modeId, draft);
        mode.plays += 1;
        mode.inProgress = snapshot ? clone(snapshot) : null;
      });
    },
    setInProgress(modeId, snapshot) {
      return update((draft) => {
        const mode = getMode(modeId, draft);
        mode.inProgress = snapshot ? clone(snapshot) : null;
      });
    },
    clearInProgress(modeId) {
      return update((draft) => {
        const mode = getMode(modeId, draft);
        mode.inProgress = null;
      });
    },
    markDiscovered(modeId, value = true) {
      return update((draft) => {
        const mode = getMode(modeId, draft);
        mode.discover = Boolean(value);
      });
    },
    setSelectedLevel(modeId, level) {
      return update((draft) => {
        const mode = getMode(modeId, draft);
        mode.selectedLevel = normalizeSelectedLevel(level, defaults[modeId] || 'easy');
      });
    },
    setSelectedTuning(modeId, { tuningId, label } = {}) {
      return update((draft) => {
        const mode = getMode(modeId, draft);
        const nextTuningId = normalizeLabel(tuningId, DEFAULT_TUNER_TUNING_ID);
        mode.selectedTuningId = nextTuningId;
        mode.selectedInstrumentLabel = normalizeLabel(label, resolveTuningLabel(nextTuningId, draft.customTunings));
      });
    },
    saveCustomTuning(tuning) {
      return update((draft) => {
        const normalized = normalizeCustomTuning(tuning);
        if (!normalized) {
          return;
        }

        const existingIndex = draft.customTunings.findIndex((entry) => entry.id === normalized.id);
        if (existingIndex >= 0) {
          draft.customTunings[existingIndex] = normalized;
        } else {
          draft.customTunings.push(normalized);
        }
      });
    },
    recordLevelSolve(modeId, level) {
      return update((draft) => {
        const mode = getMode(modeId, draft);
        const nextLevel = normalizeSelectedLevel(level, mode.selectedLevel || defaults[modeId] || 'easy');
        mode.discover = true;
        mode.solvesByLevel[nextLevel] += 1;
      });
    },
    recordTimedSolve(modeId, { level, durationMs } = {}) {
      return update((draft) => {
        const mode = getMode(modeId, draft);
        const completedMs = Number.isFinite(durationMs) ? Math.max(0, Math.trunc(durationMs)) : 0;
        const nextLevel = normalizeSelectedLevel(level, mode.selectedLevel || defaults[modeId] || 'easy');

        mode.discover = true;
        mode.solves += 1;
        mode.solvesByLevel[nextLevel] += 1;
        if (completedMs > 0) {
          mode.totalCompletedTimeMs += completedMs;
          mode.bestTimeMs = mode.bestTimeMs == null ? completedMs : Math.min(mode.bestTimeMs, completedMs);
        }
        updateAverage(mode, mode.solves);
        mode.inProgress = null;
        updateStreakDraft(draft);
      });
    },
    recordInstrumentTuning({ tuningId, label, durationMs = 0 } = {}) {
      return update((draft) => {
        const mode = getMode('instrument-tuner', draft);
        const completedMs = Number.isFinite(durationMs) ? Math.max(0, Math.trunc(durationMs)) : 0;
        const nextTuningId = normalizeLabel(tuningId, mode.selectedTuningId || DEFAULT_TUNER_TUNING_ID);

        mode.discover = true;
        mode.completedTunings += 1;
        mode.solves = mode.completedTunings;
        mode.solvesByLevel.easy = mode.completedTunings;
        mode.solvesByLevel.medium = mode.completedTunings;
        mode.solvesByLevel.hard = mode.completedTunings;
        mode.selectedTuningId = nextTuningId;
        mode.selectedInstrumentLabel = normalizeLabel(label, resolveTuningLabel(nextTuningId, draft.customTunings));
        if (completedMs > 0) {
          mode.totalCompletedTimeMs += completedMs;
          mode.bestTimeMs = mode.bestTimeMs == null ? completedMs : Math.min(mode.bestTimeMs, completedMs);
        }
        updateAverage(mode, mode.completedTunings);
        mode.inProgress = null;
        updateStreakDraft(draft);
      });
    },
    record2048Session({ score = 0, bestTile = 0, durationMs = 0, madeMoves = false } = {}) {
      return update((draft) => {
        const mode = getMode('2048', draft);
        const completedMs = Number.isFinite(durationMs) ? Math.max(0, Math.trunc(durationMs)) : 0;

        mode.bestScore = Math.max(mode.bestScore, Math.max(0, Math.trunc(score)));
        mode.bestTile = Math.max(mode.bestTile, Math.max(0, Math.trunc(bestTile)));
        mode.inProgress = null;

        if (madeMoves) {
          mode.completedSessions += 1;
          mode.discover = true;
          if (completedMs > 0) {
            mode.totalCompletedTimeMs += completedMs;
            mode.bestTimeMs = mode.bestTimeMs == null ? completedMs : Math.min(mode.bestTimeMs, completedMs);
          }
          updateAverage(mode, mode.completedSessions);
          updateStreakDraft(draft);
        }
      });
    },
  };
}
