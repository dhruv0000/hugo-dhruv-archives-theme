import test from 'node:test';
import assert from 'node:assert/strict';

import { getEnabledModes, getNudge, resolveActiveModeId } from '../static/puzzles/app.mjs';
import { CAGE_LOGIC_SEEDS, countCageLogicSolutions, findColumnConflicts, findRowConflicts, generateCageLogic, isSolvedCageLogicBoard, validateCage } from '../static/puzzles/cage-logic.mjs';
import { EQUATION_GRID_SEEDS, countEquationGridSolutions, generateEquationGrid, validateEquationGridBoard } from '../static/puzzles/equation-grid.mjs';
import { addRandomTile, isGameOver, slideBoard } from '../static/puzzles/game-2048.mjs';
import { buildTuningTargets, centsBetween, findClosestTuningTarget, frequencyToNoteName, getPitchGuidance, isTuningSessionComplete, noteNameToFrequency, parseTuningInput } from '../static/puzzles/instrument-tuner.mjs';
import { getDefaultLevel, getModeLevels, normalizePuzzleMeta } from '../static/puzzles/levels.mjs';
import { createMemoryStorage, createStore, STORAGE_KEY, STORAGE_KEY_V1 } from '../static/puzzles/store.mjs';
import { PitchDetector } from '../static/puzzles/vendor/pitchy.mjs';

