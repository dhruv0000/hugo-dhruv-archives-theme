import { createSeededRandom } from './random.mjs';
import { renderPuzzlePanelHeader } from './panel.mjs';

const GRID_SIZE = 4;
const VALUE_POOL = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const BASE_SOLUTION = Object.freeze([
  1, 2, 3, 4,
  2, 3, 4, 1,
  3, 4, 1, 2,
  4, 1, 2, 3,
]);
const LEVEL_COPY = Object.freeze({
  easy: 'Structured board',
  medium: 'Mixed board',
  hard: 'Dense board',
});

let boardCounter = 0;

function indexFor(row, col) {
  return row * GRID_SIZE + col;
}

function toCell(row, col) {
  return { row, col };
}

function cage(target, operator, cells) {
  return { target, operator, cells };
}

function getCellValue(solution, cell) {
  return solution[indexFor(cell.row, cell.col)];
}

function getNeighbors(cell) {
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  return offsets
    .map(([rowOffset, colOffset]) => ({ row: cell.row + rowOffset, col: cell.col + colOffset }))
    .filter((neighbor) => neighbor.row >= 0 && neighbor.row < GRID_SIZE && neighbor.col >= 0 && neighbor.col < GRID_SIZE);
}

function cloneCells(cells) {
  return cells.map((cell) => ({ row: cell.row, col: cell.col }));
}

function getKeypadValues(seed) {
  if (Array.isArray(seed?.keypadValues) && seed.keypadValues.length === 4) {
    return seed.keypadValues.slice();
  }

  return Array.from(new Set(Array.isArray(seed?.solution) ? seed.solution : [])).slice(0, 4);
}

export const CAGE_LOGIC_SEEDS = Object.freeze([
  {
    id: 'cage-starter',
    difficulty: 'medium',
    solution: [
      1, 2, 3, 4,
      3, 4, 1, 2,
      2, 1, 4, 3,
      4, 3, 2, 1,
    ],
    cages: [
      cage(3, '+', [toCell(0, 0), toCell(0, 1)]),
      cage(7, '+', [toCell(0, 2), toCell(0, 3)]),
      cage(1, '-', [toCell(1, 0), toCell(2, 0)]),
      cage(4, '/', [toCell(1, 1), toCell(1, 2)]),
      cage(5, '+', [toCell(1, 3), toCell(2, 3)]),
      cage(2, '-', [toCell(2, 1), toCell(3, 1)]),
      cage(8, '*', [toCell(2, 2), toCell(3, 2), toCell(3, 3)]),
      cage(4, '=', [toCell(3, 0)]),
    ],
  },
  {
    id: 'cage-twist',
    difficulty: 'medium',
    solution: [
      2, 1, 4, 3,
      4, 3, 2, 1,
      1, 2, 3, 4,
      3, 4, 1, 2,
    ],
    cages: [
      cage(6, '+', [toCell(0, 0), toCell(1, 0)]),
      cage(5, '+', [toCell(0, 1), toCell(0, 2)]),
      cage(2, '-', [toCell(0, 3), toCell(1, 3)]),
      cage(8, '+', [toCell(1, 1), toCell(1, 2), toCell(2, 2)]),
      cage(3, '+', [toCell(2, 0), toCell(2, 1)]),
      cage(2, '/', [toCell(2, 3), toCell(3, 3)]),
      cage(8, '+', [toCell(3, 0), toCell(3, 1), toCell(3, 2)]),
      cage(4, '=', [toCell(1, 0)]),
    ],
  },
  {
    id: 'cage-hardline',
    difficulty: 'hard',
    solution: [
      1, 3, 4, 2,
      4, 2, 1, 3,
      2, 4, 3, 1,
      3, 1, 2, 4,
    ],
    cages: [
      cage(12, '*', [toCell(0, 0), toCell(0, 1), toCell(1, 0)]),
      cage(9, '+', [toCell(0, 2), toCell(0, 3), toCell(1, 3)]),
      cage(6, '*', [toCell(1, 1), toCell(1, 2), toCell(2, 2)]),
      cage(7, '+', [toCell(2, 0), toCell(2, 1), toCell(3, 1)]),
      cage(8, '*', [toCell(2, 3), toCell(3, 2), toCell(3, 3)]),
      cage(3, '=', [toCell(3, 0)]),
    ],
  },
]);

