import { createSeededRandom } from './random.mjs';
import { renderPuzzlePanelHeader } from './panel.mjs';

const DIGITS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);
const VALUE_POOL = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const LEVEL_PACE = Object.freeze({
  easy: 'Warm-up board',
  medium: 'Steady board',
  hard: 'Sharp board',
});

let boardCounter = 0;

export function evaluateSequence(values, operators) {
  return operators.reduce((total, operator, index) => {
    const nextValue = values[index + 1];

    switch (operator) {
      case '+':
        return total + nextValue;
      case '-':
        return total - nextValue;
      case '*':
        return total * nextValue;
      case '/':
        return total / nextValue;
      default:
        return total;
    }
  }, values[0]);
}

function getEquationBank(seed) {
  if (Array.isArray(seed?.bankValues) && seed.bankValues.length === 9) {
    return seed.bankValues.slice();
  }

  return Array.from(new Set(Array.isArray(seed?.solution) ? seed.solution : []));
}

export function createEquationGridSeed(id, solution, rowOps, colOps, bankValues = null) {
  const rowTargets = [0, 1, 2].map((row) =>
    evaluateSequence(solution.slice(row * 3, row * 3 + 3), rowOps[row]),
  );
  const colTargets = [0, 1, 2].map((col) =>
    evaluateSequence([solution[col], solution[col + 3], solution[col + 6]], colOps[col]),
  );

  return {
    id,
    solution,
    bankValues: Array.isArray(bankValues) && bankValues.length === 9 ? bankValues.slice() : solution.slice(),
    rowOps,
    colOps,
    rowTargets,
    colTargets,
  };
}

export const EQUATION_GRID_SEEDS = Object.freeze([
  createEquationGridSeed(
    'equation-alpha',
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    [['+', '+'], ['*', '-'], ['+', '*']],
    [['+', '+'], ['*', '-'], ['+', '+']],
  ),
  createEquationGridSeed(
    'equation-beta',
    [2, 9, 1, 4, 7, 5, 6, 3, 8],
    [['*', '-'], ['+', '+'], ['-', '+']],
    [['*', '-'], ['-', '+'], ['+', '+']],
  ),
  createEquationGridSeed(
    'equation-gamma',
    [8, 1, 6, 3, 5, 7, 4, 9, 2],
    [['-', '*'], ['+', '+'], ['*', '-']],
    [['-', '+'], ['*', '+'], ['+', '-']],
  ),
  createEquationGridSeed(
    'equation-delta',
    [9, 4, 2, 1, 8, 6, 7, 3, 5],
    [['-', '+'], ['+', '-'], ['*', '+']],
    [['*', '-'], ['+', '+'], ['-', '+']],
  ),
]);

const LEVEL_PROFILES = Object.freeze({
  easy: {
    operators: ['+', '-'],
  },
  medium: {
    operators: ['+', '-', '*'],
  },
  hard: {
    operators: ['+', '-', '*', '/'],
  },
});

function isValidDigit(seed, value) {
  return getEquationBank(seed).includes(value);
}

export function validateEquationGridBoard(seed, cells) {
  const values = Array.isArray(cells) ? cells : [];
  const errors = [];
  const filledValues = values.filter((value) => value != null);

  if (filledValues.some((value) => !isValidDigit(seed, value))) {
    errors.push('Use only the generated bank values.');
  }

  if (new Set(filledValues).size !== filledValues.length) {
    errors.push('Each bank value can only be used once.');
  }

  const complete = values.length === 9 && values.every((value) => value != null);

  if (!complete) {
    errors.push('Fill every cell before checking.');
  }

  if (errors.length > 0) {
    return {
      complete,
      valid: false,
      errors,
    };
  }

  for (let row = 0; row < 3; row += 1) {
    const rowValues = values.slice(row * 3, row * 3 + 3);
    const rowResult = evaluateSequence(rowValues, seed.rowOps[row]);
    if (rowResult !== seed.rowTargets[row]) {
      errors.push(`Row ${row + 1} misses its target.`);
    }
  }

  for (let col = 0; col < 3; col += 1) {
    const colValues = [values[col], values[col + 3], values[col + 6]];
    const colResult = evaluateSequence(colValues, seed.colOps[col]);
    if (colResult !== seed.colTargets[col]) {
      errors.push(`Column ${col + 1} misses its target.`);
    }
  }

  return {
    complete,
    valid: errors.length === 0,
    errors,
  };
}

function createBoardId(level) {
  boardCounter += 1;
  return `equation-grid:${level}:${Date.now().toString(36)}:${boardCounter.toString(36)}`;
}

