import { createStore, formatDuration, STORAGE_KEY } from './store.mjs';
import { createEquationGridModule } from './equation-grid.mjs';
import { createCageLogicModule } from './cage-logic.mjs';
import { createGame2048Module } from './game-2048.mjs';
import { createInstrumentTunerModule } from './instrument-tuner.mjs';
import { LEVEL_KEYS, getDefaultLevel, getModeLevels, normalizePuzzleMeta } from './levels.mjs';

export const MODE_REGISTRY = Object.freeze({
  equationGrid: {
    configKey: 'equationGrid',
    id: 'equation-grid',
    label: 'Equation Grid',
    usesLevels: true,
    createModule: createEquationGridModule,
  },
  cageLogic: {
    configKey: 'cageLogic',
    id: 'cage-logic',
    label: 'Cage Logic',
    usesLevels: true,
    createModule: createCageLogicModule,
  },
  game2048: {
    configKey: 'game2048',
    id: '2048',
    label: '2048',
    usesLevels: true,
    createModule: createGame2048Module,
  },
  instrumentTuner: {
    configKey: 'instrumentTuner',
    id: 'instrument-tuner',
    label: 'Instrument Tuner',
    usesLevels: false,
    createModule: createInstrumentTunerModule,
  },
});

function getModeProgressTotal(mode, modeState = {}) {
  if (mode.id === 'instrument-tuner') {
    return modeState.completedTunings || modeState.solves || 0;
  }

  return LEVEL_KEYS.reduce((total, level) => total + (modeState.solvesByLevel?.[level] || 0), 0);
}

function getModeMatrixCounts(mode, modeState = {}) {
  if (!mode.usesLevels) {
    const total = getModeProgressTotal(mode, modeState);
    return LEVEL_KEYS.map(() => total);
  }

  return LEVEL_KEYS.map((level) => modeState.solvesByLevel?.[level] || 0);
}

function getModeStats(mode, modeState) {
  if (mode.id === '2048') {
    return {
      progressValue: getModeProgressTotal(mode, modeState),
      primaryLabel: 'Best score',
      primaryValue: modeState.bestScore || 0,
      secondaryLabel: 'Best tile',
      secondaryValue: modeState.bestTile || 0,
      tertiaryLabel: 'Sessions',
      tertiaryValue: modeState.completedSessions || 0,
      averageTimeMs: modeState.averageTimeMs,
      bestTimeMs: modeState.bestTimeMs,
    };
  }

  if (mode.id === 'instrument-tuner') {
    return {
      progressValue: getModeProgressTotal(mode, modeState),
      primaryLabel: 'Mic starts',
      primaryValue: modeState.plays || 0,
      secondaryLabel: 'Tunings',
      secondaryValue: modeState.completedTunings || 0,
      tertiaryLabel: 'Tuning',
      tertiaryValue: modeState.selectedInstrumentLabel || '—',
      averageTimeMs: modeState.averageTimeMs,
      bestTimeMs: modeState.bestTimeMs,
    };
  }

  return {
    progressValue: getModeProgressTotal(mode, modeState),
    primaryLabel: 'Plays',
    primaryValue: modeState.plays || 0,
    secondaryLabel: 'Solves',
    secondaryValue: modeState.solves || 0,
    tertiaryLabel: 'Tracked levels',
    tertiaryValue: LEVEL_KEYS.filter((level) => (modeState.solvesByLevel?.[level] || 0) > 0).length,
    averageTimeMs: modeState.averageTimeMs,
    bestTimeMs: modeState.bestTimeMs,
  };
}