const LEVEL_PROFILES = Object.freeze({
  easy: {
    minCages: 8,
    maxCages: 10,
    minSize: 1,
    maxSize: 2,
    preferredSizes: [1, 1, 1, 2, 2, 2],
    minSingles: 2,
    maxSingles: GRID_SIZE * GRID_SIZE,
  },
  medium: {
    minCages: 6,
    maxCages: 8,
    minSize: 1,
    maxSize: 3,
    preferredSizes: [1, 2, 2, 2, 3, 3],
    minSingles: 0,
    maxSingles: 1,
  },
  hard: {
    minCages: 5,
    maxCages: 7,
    minSize: 2,
    maxSize: 4,
    preferredSizes: [2, 2, 3, 3, 4],
    minSingles: 0,
    maxSingles: 0,
  },
});

function createBoardId(level) {
  boardCounter += 1;
  return `cage-logic:${level}:${Date.now().toString(36)}:${boardCounter.toString(36)}`;
}

function normalizeBoardSpec(seed, level, boardId) {
  return {
    id: seed.id,
    boardId,
    level,
    solution: seed.solution.slice(),
    keypadValues: getKeypadValues(seed),
    cages: seed.cages.map((currentCage) => ({
      target: currentCage.target,
      operator: currentCage.operator,
      cells: cloneCells(currentCage.cells),
    })),
  };
}

function isBoardSpec(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && typeof value.boardId === 'string'
      && Array.isArray(value.solution)
      && value.solution.length === GRID_SIZE * GRID_SIZE
      && Array.isArray(value.cages)
      && value.cages.length > 0,
  );
}

function hydrateBoardSpec(value) {
  if (isBoardSpec(value)) {
    return normalizeBoardSpec(value, value.level || 'easy', value.boardId);
  }

  if (typeof value?.seedId === 'string') {
    const legacy = CAGE_LOGIC_SEEDS.find((seed) => seed.id === value.seedId) || CAGE_LOGIC_SEEDS[0];
    return normalizeBoardSpec(legacy, value.level || legacy.difficulty || 'medium', value.seedId);
  }

  return null;
}

function getRowIndexes(row) {
  return Array.from({ length: GRID_SIZE }, (_, col) => indexFor(row, col));
}

function getColumnIndexes(col) {
  return Array.from({ length: GRID_SIZE }, (_, row) => indexFor(row, col));
}

function collectDuplicateIndexes(groups) {
  const duplicates = new Set();

  for (const group of groups) {
    const seen = new Map();
    for (const index of group) {
      const value = this[index];
      if (!value) {
        continue;
      }

      if (seen.has(value)) {
        duplicates.add(index);
        duplicates.add(seen.get(value));
      } else {
        seen.set(value, index);
      }
    }
  }

  return duplicates;
}

export function findRowConflicts(cells) {
  const groups = Array.from({ length: GRID_SIZE }, (_, row) => getRowIndexes(row));
  return collectDuplicateIndexes.call(cells, groups);
}

export function findColumnConflicts(cells) {
  const groups = Array.from({ length: GRID_SIZE }, (_, col) => getColumnIndexes(col));
  return collectDuplicateIndexes.call(cells, groups);
}