function areCellsContiguous(cells) {
  const queue = [cells[0]];
  const seen = new Set([`${cells[0].row}:${cells[0].col}`]);

  while (queue.length) {
    const current = queue.shift();
    const neighbors = cells.filter((cell) => (
      Math.abs(cell.row - current.row) + Math.abs(cell.col - current.col) === 1
    ));

    for (const neighbor of neighbors) {
      const key = `${neighbor.row}:${neighbor.col}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      queue.push(neighbor);
    }
  }

  return seen.size === cells.length;
}

function rowValues(board, row, size = 4) {
  return board.slice(row * size, row * size + size);
}

function columnValues(board, col, size = 4) {
  return Array.from({ length: size }, (_, row) => board[row * size + col]);
}

test('Equation Grid accepts a correct solved board', () => {
  const seed = EQUATION_GRID_SEEDS[0];
  const result = validateEquationGridBoard(seed, seed.solution);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('Generated easy Equation Grid boards stay additive and unique', () => {
  const seed = generateEquationGrid({ level: 'easy', boardId: 'eq-easy' });
  const operators = [...seed.rowOps.flat(), ...seed.colOps.flat()];
  assert.ok(operators.every((operator) => operator === '+' || operator === '-'));
  assert.equal(seed.bankValues.length, 9);
  assert.ok(seed.bankValues.every((value) => `${value}`.length <= 2));
  assert.ok(seed.bankValues.some((value) => value > 9));
  assert.ok([...seed.rowTargets, ...seed.colTargets].every((target) => target >= 0));
  assert.equal(countEquationGridSolutions(seed, 2), 1);
  assert.equal(validateEquationGridBoard(seed, seed.solution).valid, true);
});

test('Generated hard Equation Grid boards include division and stay unique', () => {
  const seed = generateEquationGrid({ level: 'hard', boardId: 'eq-hard' });
  const operators = [...seed.rowOps.flat(), ...seed.colOps.flat()];
  assert.ok(operators.includes('/'));
  assert.ok([...seed.rowTargets, ...seed.colTargets].every(Number.isInteger));
  assert.equal(countEquationGridSolutions(seed, 2), 1);
});

test('Cage Logic finds row conflicts', () => {
  const board = [
    1, 1, 3, 4,
    3, 4, 1, 2,
    2, 3, 4, 1,
    4, 2, 2, 3,
  ];
  assert.deepEqual([...findRowConflicts(board)].sort((a, b) => a - b), [0, 1, 13, 14]);
});

test('Cage Logic finds column conflicts', () => {
  const board = [
    1, 2, 3, 4,
    1, 4, 1, 2,
    2, 1, 4, 3,
    4, 3, 2, 3,
  ];
  assert.deepEqual([...findColumnConflicts(board)].sort((a, b) => a - b), [0, 4, 11, 15]);
});

test('Cage Logic validates cages', () => {
  const seed = CAGE_LOGIC_SEEDS[0];
  const result = validateCage(seed, seed.solution, seed.cages[0]);
  assert.equal(result.valid, true);
});

test('Generated medium Cage Logic boards are unique and contiguous', () => {
  const seed = generateCageLogic({ level: 'medium', boardId: 'cage-medium' });
  const keypadSet = new Set(seed.keypadValues);
  assert.ok(seed.cages.length >= 6 && seed.cages.length <= 8);
  assert.equal(seed.keypadValues.length, 4);
  assert.ok(seed.keypadValues.every((value) => `${value}`.length <= 2));
  assert.ok(seed.keypadValues.some((value) => value > 4));
  assert.ok(Array.from({ length: 4 }, (_, row) => row).every((row) => {
    const values = rowValues(seed.solution, row);
    return new Set(values).size === keypadSet.size && values.every((value) => keypadSet.has(value));
  }));
  assert.ok(Array.from({ length: 4 }, (_, col) => col).every((col) => {
    const values = columnValues(seed.solution, col);
    return new Set(values).size === keypadSet.size && values.every((value) => keypadSet.has(value));
  }));
  assert.ok(seed.cages.every((currentCage) => areCellsContiguous(currentCage.cells)));
  assert.equal(countCageLogicSolutions(seed, 2), 1);
  assert.equal(isSolvedCageLogicBoard(seed, seed.solution), true);
});

test('Generated hard Cage Logic boards use dense operators', () => {
  const seed = generateCageLogic({ level: 'hard', boardId: 'cage-hard' });
  const strongOperators = seed.cages.filter((currentCage) => currentCage.operator === '*' || currentCage.operator === '/');
  assert.ok(seed.cages.length >= 5 && seed.cages.length <= 7);
  assert.ok(strongOperators.length >= 2);
  assert.equal(countCageLogicSolutions(seed, 2), 1);
});

test('2048 merges once per move and updates score', () => {
  const board = [
    2, 2, 2, 2,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
  const result = slideBoard(board, 'left');
  assert.deepEqual(result.board.slice(0, 4), [4, 4, 0, 0]);
  assert.equal(result.scoreDelta, 8);
});

test('2048 identifies game over boards', () => {
  const board = [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    4, 2, 4, 2,
  ];
  assert.equal(isGameOver(board), true);
});

test('2048 addRandomTile fills one empty slot', () => {
  const board = [
    2, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
  const result = addRandomTile(board, () => 0);
  assert.equal(result.filter((value) => value !== 0).length, 2);
});

test('Puzzle meta defaults are synthesized when missing', () => {
  const meta = normalizePuzzleMeta();
  assert.equal(getDefaultLevel('equation-grid', meta), 'easy');
  assert.deepEqual(
    getModeLevels('2048', meta).map((level) => level.targetTile),
    [512, 1024, 2048],
  );
  assert.deepEqual(getModeLevels('instrument-tuner', meta), []);
});

test('Invalid defaults fall back to the first enabled level', () => {
  const meta = normalizePuzzleMeta({
    modes: {
      equationGrid: {
        defaultLevel: 'hard',
        levels: {
          easy: { enabled: false },
          medium: { enabled: true, label: 'Mid' },
          hard: { enabled: false },
        },
      },
    },
  });

  assert.equal(getDefaultLevel('equation-grid', meta), 'medium');
  assert.deepEqual(getModeLevels('equation-grid', meta).map((level) => level.label), ['Mid']);
});

test('Disabled individual puzzles are filtered, sorted, and keep levels', () => {
  const modes = getEnabledModes({
    enabled: true,
    modes: {
      equationGrid: { enabled: true, order: 2, label: 'Equation Grid' },
      cageLogic: { enabled: false, order: 1, label: 'Cage Logic' },
      game2048: { enabled: true, order: 1, label: '2048' },
      instrumentTuner: { enabled: false, order: 4, label: 'Instrument Tuner' },
    },
    puzzleMeta: {
      modes: {
        game2048: {
          defaultLevel: 'medium',
        },
      },
    },
  });

  assert.deepEqual(modes.map((mode) => mode.id), ['2048', 'equation-grid']);
  assert.equal(modes[0].defaultLevel, 'medium');
  assert.equal(modes[0].levels[2].targetTile, 2048);
});

test('Invalid hashes fall back to the first enabled puzzle', () => {
  const modes = getEnabledModes({
    enabled: true,
    modes: {
      equationGrid: { enabled: true, order: 2, label: 'Equation Grid' },
      game2048: { enabled: true, order: 1, label: '2048' },
    },
  });
  assert.equal(resolveActiveModeId('#cage-logic', modes), '2048');
  assert.equal(resolveActiveModeId('', modes), '2048');
});

test('Store initializes v2 defaults with selected levels and zero solve counts', () => {
  const storage = createMemoryStorage();
  const store = createStore({
    storage,
    storageKey: STORAGE_KEY,
    defaultLevels: {
      'equation-grid': 'easy',
      'cage-logic': 'medium',
      '2048': 'hard',
    },
  });

  assert.deepEqual(store.getModeState('equation-grid').solvesByLevel, { easy: 0, medium: 0, hard: 0 });
  assert.equal(store.getModeState('cage-logic').selectedLevel, 'medium');
  assert.equal(store.getModeState('2048').selectedLevel, 'hard');
  assert.equal(store.getModeState('instrument-tuner').selectedTuningId, 'preset:guitar');
  assert.deepEqual(store.getState().customTunings, []);
});

test('Store migrates legacy v1 progress into level counts', () => {
  const legacyState = {
    streak: { current: 2, best: 3, lastCompletedDate: '2026-03-05' },
    modes: {
      'equation-grid': {
        plays: 4,
        solves: 3,
        bestTimeMs: 120000,
        averageTimeMs: 150000,
        totalCompletedTimeMs: 450000,
        matrix: { discover: true, clear: true, sharpen: false, master: false },
        inProgress: { seedId: 'equation-alpha', cells: [1], startedAt: 1234 },
      },
      '2048': {
        plays: 6,
        completedSessions: 5,
        bestScore: 9000,
        bestTile: 2048,
        bestTimeMs: 300000,
        averageTimeMs: 360000,
        totalCompletedTimeMs: 1800000,
        matrix: { discover: true, clear: true, sharpen: true, master: true },
      },
    },
  };

  const storage = createMemoryStorage({
    [STORAGE_KEY_V1]: JSON.stringify(legacyState),
  });
  const store = createStore({ storage, storageKey: STORAGE_KEY });

  assert.equal(store.getModeState('equation-grid').discover, true);
  assert.equal(store.getModeState('equation-grid').solvesByLevel.medium, 3);
  assert.equal(store.getModeState('equation-grid').inProgress.seedId, 'equation-alpha');
  assert.deepEqual(store.getModeState('2048').solvesByLevel, { easy: 1, medium: 1, hard: 1 });
  assert.ok(storage.getItem(STORAGE_KEY));
});

test('Timed solve records per-level counts and clears in-progress state', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, storageKey: STORAGE_KEY });
  store.startMode('equation-grid', { boardId: 'eq-1' });
  store.recordTimedSolve('equation-grid', { level: 'hard', durationMs: 90000 });

  const modeState = store.getModeState('equation-grid');
  assert.equal(modeState.solves, 1);
  assert.equal(modeState.solvesByLevel.hard, 1);
  assert.equal(modeState.bestTimeMs, 90000);
  assert.equal(modeState.inProgress, null);
});

test('Selected level persists per mode', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, storageKey: STORAGE_KEY });
  store.setSelectedLevel('cage-logic', 'hard');
  assert.equal(store.getModeState('cage-logic').selectedLevel, 'hard');
});

test('Custom tunings persist and selected tuning survives reload', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, storageKey: STORAGE_KEY });

  store.saveCustomTuning({
    id: 'custom:open-d',
    label: 'Open D',
    notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'],
  });
  store.setSelectedTuning('instrument-tuner', {
    tuningId: 'custom:open-d',
    label: 'Open D',
  });

  const reloaded = createStore({ storage, storageKey: STORAGE_KEY });
  assert.equal(reloaded.getModeState('instrument-tuner').selectedTuningId, 'custom:open-d');
  assert.equal(reloaded.getModeState('instrument-tuner').selectedInstrumentLabel, 'Open D');
  assert.equal(reloaded.getState().customTunings[0].label, 'Open D');
});

test('Instrument tuner completion mirrors total across all progress columns', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, storageKey: STORAGE_KEY });

  store.recordInstrumentTuning({
    tuningId: 'preset:guitar',
    label: 'Guitar',
    durationMs: 45000,
  });

  const modeState = store.getModeState('instrument-tuner');
  assert.equal(modeState.completedTunings, 1);
  assert.equal(modeState.solves, 1);
  assert.deepEqual(modeState.solvesByLevel, { easy: 1, medium: 1, hard: 1 });
  assert.equal(modeState.bestTimeMs, 45000);
});

test('Instrument tuner state is synthesized when old saves do not have it', () => {
  const storage = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      streak: { current: 1, best: 2, lastCompletedDate: '2026-03-05' },
      modes: {
        'equation-grid': {
          selectedLevel: 'easy',
          solvesByLevel: { easy: 2, medium: 1, hard: 0 },
          solves: 3,
        },
      },
    }),
  });

  const store = createStore({ storage, storageKey: STORAGE_KEY });
  assert.equal(store.getModeState('instrument-tuner').selectedTuningId, 'preset:guitar');
  assert.equal(store.getModeState('instrument-tuner').completedTunings, 0);
});

test('2048 level solves increment once per recorded level and session stats persist', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, storageKey: STORAGE_KEY });
  store.recordLevelSolve('2048', 'medium');
  store.record2048Session({ score: 4200, bestTile: 1024, durationMs: 200000, madeMoves: true });

  const modeState = store.getModeState('2048');
  assert.equal(modeState.solvesByLevel.medium, 1);
  assert.equal(modeState.completedSessions, 1);
  assert.equal(modeState.bestTile, 1024);
});

test('Nudge prioritizes undiscovered modes before weaker level counts', () => {
  const modes = getEnabledModes({
    enabled: true,
    modes: {
      equationGrid: { enabled: true, order: 1, label: 'Equation Grid' },
      game2048: { enabled: true, order: 2, label: '2048' },
      instrumentTuner: { enabled: false, order: 3, label: 'Instrument Tuner' },
    },
  });

  const nudge = getNudge(modes, {
    modes: {
      'equation-grid': { discover: true, solvesByLevel: { easy: 1, medium: 1, hard: 1 } },
      '2048': { discover: false, solvesByLevel: { easy: 0, medium: 0, hard: 0 } },
    },
  });

  assert.match(nudge, /2048/i);
});

test('Instrument tuner is included in enabled mode ordering', () => {
  const modes = getEnabledModes({
    enabled: true,
    modes: {
      equationGrid: { enabled: true, order: 2, label: 'Equation Grid' },
      instrumentTuner: { enabled: true, order: 1, label: 'Instrument Tuner' },
      game2048: { enabled: true, order: 3, label: '2048' },
    },
  });

  assert.deepEqual(modes.map((mode) => mode.id), ['instrument-tuner', 'equation-grid', '2048']);
  assert.equal(modes[0].usesLevels, false);
  assert.deepEqual(modes[0].levels, []);
});

test('Instrument tuner note parsing normalizes scientific pitch input', () => {
  const parsed = parseTuningInput('d2 A2 d3 f#3 A3 d4');
  assert.deepEqual(parsed.notes, ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4']);
  assert.deepEqual(parsed.invalidTokens, []);
});

test('Instrument tuner reports invalid note tokens', () => {
  const parsed = parseTuningInput('E2 H2 B2');
  assert.deepEqual(parsed.notes, ['E2', 'B2']);
  assert.deepEqual(parsed.invalidTokens, ['H2']);
});

test('Instrument tuner note conversions stay musically aligned', () => {
  assert.ok(Math.abs(noteNameToFrequency('A4') - 440) < 0.001);
  assert.equal(frequencyToNoteName(440), 'A4');
  assert.equal(Math.round(centsBetween(466.1637615, 440)), 100);
});

test('Instrument tuner guidance tells the player whether to go up or down', () => {
  assert.equal(getPitchGuidance(-19).label, 'Tune up');
  assert.equal(getPitchGuidance(21).label, 'Tune down');
  assert.equal(getPitchGuidance(3).label, 'In tune');
});

test('Vendored pitch detector resolves a clean A4 sine wave accurately', () => {
  const sampleRate = 44100;
  const inputLength = 4096;
  const detector = PitchDetector.forFloat32Array(inputLength);
  detector.clarityThreshold = 0.9;
  detector.minVolumeDecibels = -35;

  const input = new Float32Array(inputLength);
  for (let index = 0; index < inputLength; index += 1) {
    input[index] = Math.sin((2 * Math.PI * 440 * index) / sampleRate);
  }

  const [pitch, clarity] = detector.findPitch(input, sampleRate);
  assert.ok(Math.abs(pitch - 440) < 2, `expected ~440Hz, got ${pitch}`);
  assert.ok(clarity > 0.9, `expected clarity > 0.9, got ${clarity}`);
});

test('Instrument tuner picks the nearest incomplete target', () => {
  const targets = buildTuningTargets({
    notes: ['E2', 'A2', 'D3'],
  });
  const match = findClosestTuningTarget(targets, noteNameToFrequency('A2'), {
    completed: [false, true, false],
    incompleteOnly: true,
  });

  assert.equal(match.target.note, 'D3');
});

test('Instrument tuner can calculate manual lock guidance for a chosen string', () => {
  const targets = buildTuningTargets({
    notes: ['E2', 'A2', 'D3'],
  });
  const lockedTarget = targets[1];
  const cents = centsBetween(noteNameToFrequency('A#2'), lockedTarget.frequency);

  assert.ok(cents > 0);
  assert.equal(getPitchGuidance(cents).label, 'Tune down');
});

test('Instrument tuner session completion requires every string once', () => {
  assert.equal(isTuningSessionComplete([true, true, true]), true);
  assert.equal(isTuningSessionComplete([true, false, true]), false);
});