export function getEnabledModes(config) {
  if (!config?.enabled) {
    return [];
  }

  const rawModes = config?.modes || {};
  const puzzleMeta = normalizePuzzleMeta(config?.puzzleMeta || {});

  return Object.entries(MODE_REGISTRY)
    .map(([configKey, registryEntry]) => {
      const modeConfig = rawModes[configKey] || rawModes[configKey.toLowerCase()];
      if (!modeConfig?.enabled) {
        return null;
      }

      return {
        ...registryEntry,
        order: Number.isFinite(modeConfig.order) ? modeConfig.order : 999,
        label: modeConfig.label || registryEntry.label,
        levels: registryEntry.usesLevels ? getModeLevels(registryEntry.id, puzzleMeta) : [],
        defaultLevel: registryEntry.usesLevels ? getDefaultLevel(registryEntry.id, puzzleMeta) : null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
}

export function resolveActiveModeId(hash, enabledModes) {
  if (!enabledModes.length) {
    return null;
  }

  const cleanedHash = decodeURIComponent(`${hash || ''}`.replace(/^#/, ''));
  const matchedMode = enabledModes.find((mode) => mode.id === cleanedHash);
  return matchedMode ? matchedMode.id : enabledModes[0].id;
}

function renderSummary(summaryRoot, enabledModes, state, summaryExpanded = true) {
  const statsMarkup = enabledModes
    .map((mode) => {
      const modeState = state.modes?.[mode.id] || {};
      const stats = getModeStats(mode, modeState);
      return `
        <article class="puzzles-stat-card">
          <div class="puzzles-stat-head">
            <h3>${mode.label}</h3>
            <span class="puzzles-stat-progress">${stats.progressValue}</span>
          </div>
          <dl>
            <div><dt>${stats.primaryLabel}</dt><dd>${stats.primaryValue}</dd></div>
            <div><dt>${stats.secondaryLabel}</dt><dd>${stats.secondaryValue}</dd></div>
            <div><dt>${stats.tertiaryLabel}</dt><dd>${stats.tertiaryValue}</dd></div>
            <div><dt>Avg time</dt><dd>${formatDuration(stats.averageTimeMs)}</dd></div>
            <div><dt>Best time</dt><dd>${formatDuration(stats.bestTimeMs)}</dd></div>
          </dl>
        </article>
      `;
    })
    .join('');

  const matrixHeader = [
    '<span>discover</span>',
    ...LEVEL_KEYS.map((level) => `<span>${level}</span>`),
  ].join('');

  const matrixRows = enabledModes
    .map((mode) => {
      const modeState = state.modes?.[mode.id] || {};
      return `
        <div class="puzzles-matrix-row">
          <strong>${mode.label}</strong>
          <span class="${modeState.discover ? 'is-complete' : ''}">${modeState.discover ? 'Yes' : '—'}</span>
          ${getModeMatrixCounts(mode, modeState).map((count) => `<span>${count}</span>`).join('')}
        </div>
      `;
    })
    .join('');

  summaryRoot.innerHTML = `
    <details class="puzzles-summary-card"${summaryExpanded ? ' open' : ''}>
      <summary class="puzzles-summary-toggle">
        <div>
          <h2 class="puzzles-section-title">Progress desk</h2>
        </div>
        <span class="puzzles-summary-chevron" aria-hidden="true">▾</span>
      </summary>
      <div class="puzzles-summary-content">
        <div class="puzzles-summary-heading">
          <p class="puzzles-summary-lead">This desk lives only in this browser cache. It tracks which tabs you have discovered and how many solves or full tuning sessions you logged here.</p>
        </div>
        <div class="puzzles-summary-body">
          <div class="puzzles-matrix-card">
            <div class="puzzles-matrix-row puzzles-matrix-header">
              <strong>Local progress</strong>
              ${matrixHeader}
            </div>
            ${matrixRows}
          </div>
          <div class="puzzles-stats-grid">
            ${statsMarkup}
          </div>
        </div>
      </div>
    </details>
  `;
}

function renderTabs(tabsRoot, enabledModes, activeModeId) {
  tabsRoot.innerHTML = enabledModes
    .map(
      (mode) => `
        <button
          type="button"
          class="puzzles-tab${mode.id === activeModeId ? ' is-active' : ''}"
          data-mode-id="${mode.id}"
          aria-pressed="${mode.id === activeModeId ? 'true' : 'false'}"
        >
          ${mode.label}
        </button>
      `,
    )
    .join('');
}

function parseConfig() {
  const configNode = document.getElementById('puzzles-config');
  if (!configNode?.textContent) {
    return null;
  }

  try {
    const parsed = JSON.parse(configNode.textContent);
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch (error) {
    return null;
  }
}

function setHash(modeId, replace = false) {
  const nextHash = `#${encodeURIComponent(modeId)}`;
  if (window.location.hash === nextHash) {
    return;
  }

  if (replace) {
    window.history.replaceState(null, '', nextHash);
    return;
  }

  window.location.hash = nextHash;
}

function createModeContext(mode, store, puzzleMeta) {
  return {
    mode,
    store,
    puzzleMeta,
    formatDuration,
    getState: () => store.getState(),
    getModeState: () => store.getModeState(mode.id),
    getLevels: () => mode.levels.map((level) => ({ ...level })),
    getSelectedLevel: () => store.getModeState(mode.id).selectedLevel || mode.defaultLevel,
    getCustomTunings: () => (store.getState().customTunings || []).map((entry) => ({ ...entry })),
    setSelectedLevel: (level) => store.setSelectedLevel(mode.id, level),
    setSelectedTuning: (details) => store.setSelectedTuning(mode.id, details),
    saveCustomTuning: (tuning) => store.saveCustomTuning(tuning),
    startSession: (snapshot) => store.startMode(mode.id, snapshot),
    saveProgress: (snapshot) => store.setInProgress(mode.id, snapshot),
    clearProgress: () => store.clearInProgress(mode.id),
    markDiscovered: (value = true) => store.markDiscovered(mode.id, value),
    recordLevelSolve: (level) => store.recordLevelSolve(mode.id, level),
    recordTimedSolve: (details) => store.recordTimedSolve(mode.id, details),
    recordInstrumentTuning: (details) => store.recordInstrumentTuning(details),
    record2048Session: (details) => store.record2048Session(details),
  };
}

function mountApp() {
  const root = document.getElementById('puzzles-app');
  const summaryRoot = document.getElementById('puzzles-summary');
  const tabsRoot = document.getElementById('puzzles-tabs');
  const stageRoot = document.getElementById('puzzles-stage');
  const config = parseConfig();

  if (!root || !summaryRoot || !tabsRoot || !stageRoot || !config) {
    return;
  }

  const puzzleMeta = normalizePuzzleMeta(config.puzzleMeta || {});
  const enabledModes = getEnabledModes({
    enabled: config.enabled,
    modes: config.modes || {},
    puzzleMeta,
  });

  if (!enabledModes.length) {
    stageRoot.innerHTML = '<section class="puzzles-placeholder"><h2>No modes enabled right now.</h2></section>';
    return;
  }

  const defaultLevels = Object.fromEntries(enabledModes.map((mode) => [mode.id, mode.defaultLevel || 'easy']));
  const store = createStore({
    storageKey: config.storageKey || STORAGE_KEY,
    defaultLevels,
  });

  let activeModeId = resolveActiveModeId(window.location.hash, enabledModes);
  let activeModule = null;
  let summaryExpanded = true;

  function bindSummaryToggle() {
    const summaryDetails = summaryRoot.querySelector('.puzzles-summary-card');
    if (!summaryDetails) {
      return;
    }

    summaryDetails.addEventListener('toggle', () => {
      summaryExpanded = summaryDetails.open;
    });
  }

  function mountActiveMode(nextModeId) {
    const mode = enabledModes.find((entry) => entry.id === nextModeId);
    if (!mode) {
      return;
    }

    if (activeModule?.unmount) {
      activeModule.unmount();
    }

    stageRoot.innerHTML = '';
    activeModeId = mode.id;
    renderTabs(tabsRoot, enabledModes, activeModeId);

    activeModule = mode.createModule();
    activeModule.mount(stageRoot, createModeContext(mode, store, puzzleMeta));
  }

  function syncFromHash(replace = false) {
    const resolvedModeId = resolveActiveModeId(window.location.hash, enabledModes);
    if (!resolvedModeId) {
      return;
    }

    if (window.location.hash !== `#${encodeURIComponent(resolvedModeId)}`) {
      setHash(resolvedModeId, replace);
    }

    if (activeModeId !== resolvedModeId) {
      mountActiveMode(resolvedModeId);
      return;
    }

    renderTabs(tabsRoot, enabledModes, activeModeId);
  }

  renderSummary(summaryRoot, enabledModes, store.getState(), summaryExpanded);
  bindSummaryToggle();
  renderTabs(tabsRoot, enabledModes, activeModeId);
  mountActiveMode(activeModeId);
  syncFromHash(true);

  const unsubscribe = store.subscribe((nextState) => {
    renderSummary(summaryRoot, enabledModes, nextState, summaryExpanded);
    bindSummaryToggle();
  });

  const handleTabClick = (event) => {
    const button = event.target.closest('[data-mode-id]');
    if (!button) {
      return;
    }

    setHash(button.dataset.modeId);
  };

  const handleHashChange = () => {
    syncFromHash(true);
  };

  tabsRoot.addEventListener('click', handleTabClick);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener(
    'pagehide',
    () => {
      tabsRoot.removeEventListener('click', handleTabClick);
      window.removeEventListener('hashchange', handleHashChange);
      unsubscribe();
      activeModule?.unmount?.();
    },
    { once: true },
  );
}

if (typeof document !== 'undefined') {
  mountApp();
}