function computeTarget(values, operator) {
  switch (operator) {
    case '=':
      return values[0];
    case '+':
      return values.reduce((sum, value) => sum + value, 0);
    case '*':
      return values.reduce((product, value) => product * value, 1);
    case '-': {
      const sorted = [...values].sort((left, right) => right - left);
      return sorted[0] - sorted[1];
    }
    case '/': {
      const sorted = [...values].sort((left, right) => right - left);
      return sorted[0] / sorted[1];
    }
    default:
      return 0;
  }
}

export function validateCage(seed, cells, currentCage) {
  const values = currentCage.cells.map(({ row, col }) => cells[indexFor(row, col)]);
  if (values.some((value) => !value)) {
    return { complete: false, valid: false };
  }

  return {
    complete: true,
    valid: computeTarget(values, currentCage.operator) === currentCage.target,
  };
}

function validatePartialCage(currentCage, cells, allowedValues) {
  const values = currentCage.cells.map(({ row, col }) => cells[indexFor(row, col)]);
  const assigned = values.filter(Boolean);
  const empties = values.length - assigned.length;
  const maxValue = Math.max(...allowedValues);

  switch (currentCage.operator) {
    case '=':
      if (!assigned.length) {
        return true;
      }
      return assigned[0] === currentCage.target;
    case '+': {
      const sum = assigned.reduce((total, value) => total + value, 0);
      return sum <= currentCage.target && sum + empties * maxValue >= currentCage.target;
    }
    case '*': {
      const product = assigned.reduce((total, value) => total * value, 1);
      return product <= currentCage.target
        && currentCage.target % product === 0
        && product * (maxValue ** empties) >= currentCage.target;
    }
    case '-':
      if (assigned.length < 2) {
        if (!assigned.length) {
          return true;
        }
        const value = assigned[0];
        return allowedValues.some((candidate) => Math.abs(value - candidate) === currentCage.target);
      }
      return Math.abs(assigned[0] - assigned[1]) === currentCage.target;
    case '/':
      if (assigned.length < 2) {
        if (!assigned.length) {
          return true;
        }
        const value = assigned[0];
        return allowedValues.some((candidate) => {
          const high = Math.max(value, candidate);
          const low = Math.min(value, candidate);
          return low > 0 && high / low === currentCage.target;
        });
      }
      return computeTarget(assigned.slice(0, 2), '/') === currentCage.target;
    default:
      return false;
  }
}

export function validateCageLogicBoard(seed, cells) {
  const rowConflicts = findRowConflicts(cells);
  const columnConflicts = findColumnConflicts(cells);
  const cageConflicts = new Set();
  let incomplete = false;

  for (const currentCage of seed.cages) {
    const result = validateCage(seed, cells, currentCage);
    if (!result.complete) {
      incomplete = true;
      continue;
    }

    if (!result.valid) {
      for (const { row, col } of currentCage.cells) {
        cageConflicts.add(indexFor(row, col));
      }
    }
  }

  return {
    complete: !incomplete && cells.every((value) => value != null),
    rowConflicts,
    columnConflicts,
    cageConflicts,
    valid: rowConflicts.size === 0 && columnConflicts.size === 0 && cageConflicts.size === 0 && !incomplete,
  };
}

export function isSolvedCageLogicBoard(seed, cells) {
  const result = validateCageLogicBoard(seed, cells);
  return result.complete && result.valid;
}

function getCandidateValues(cells, index, allowedValues) {
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const used = new Set([
    ...getRowIndexes(row).map((cellIndex) => cells[cellIndex]).filter(Boolean),
    ...getColumnIndexes(col).map((cellIndex) => cells[cellIndex]).filter(Boolean),
  ]);
  return allowedValues.filter((digit) => !used.has(digit));
}