function getOperatorCounts(seed) {
  const counts = {
    plus: 0,
    multiply: 0,
    divide: 0,
    nonAdditive: 0,
  };
  const operators = [...seed.rowOps.flat(), ...seed.colOps.flat()];

  for (const operator of operators) {
    if (operator === '+') {
      counts.plus += 1;
    }
    if (operator === '*') {
      counts.multiply += 1;
      counts.nonAdditive += 1;
    }
    if (operator === '/') {
      counts.divide += 1;
      counts.nonAdditive += 1;
    }
  }

  return counts;
}

function profileAcceptsSeed(level, seed) {
  const counts = getOperatorCounts(seed);
  const allTargets = [...seed.rowTargets, ...seed.colTargets];

  if (level === 'easy') {
    return counts.plus >= 5
      && allTargets.every((target) => Number.isInteger(target) && target >= 0 && Math.abs(target) <= 40);
  }

  if (level === 'medium') {
    return counts.multiply >= 2
      && allTargets.every((target) => Number.isFinite(target) && Math.abs(target) <= 160);
  }

  return counts.nonAdditive >= 2
    && counts.divide >= 1
    && allTargets.every((target) => Number.isFinite(target) && Number.isInteger(target) && Math.abs(target) <= 220);
}

function isPartialPlacementValid(seed, cells, index) {
  const row = Math.floor(index / 3);
  const col = index % 3;

  if (col === 2) {
    const rowValues = cells.slice(row * 3, row * 3 + 3);
    if (evaluateSequence(rowValues, seed.rowOps[row]) !== seed.rowTargets[row]) {
      return false;
    }
  }

  if (row === 2) {
    const colValues = [cells[col], cells[col + 3], cells[col + 6]];
    if (evaluateSequence(colValues, seed.colOps[col]) !== seed.colTargets[col]) {
      return false;
    }
  }

  return true;
}

export function countEquationGridSolutions(seed, limit = 2) {
  const cells = Array(9).fill(null);
  const used = new Set();
  const bankValues = getEquationBank(seed);
  let count = 0;

  function visit(index) {
    if (count >= limit) {
      return;
    }

    if (index === 9) {
      count += 1;
      return;
    }

    for (const digit of bankValues) {
      if (used.has(digit)) {
        continue;
      }

      cells[index] = digit;
      used.add(digit);

      if (isPartialPlacementValid(seed, cells, index)) {
        visit(index + 1);
      }

      used.delete(digit);
      cells[index] = null;
    }
  }

  visit(0);
  return count;
}

function createRandomOperators(random, level) {
  const profile = LEVEL_PROFILES[level] || LEVEL_PROFILES.easy;
  return [
    [random.pick(profile.operators), random.pick(profile.operators)],
    [random.pick(profile.operators), random.pick(profile.operators)],
    [random.pick(profile.operators), random.pick(profile.operators)],
  ];
}

function generateCandidate(level, boardId, attempt) {
  const random = createSeededRandom(`${boardId}:${attempt}`);
  const bankValues = random.shuffle(VALUE_POOL).slice(0, 9);
  const solution = random.shuffle(bankValues);
  const seed = createEquationGridSeed(
    `${boardId}:${attempt}`,
    solution,
    createRandomOperators(random, level),
    createRandomOperators(random, level),
    random.shuffle(bankValues),
  );

  return seed;
}

function cloneBoardSpec(seed, level, boardId) {
  return {
    id: seed.id,
    boardId,
    level,
    solution: seed.solution.slice(),
    bankValues: getEquationBank(seed),
    rowOps: seed.rowOps.map((row) => row.slice()),
    colOps: seed.colOps.map((col) => col.slice()),
    rowTargets: seed.rowTargets.slice(),
    colTargets: seed.colTargets.slice(),
  };
}

function isEquationBoardSpec(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && typeof value.boardId === 'string'
      && Array.isArray(value.solution)
      && value.solution.length === 9
      && Array.isArray(value.rowOps)
      && value.rowOps.length === 3
      && Array.isArray(value.colOps)
      && value.colOps.length === 3
      && Array.isArray(value.rowTargets)
      && value.rowTargets.length === 3
      && Array.isArray(value.colTargets)
      && value.colTargets.length === 3,
  );
}

function hydrateBoardSpec(value) {
  if (isEquationBoardSpec(value)) {
    return cloneBoardSpec(value, value.level || 'easy', value.boardId);
  }

  if (typeof value?.seedId === 'string') {
    const legacy = EQUATION_GRID_SEEDS.find((seed) => seed.id === value.seedId) || EQUATION_GRID_SEEDS[0];
    return cloneBoardSpec(legacy, value.level || 'medium', value.seedId);
  }

  return null;
}

