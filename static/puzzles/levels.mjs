export const LEVEL_KEYS = Object.freeze(['easy', 'medium', 'hard']);

const MODE_CONFIG_KEYS = Object.freeze({
  'equation-grid': 'equationGrid',
  'cage-logic': 'cageLogic',
  '2048': 'game2048',
  'instrument-tuner': 'instrumentTuner',
});

const DEFAULT_LABELS = Object.freeze({
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
});

const DEFAULT_2048_TARGETS = Object.freeze({
  easy: 512,
  medium: 1024,
  hard: 2048,
});

function getModeConfigKey(modeId) {
  return MODE_CONFIG_KEYS[modeId] || modeId;
}

function normalizeLevelKey(level) {
  return LEVEL_KEYS.includes(level) ? level : null;
}

function normalizeTargetTile(value, fallback) {
  return Number.isFinite(value) ? Math.max(2, Math.trunc(value)) : fallback;
}

export function createDefaultPuzzleMeta() {
  return {
    modes: {
      equationGrid: {
        defaultLevel: 'easy',
        levels: {
          easy: { label: 'Easy', enabled: true },
          medium: { label: 'Medium', enabled: true },
          hard: { label: 'Hard', enabled: true },
        },
      },
      cageLogic: {
        defaultLevel: 'easy',
        levels: {
          easy: { label: 'Easy', enabled: true },
          medium: { label: 'Medium', enabled: true },
          hard: { label: 'Hard', enabled: true },
        },
      },
      game2048: {
        defaultLevel: 'easy',
        levels: {
          easy: { label: 'Easy', enabled: true, targetTile: 512 },
          medium: { label: 'Medium', enabled: true, targetTile: 1024 },
          hard: { label: 'Hard', enabled: true, targetTile: 2048 },
        },
      },
    },
  };
}

export function normalizePuzzleMeta(rawPuzzleMeta = {}) {
  const defaults = createDefaultPuzzleMeta();
  const rawModes = rawPuzzleMeta && typeof rawPuzzleMeta === 'object' ? rawPuzzleMeta.modes || {} : {};
  const normalizedModes = {};

  for (const [configKey, defaultMode] of Object.entries(defaults.modes)) {
    const rawMode = rawModes[configKey] && typeof rawModes[configKey] === 'object' ? rawModes[configKey] : {};
    const rawLevels = rawMode.levels && typeof rawMode.levels === 'object' ? rawMode.levels : {};
    const levels = {};

    for (const level of LEVEL_KEYS) {
      const defaultLevel = defaultMode.levels[level];
      const rawLevel = rawLevels[level] && typeof rawLevels[level] === 'object' ? rawLevels[level] : {};
      const nextLevel = {
        key: level,
        label: typeof rawLevel.label === 'string' && rawLevel.label.trim() ? rawLevel.label.trim() : defaultLevel.label,
        enabled: rawLevel.enabled !== false,
      };

      if (configKey === 'game2048') {
        nextLevel.targetTile = normalizeTargetTile(rawLevel.targetTile, DEFAULT_2048_TARGETS[level]);
      }

      levels[level] = nextLevel;
    }

    const enabledLevels = LEVEL_KEYS.filter((level) => levels[level].enabled);
    if (!enabledLevels.length) {
      levels.easy.enabled = true;
      enabledLevels.push('easy');
    }

    const defaultLevel = normalizeLevelKey(rawMode.defaultLevel);
    normalizedModes[configKey] = {
      defaultLevel: enabledLevels.includes(defaultLevel) ? defaultLevel : enabledLevels[0],
      levels,
    };
  }

  return {
    modes: normalizedModes,
  };
}

export function getModeLevels(modeId, puzzleMeta = {}) {
  const configKey = getModeConfigKey(modeId);
  if (configKey === 'instrumentTuner') {
    return [];
  }
  const normalized = normalizePuzzleMeta(puzzleMeta);
  const modeMeta = normalized.modes[configKey] || normalizePuzzleMeta().modes[configKey];
  return LEVEL_KEYS.filter((level) => modeMeta.levels[level].enabled).map((level) => ({
    ...modeMeta.levels[level],
  }));
}

export function getDefaultLevel(modeId, puzzleMeta = {}) {
  const configKey = getModeConfigKey(modeId);
  if (configKey === 'instrumentTuner') {
    return null;
  }
  const normalized = normalizePuzzleMeta(puzzleMeta);
  const modeMeta = normalized.modes[configKey] || normalizePuzzleMeta().modes[configKey];
  return modeMeta.defaultLevel;
}

export function resolveSelectedLevel(modeId, puzzleMeta = {}, selectedLevel) {
  if (getModeConfigKey(modeId) === 'instrumentTuner') {
    return null;
  }
  const levels = getModeLevels(modeId, puzzleMeta);
  const requestedLevel = normalizeLevelKey(selectedLevel);
  return levels.some((level) => level.key === requestedLevel) ? requestedLevel : levels[0]?.key || 'easy';
}

export function getLevelLabel(modeId, puzzleMeta = {}, level) {
  const levels = getModeLevels(modeId, puzzleMeta);
  return levels.find((entry) => entry.key === level)?.label || DEFAULT_LABELS[level] || 'Easy';
}

export function get2048TargetTile(puzzleMeta = {}, level = 'easy') {
  const levels = getModeLevels('2048', puzzleMeta);
  const match = levels.find((entry) => entry.key === level);
  return normalizeTargetTile(match?.targetTile, DEFAULT_2048_TARGETS[level] || DEFAULT_2048_TARGETS.easy);
}