export function countCageLogicSolutions(seed, limit = 2) {
  const cells = Array(GRID_SIZE * GRID_SIZE).fill(null);
  const keypadValues = getKeypadValues(seed);
  let count = 0;

  function findNextIndex() {
    let bestIndex = -1;
    let bestCandidates = null;

    for (let index = 0; index < cells.length; index += 1) {
      if (cells[index] != null) {
        continue;
      }

      const candidates = getCandidateValues(cells, index, keypadValues).filter((candidate) => {
        cells[index] = candidate;
        const valid = seed.cages.every((currentCage) => validatePartialCage(currentCage, cells, keypadValues));
        cells[index] = null;
        return valid;
      });

      if (!bestCandidates || candidates.length < bestCandidates.length) {
        bestIndex = index;
        bestCandidates = candidates;
      }

      if (bestCandidates?.length <= 1) {
        break;
      }
    }

    return { bestIndex, bestCandidates: bestCandidates || [] };
  }

  function visit() {
    if (count >= limit) {
      return;
    }

    const { bestIndex, bestCandidates } = findNextIndex();
    if (bestIndex === -1) {
      if (isSolvedCageLogicBoard(seed, cells)) {
        count += 1;
      }
      return;
    }

    for (const candidate of bestCandidates) {
      cells[bestIndex] = candidate;
      visit();
      cells[bestIndex] = null;
    }
  }

  visit();
  return count;
}

function transformSolution(random) {
  const rowOrder = random.shuffle([0, 1, 2, 3]);
  const colOrder = random.shuffle([0, 1, 2, 3]);
  const digitOrder = random.shuffle(VALUE_POOL).slice(0, 4);

  return {
    keypadValues: digitOrder.slice(),
    solution: Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
      const row = Math.floor(index / GRID_SIZE);
      const col = index % GRID_SIZE;
      const baseValue = BASE_SOLUTION[indexFor(rowOrder[row], colOrder[col])];
      return digitOrder[baseValue - 1];
    }),
  };
}

function chooseGroupSize(profile, remaining, groupsLeft, random) {
  const minAllowed = Math.max(profile.minSize, remaining - (groupsLeft - 1) * profile.maxSize);
  const maxAllowed = Math.min(profile.maxSize, remaining - (groupsLeft - 1) * profile.minSize);
  const options = profile.preferredSizes.filter((size) => size >= minAllowed && size <= maxAllowed);
  return options.length ? random.pick(options) : minAllowed;
}

function growGroup(start, targetSize, available, random) {
  const keyOf = (cell) => `${cell.row}:${cell.col}`;
  const group = [start];
  const groupKeys = new Set([keyOf(start)]);

  while (group.length < targetSize) {
    const frontier = group.flatMap((cell) => getNeighbors(cell))
      .filter((cell) => available.has(keyOf(cell)) && !groupKeys.has(keyOf(cell)));

    if (!frontier.length) {
      return null;
    }

    const next = random.pick(frontier);
    group.push(next);
    groupKeys.add(keyOf(next));
  }

  return group;
}

function partitionIntoCages(solution, level, random) {
  const profile = LEVEL_PROFILES[level] || LEVEL_PROFILES.easy;
  const desiredCages = profile.minCages + random.nextInt(profile.maxCages - profile.minCages + 1);
  const available = new Set(Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
    const row = Math.floor(index / GRID_SIZE);
    const col = index % GRID_SIZE;
    return `${row}:${col}`;
  }));
  const cages = [];

  while (available.size > 0) {
    const groupsLeft = desiredCages - cages.length;
    if (groupsLeft <= 0) {
      return null;
    }

    const remaining = available.size;
    const targetSize = chooseGroupSize(profile, remaining, groupsLeft, random);
    const [startKey] = random.shuffle([...available]);
    const [row, col] = startKey.split(':').map(Number);
    const group = growGroup({ row, col }, targetSize, available, random);
    if (!group) {
      return null;
    }

    cages.push(group);
    for (const cell of group) {
      available.delete(`${cell.row}:${cell.col}`);
    }
  }

  const singleCount = cages.filter((currentCage) => currentCage.length === 1).length;
  if (cages.length < profile.minCages || cages.length > profile.maxCages) {
    return null;
  }
  if (singleCount < profile.minSingles || singleCount > profile.maxSingles) {
    return null;
  }

  return cages;
}