export function generateEquationGrid({ level = 'easy', boardId = createBoardId(level) } = {}) {
  for (let attempt = 0; attempt < 256; attempt += 1) {
    const seed = generateCandidate(level, boardId, attempt);

    if (!profileAcceptsSeed(level, seed)) {
      continue;
    }

    if (countEquationGridSolutions(seed, 2) === 1) {
      return cloneBoardSpec(seed, level, boardId);
    }
  }

  const fallback = EQUATION_GRID_SEEDS[level === 'easy' ? 0 : level === 'medium' ? 1 : 2];
  return cloneBoardSpec(fallback, level, boardId);
}

function createSnapshot(state) {
  return {
    level: state.level,
    boardId: state.seed.boardId,
    boardSpec: cloneBoardSpec(state.seed, state.level, state.seed.boardId),
    cells: state.cells.slice(),
    startedAt: state.startedAt,
  };
}

function renderLevelSelector(levels, selectedLevel, label) {
  return `
    <div class="puzzle-level-picker" role="group" aria-label="${label}">
      ${levels
        .map(
          (level) => `
            <button
              type="button"
              class="puzzle-level-button${level.key === selectedLevel ? ' is-active' : ''}"
              data-action="select-level"
              data-level="${level.key}"
            >
              ${level.label}
            </button>
          `,
        )
        .join('')}
    </div>
  `;
}

function renderEquationGrid(state) {
  const usedDigits = new Set(state.cells.filter((value) => value != null));
  const seed = state.seed;

  const cellMarkup = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const index = row * 3 + col;
      const value = state.cells[index];
      cellMarkup.push(`
        <button
          type="button"
          class="equation-grid-cell${state.selectedDigit != null && state.selectedDigit === value ? ' is-selected-digit' : ''}"
          data-action="cell"
          data-index="${index}"
          style="grid-row:${row * 2 + 1};grid-column:${col * 2 + 1};"
          aria-label="Equation Grid cell ${index + 1}"
        >
          ${value ?? ''}
        </button>
      `);

      if (col < 2) {
        cellMarkup.push(`
          <div class="equation-grid-operator" style="grid-row:${row * 2 + 1};grid-column:${col * 2 + 2};">
            ${seed.rowOps[row][col]}
          </div>
        `);
      }
    }

    cellMarkup.push(`
      <div class="equation-grid-target" style="grid-row:${row * 2 + 1};grid-column:6;">
        = ${seed.rowTargets[row]}
      </div>
    `);
  }

  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      cellMarkup.push(`
        <div class="equation-grid-operator equation-grid-operator-vertical" style="grid-row:${row * 2 + 2};grid-column:${col * 2 + 1};">
          ${seed.colOps[col][row]}
        </div>
      `);
    }
  }

  for (let col = 0; col < 3; col += 1) {
    cellMarkup.push(`
      <div class="equation-grid-target equation-grid-target-bottom" style="grid-row:6;grid-column:${col * 2 + 1};">
        ${seed.colTargets[col]}
      </div>
    `);
  }

  return `
    <section class="puzzle-card">
      ${renderPuzzlePanelHeader({
        title: 'Equation Grid',
        description: 'Place each bank value exactly once. Rows and columns evaluate left-to-right or top-to-bottom.',
        levelPicker: renderLevelSelector(state.levels, state.level, 'Equation Grid difficulty'),
        rows: [
          [
            { label: 'Level', value: state.levelLabel },
            { label: 'Elapsed', value: state.context.formatDuration(Date.now() - state.startedAt) },
          ],
          [
            { label: 'Board', value: LEVEL_PACE[state.level] || LEVEL_PACE.easy, valueColSpan: 3 },
          ],
        ],
      })}

      <div class="equation-grid-layout">
        ${cellMarkup.join('')}
      </div>

      <div class="equation-grid-bank">
        ${getEquationBank(seed).map(
          (digit) => `
            <button
              type="button"
              class="equation-grid-bank-button${state.selectedDigit === digit ? ' is-selected' : ''}${usedDigits.has(digit) ? ' is-used' : ''}"
              data-action="select-digit"
              data-digit="${digit}"
            >
              ${digit}
            </button>
          `,
        ).join('')}
        <button type="button" class="equation-grid-bank-button" data-action="clear-selection">Clear</button>
      </div>

      <div class="puzzle-actions">
        <button type="button" class="puzzle-button" data-action="check">Check</button>
        <button type="button" class="puzzle-button puzzle-button-secondary" data-action="reset">Reset</button>
        <button type="button" class="puzzle-button puzzle-button-secondary" data-action="new-puzzle">New Puzzle</button>
      </div>

      <p class="puzzle-status${state.isSolved ? ' is-success' : ''}">${state.message}</p>
    </section>
  `;
}