function getValidOperators(level, values) {
  if (values.length === 1) {
    return ['='];
  }

  if (level === 'easy') {
    return ['+'];
  }

  if (values.length > 2) {
    return level === 'hard' ? ['+', '*'] : ['+', '*'];
  }

  const operators = ['+', '-', '*'];
  const sorted = [...values].sort((left, right) => right - left);

  if (sorted[1] > 0 && sorted[0] % sorted[1] === 0) {
    operators.push('/');
  }

  if (level === 'medium') {
    return operators.filter((operator) => operator !== '/');
  }

  return operators;
}

function chooseOperator(level, values, random) {
  const valid = getValidOperators(level, values);
  if (!valid.length) {
    return null;
  }

  if (level !== 'hard') {
    return random.pick(valid);
  }

  const weighted = valid.flatMap((operator) => (
    operator === '/' || operator === '*' ? [operator, operator, operator] : [operator]
  ));
  return random.pick(weighted);
}

function buildCages(solution, groups, level, random) {
  const cages = groups.map((group) => {
    const values = group.map((cell) => getCellValue(solution, cell));
    const operator = chooseOperator(level, values, random);
    if (!operator) {
      return null;
    }

    return cage(computeTarget(values, operator), operator, cloneCells(group));
  });

  if (cages.some((currentCage) => !currentCage)) {
    return null;
  }

  if (level === 'hard') {
    const strongOps = cages.filter((currentCage) => currentCage.operator === '*' || currentCage.operator === '/').length;
    if (strongOps < 2) {
      return null;
    }
  }

  return cages;
}

function getCageIndexMap(seed) {
  const map = new Map();
  seed.cages.forEach((currentCage, cageIndex) => {
    currentCage.cells.forEach(({ row, col }) => {
      map.set(indexFor(row, col), cageIndex);
    });
  });
  return map;
}

function getCageLabelMap(seed) {
  const labels = new Map();
  seed.cages.forEach((currentCage) => {
    const anchorIndex = Math.min(...currentCage.cells.map(({ row, col }) => indexFor(row, col)));
    labels.set(anchorIndex, `${currentCage.target}${currentCage.operator === '=' ? '' : currentCage.operator}`);
  });
  return labels;
}

function getCellBorderStyle(cellIndex, cageIndexMap) {
  const row = Math.floor(cellIndex / GRID_SIZE);
  const col = cellIndex % GRID_SIZE;
  const cageIndex = cageIndexMap.get(cellIndex);
  const topNeighbor = row > 0 ? cageIndexMap.get(indexFor(row - 1, col)) : null;
  const rightNeighbor = col < GRID_SIZE - 1 ? cageIndexMap.get(indexFor(row, col + 1)) : null;
  const bottomNeighbor = row < GRID_SIZE - 1 ? cageIndexMap.get(indexFor(row + 1, col)) : null;
  const leftNeighbor = col > 0 ? cageIndexMap.get(indexFor(row, col - 1)) : null;

  return `
    border-top-width:${row === 0 || topNeighbor !== cageIndex ? 3 : 1}px;
    border-right-width:${col === GRID_SIZE - 1 || rightNeighbor !== cageIndex ? 3 : 1}px;
    border-bottom-width:${row === GRID_SIZE - 1 || bottomNeighbor !== cageIndex ? 3 : 1}px;
    border-left-width:${col === 0 || leftNeighbor !== cageIndex ? 3 : 1}px;
  `;
}

export function generateCageLogic({ level = 'easy', boardId = createBoardId(level) } = {}) {
  for (let attempt = 0; attempt < 192; attempt += 1) {
    const random = createSeededRandom(`${boardId}:${attempt}`);
    const { solution, keypadValues } = transformSolution(random);
    const groups = partitionIntoCages(solution, level, random);
    if (!groups) {
      continue;
    }

    const cages = buildCages(solution, groups, level, random);
    if (!cages) {
      continue;
    }

    const seed = {
      id: `${boardId}:${attempt}`,
      solution,
      keypadValues,
      cages,
    };

    if (countCageLogicSolutions(seed, 2) === 1) {
      return normalizeBoardSpec(seed, level, boardId);
    }
  }

  const fallback = CAGE_LOGIC_SEEDS[level === 'easy' ? 0 : level === 'medium' ? 1 : 2];
  return normalizeBoardSpec(fallback, level, boardId);
}

function createSnapshot(state) {
  return {
    level: state.level,
    boardId: state.seed.boardId,
    boardSpec: normalizeBoardSpec(state.seed, state.level, state.seed.boardId),
    cells: state.cells.slice(),
    startedAt: state.startedAt,
  };
}

function renderLevelSelector(levels, selectedLevel) {
  return `
    <div class="puzzle-level-picker" role="group" aria-label="Cage Logic difficulty">
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

function renderBoard(state) {
  const validation = state.validation;
  const cageIndexMap = getCageIndexMap(state.seed);
  const cageLabels = getCageLabelMap(state.seed);

  return `
    <section class="puzzle-card">
      ${renderPuzzlePanelHeader({
        title: 'Cage Logic',
        description: 'In this sudoku style KenKen puzzle, fill the 4x4 grid so each row and column uses each keypad value once, while every cage hits its arithmetic target.',
        levelPicker: renderLevelSelector(state.levels, state.level),
        rows: [
          [
            { label: 'Level', value: state.levelLabel },
            { label: 'Elapsed', value: state.context.formatDuration(Date.now() - state.startedAt) },
          ],
          [
            { label: 'Board', value: LEVEL_COPY[state.level] || LEVEL_COPY.easy, valueColSpan: 3 },
          ],
        ],
      })}

      <div class="cage-board" role="grid" aria-label="Cage Logic board">
        ${Array.from({ length: 16 }, (_, cellIndex) => {
          const value = state.cells[cellIndex];
          const isSelected = state.selectedIndex === cellIndex;
          const isInvalid =
            validation
            && (validation.rowConflicts.has(cellIndex)
              || validation.columnConflicts.has(cellIndex)
              || validation.cageConflicts.has(cellIndex));

          return `
            <button
              type="button"
              class="cage-cell${isSelected ? ' is-selected' : ''}${isInvalid ? ' is-invalid' : ''}"
              data-action="select-cell"
              data-index="${cellIndex}"
              data-cage-tone="${cageIndexMap.get(cellIndex) % 4}"
              style="${getCellBorderStyle(cellIndex, cageIndexMap)}"
            >
              ${cageLabels.has(cellIndex) ? `<span class="cage-label">${cageLabels.get(cellIndex)}</span>` : ''}
              <span class="cage-value">${value ?? ''}</span>
            </button>
          `;
        }).join('')}
      </div>

      <div class="cage-keypad">
        ${getKeypadValues(state.seed).map((digit) => `<button type="button" class="puzzle-button" data-action="digit" data-digit="${digit}">${digit}</button>`).join('')}
        <button type="button" class="puzzle-button puzzle-button-secondary cage-keypad-clear" data-action="clear-cell">Clear Cell</button>
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

export function createCageLogicModule() {
  let root = null;
  let context = null;
  let state = null;
  let handleClick = null;
  let handleKeydown = null;

  function render() {
    root.innerHTML = renderBoard({ ...state, context });
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
    state.cells = Array(16).fill(null);
    state.selectedIndex = 0;
    state.startedAt = Date.now();
    state.message = 'Select a cell, then enter a keypad value.';
    state.validation = null;
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
      state.cells = saved.cells.slice(0, 16).map((value) => (getKeypadValues(boardSpec).includes(value) ? value : null));
      state.selectedIndex = 0;
      state.startedAt = saved.startedAt;
      state.message = 'Resumed from your local save.';
      state.validation = null;
      state.isSolved = false;
      render();
      return;
    }

    setBoard(generateCageLogic({ level: selectedLevel }), selectedLevel, true);
  }

  function setCellValue(value) {
    if (state.selectedIndex == null) {
      state.message = 'Select a cell first.';
      render();
      return;
    }

    context.markDiscovered();
    state.cells[state.selectedIndex] = value;
    state.message = value == null ? 'Cell cleared.' : `Placed ${value}.`;
    if (state.validation) {
      state.validation = validateCageLogicBoard(state.seed, state.cells);
    }
    syncProgress();
    render();
  }

  function moveSelection(offsetRow, offsetCol) {
    const row = Math.floor(state.selectedIndex / GRID_SIZE);
    const col = state.selectedIndex % GRID_SIZE;
    const nextRow = Math.max(0, Math.min(GRID_SIZE - 1, row + offsetRow));
    const nextCol = Math.max(0, Math.min(GRID_SIZE - 1, col + offsetCol));
    state.selectedIndex = indexFor(nextRow, nextCol);
    render();
  }

  function checkBoard() {
    state.validation = validateCageLogicBoard(state.seed, state.cells);

    if (!state.validation.complete) {
      state.message = 'The board is not complete yet.';
      render();
      return;
    }

    if (!state.validation.valid) {
      if (state.validation.rowConflicts.size > 0) {
        state.message = 'Each row must use each keypad value exactly once.';
      } else if (state.validation.columnConflicts.size > 0) {
        state.message = 'Each column must use each keypad value exactly once.';
      } else {
        state.message = 'One or more cages miss their target.';
      }
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
    setBoard(generateCageLogic({ level }), level, true);
  }

  return {
    id: 'cage-logic',
    mount(nextRoot, nextContext) {
      root = nextRoot;
      context = nextContext;
      state = {
        seed: null,
        level: context.getSelectedLevel(),
        levelLabel: '',
        levels: context.getLevels(),
        cells: Array(16).fill(null),
        selectedIndex: 0,
        startedAt: Date.now(),
        message: '',
        validation: null,
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

        if (action === 'select-cell') {
          state.selectedIndex = Number.parseInt(target.dataset.index, 10);
          render();
          return;
        }

        if (action === 'digit') {
          setCellValue(Number.parseInt(target.dataset.digit, 10));
          return;
        }

        if (action === 'clear-cell') {
          setCellValue(null);
          return;
        }

        if (action === 'check') {
          checkBoard();
          return;
        }

        if (action === 'reset') {
          setBoard(normalizeBoardSpec(state.seed, state.level, state.seed.boardId), state.level, true);
          return;
        }

        if (action === 'new-puzzle') {
          setBoard(generateCageLogic({ level: state.level }), state.level, true);
        }
      };

      handleKeydown = (event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveSelection(-1, 0);
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveSelection(1, 0);
          return;
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          moveSelection(0, -1);
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          moveSelection(0, 1);
          return;
        }

        const typedValue = Number.parseInt(event.key, 10);
        if (Number.isFinite(typedValue) && getKeypadValues(state.seed).includes(typedValue)) {
          event.preventDefault();
          setCellValue(typedValue);
          return;
        }

        if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
          event.preventDefault();
          setCellValue(null);
        }
      };

      root.addEventListener('click', handleClick);
      window.addEventListener('keydown', handleKeydown);
      restoreBoard();
    },
    unmount() {
      if (root && handleClick) {
        root.removeEventListener('click', handleClick);
      }
      if (handleKeydown) {
        window.removeEventListener('keydown', handleKeydown);
      }

      root = null;
      context = null;
      state = null;
      handleClick = null;
      handleKeydown = null;
    },
    getSnapshot() {
      return state ? createSnapshot(state) : null;
    },
  };
}