export function createEquationGridModule() {
  let root = null;
  let context = null;
  let state = null;
  let handleClick = null;

  function render() {
    root.innerHTML = renderEquationGrid({ ...state, context });
  }

  function syncProgress() {
    if (state.isSolved) {
      context.clearProgress();
      return;
    }

    context.saveProgress(createSnapshot(state));
  }

  function setBoard(seed, level, incrementPlay) {
    state.seed = seed;
    state.level = level;
    state.levelLabel = state.levels.find((entry) => entry.key === level)?.label || level;
    state.cells = Array(9).fill(null);
    state.selectedDigit = null;
    state.startedAt = Date.now();
    state.message = 'Select a bank value, then place it on the board.';
    state.isSolved = false;

    const snapshot = createSnapshot(state);
    if (incrementPlay) {
      context.startSession(snapshot);
    } else {
      context.saveProgress(snapshot);
    }

    render();
  }

  function restoreBoard() {
    const saved = context.getModeState().inProgress;
    const selectedLevel = context.getSelectedLevel();
    const boardSpec = hydrateBoardSpec(saved?.boardSpec || saved);

    if (
      saved
      && (!saved.level || saved.level === selectedLevel)
      && boardSpec
      && Array.isArray(saved.cells)
      && typeof saved.startedAt === 'number'
    ) {
      state.seed = boardSpec;
      state.level = saved.level || selectedLevel;
      state.levelLabel = state.levels.find((entry) => entry.key === state.level)?.label || state.level;
      state.cells = saved.cells.slice(0, 9).map((value) => (isValidDigit(boardSpec, value) ? value : null));
      state.selectedDigit = null;
      state.startedAt = saved.startedAt;
      state.message = 'Resumed from your local save.';
      state.isSolved = false;
      render();
      return;
    }

    setBoard(generateEquationGrid({ level: selectedLevel }), selectedLevel, true);
  }

  function placeDigit(index) {
    const selectedDigit = state.selectedDigit;
    context.markDiscovered();

    if (selectedDigit == null) {
      state.cells[index] = null;
      state.message = 'Cell cleared.';
      syncProgress();
      render();
      return;
    }

    const existingIndex = state.cells.findIndex((value, valueIndex) => value === selectedDigit && valueIndex !== index);
    if (existingIndex >= 0) {
      state.cells[existingIndex] = null;
    }

    state.cells[index] = selectedDigit;
    state.message = `Placed ${selectedDigit}.`;
    syncProgress();
    render();
  }

  function checkBoard() {
    const validation = validateEquationGridBoard(state.seed, state.cells);

    if (!validation.complete) {
      state.message = validation.errors[0];
      render();
      return;
    }

    if (!validation.valid) {
      state.message = validation.errors[0];
      render();
      return;
    }

    const durationMs = Date.now() - state.startedAt;
    context.recordTimedSolve({
      level: state.level,
      durationMs,
    });

    state.isSolved = true;
    state.message = `Solved in ${context.formatDuration(durationMs)} on ${state.levelLabel}.`;
    render();
  }

  function switchLevel(level) {
    if (level === state.level) {
      return;
    }

    context.setSelectedLevel(level);
    setBoard(generateEquationGrid({ level }), level, true);
  }

  return {
    id: 'equation-grid',
    mount(nextRoot, nextContext) {
      root = nextRoot;
      context = nextContext;
      state = {
        seed: null,
        level: context.getSelectedLevel(),
        levelLabel: '',
        levels: context.getLevels(),
        cells: Array(9).fill(null),
        selectedDigit: null,
        startedAt: Date.now(),
        message: '',
        isSolved: false,
      };

      handleClick = (event) => {
        const target = event.target.closest('[data-action]');
        if (!target) {
          return;
        }

        const action = target.dataset.action;
        if (action === 'select-level') {
          switchLevel(target.dataset.level);
          return;
        }

        if (action === 'select-digit') {
          const digit = Number.parseInt(target.dataset.digit, 10);
          state.selectedDigit = state.selectedDigit === digit ? null : digit;
          state.message = state.selectedDigit == null ? 'Digit selection cleared.' : `Selected ${digit}.`;
          render();
          return;
        }

        if (action === 'clear-selection') {
          state.selectedDigit = null;
          state.message = 'Digit selection cleared.';
          render();
          return;
        }

        if (action === 'cell') {
          placeDigit(Number.parseInt(target.dataset.index, 10));
          return;
        }

        if (action === 'check') {
          checkBoard();
          return;
        }

        if (action === 'reset') {
          setBoard(cloneBoardSpec(state.seed, state.level, state.seed.boardId), state.level, true);
          return;
        }

        if (action === 'new-puzzle') {
          setBoard(generateEquationGrid({ level: state.level }), state.level, true);
        }
      };

      root.addEventListener('click', handleClick);
      restoreBoard();
    },
    unmount() {
      if (root && handleClick) {
        root.removeEventListener('click', handleClick);
      }

      root = null;
      context = null;
      state = null;
      handleClick = null;
    },
    getSnapshot() {
      return state ? createSnapshot(state) : null;
    },
  };
}
