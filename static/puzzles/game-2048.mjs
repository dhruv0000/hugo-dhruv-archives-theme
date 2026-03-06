import { renderPuzzlePanelHeader } from './panel.mjs';

const GRID_SIZE = 4;

function cloneBoard(board) {
  return board.slice(0, GRID_SIZE * GRID_SIZE);
}

export function createEmptyBoard() {
  return Array(GRID_SIZE * GRID_SIZE).fill(0);
}

export function compressLine(line) {
  const compact = line.filter((value) => value !== 0);
  const merged = [];
  let scoreDelta = 0;

  for (let index = 0; index < compact.length; index += 1) {
    const currentValue = compact[index];
    const nextValue = compact[index + 1];

    if (currentValue !== 0 && currentValue === nextValue) {
      const doubledValue = currentValue * 2;
      merged.push(doubledValue);
      scoreDelta += doubledValue;
      index += 1;
    } else {
      merged.push(currentValue);
    }
  }

  while (merged.length < GRID_SIZE) {
    merged.push(0);
  }

  return {
    line: merged,
    scoreDelta,
  };
}

function getLine(board, direction, index) {
  if (direction === 'left' || direction === 'right') {
    const rowStart = index * GRID_SIZE;
    const row = board.slice(rowStart, rowStart + GRID_SIZE);
    return direction === 'left' ? row : row.reverse();
  }

  const column = Array.from({ length: GRID_SIZE }, (_, row) => board[row * GRID_SIZE + index]);
  return direction === 'up' ? column : column.reverse();
}

function setLine(board, direction, index, line) {
  if (direction === 'left' || direction === 'right') {
    const nextLine = direction === 'left' ? line : [...line].reverse();
    nextLine.forEach((value, column) => {
      board[index * GRID_SIZE + column] = value;
    });
    return;
  }

  const nextLine = direction === 'up' ? line : [...line].reverse();
  nextLine.forEach((value, row) => {
    board[row * GRID_SIZE + index] = value;
  });
}

export function slideBoard(board, direction) {
  const nextBoard = createEmptyBoard();
  let moved = false;
  let scoreDelta = 0;

  for (let index = 0; index < GRID_SIZE; index += 1) {
    const originalLine = getLine(board, direction, index);
    const { line, scoreDelta: lineScoreDelta } = compressLine(originalLine);
    scoreDelta += lineScoreDelta;

    if (!moved && line.some((value, lineIndex) => value !== originalLine[lineIndex])) {
      moved = true;
    }

    setLine(nextBoard, direction, index, line);
  }

  return {
    board: nextBoard,
    moved,
    scoreDelta,
    bestTile: Math.max(...nextBoard),
  };
}

export function getEmptyCellIndexes(board) {
  return board.flatMap((value, index) => (value === 0 ? [index] : []));
}

export function addRandomTile(board, random = Math.random) {
  const emptyIndexes = getEmptyCellIndexes(board);
  if (!emptyIndexes.length) {
    return cloneBoard(board);
  }

  const nextBoard = cloneBoard(board);
  const index = emptyIndexes[Math.floor(random() * emptyIndexes.length)];
  nextBoard[index] = random() < 0.9 ? 2 : 4;
  return nextBoard;
}

export function isGameOver(board) {
  if (getEmptyCellIndexes(board).length > 0) {
    return false;
  }

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const index = row * GRID_SIZE + col;
      const current = board[index];
      const right = col < GRID_SIZE - 1 ? board[index + 1] : null;
      const below = row < GRID_SIZE - 1 ? board[index + GRID_SIZE] : null;

      if (current === right || current === below) {
        return false;
      }
    }
  }

  return true;
}

function createSnapshot(state) {
  return {
    board: state.board.slice(),
    score: state.score,
    startedAt: state.startedAt,
    moves: state.moves,
    bestTile: state.bestTile,
    level: state.level,
    sessionSolvedLevel: state.sessionSolvedLevel,
  };
}

function createNewState(level) {
  let board = createEmptyBoard();
  board = addRandomTile(board);
  board = addRandomTile(board);

  return {
    board,
    score: 0,
    startedAt: Date.now(),
    moves: 0,
    bestTile: Math.max(...board),
    level,
    finished: false,
    completedRecorded: false,
    sessionSolvedLevel: null,
    message: 'Use arrow keys or swipe to merge tiles.',
  };
}

function tileClass(value) {
  return value > 0 ? ` tile-${value}` : '';
}

function renderLevelSelector(levels, selectedLevel) {
  return `
    <div class="puzzle-level-picker" role="group" aria-label="2048 difficulty">
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

function renderBoard(state, context) {
  const targetTile = state.levels.find((level) => level.key === state.level)?.targetTile || 512;
  const levelLabel = state.levels.find((level) => level.key === state.level)?.label || state.level;

  return `
    <section class="puzzle-card">
      ${renderPuzzlePanelHeader({
        title: '2048',
        description: 'Keep combining equal tiles. Each level tracks its own target tile in this browser.',
        levelPicker: renderLevelSelector(state.levels, state.level),
        rows: [
          [
            { label: 'Level', value: levelLabel },
            { label: 'Target', value: targetTile },
          ],
          [
            { label: 'Score', value: state.score },
            { label: 'Best score', value: context.getModeState().bestScore || 0 },
          ],
          [
            { label: 'Best tile', value: state.bestTile },
            { label: 'Elapsed', value: context.formatDuration(Date.now() - state.startedAt) },
          ],
        ],
      })}

      <div class="game-2048-board" data-2048-board>
        ${state.board
          .map(
            (value) => `
              <div class="game-2048-tile${tileClass(value)}" data-value="${value}">
                ${value === 0 ? '' : value}
              </div>
            `,
          )
          .join('')}
      </div>

      <div class="puzzle-actions">
        <button type="button" class="puzzle-button" data-action="restart">Restart</button>
      </div>

      <p class="puzzle-status${state.finished ? ' is-success' : ''}">${state.message}</p>
    </section>
  `;
}

export function createGame2048Module() {
  let root = null;
  let context = null;
  let state = null;
  let handleClick = null;
  let handleKeydown = null;
  let handleTouchStart = null;
  let handleTouchEnd = null;
  let touchOrigin = null;

  function render() {
    root.innerHTML = renderBoard(state, context);
  }

  function saveProgress() {
    context.saveProgress(createSnapshot(state));
  }

  function startNewSession(level, incrementPlay) {
    state = {
      ...createNewState(level),
      levels: context.getLevels(),
    };

    if (incrementPlay) {
      context.startSession(createSnapshot(state));
    } else {
      saveProgress();
    }
    render();
  }

  function restoreOrStart() {
    const saved = context.getModeState().inProgress;
    const selectedLevel = context.getSelectedLevel();

    if (
      saved
      && Array.isArray(saved.board)
      && saved.board.length === GRID_SIZE * GRID_SIZE
      && typeof saved.startedAt === 'number'
      && (!saved.level || saved.level === selectedLevel)
    ) {
      state = {
        board: saved.board.map((value) => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0)),
        score: Number.isFinite(saved.score) ? Math.max(0, Math.trunc(saved.score)) : 0,
        startedAt: saved.startedAt,
        moves: Number.isFinite(saved.moves) ? Math.max(0, Math.trunc(saved.moves)) : 0,
        bestTile: Number.isFinite(saved.bestTile) ? Math.max(0, Math.trunc(saved.bestTile)) : Math.max(...saved.board),
        level: saved.level || selectedLevel,
        finished: false,
        completedRecorded: false,
        sessionSolvedLevel: typeof saved.sessionSolvedLevel === 'string' ? saved.sessionSolvedLevel : null,
        message: 'Resumed from your local save.',
        levels: context.getLevels(),
      };
      render();
      return;
    }

    startNewSession(selectedLevel, true);
  }

  function finishSession(reasonMessage) {
    if (!state || state.completedRecorded) {
      return;
    }

    const madeMoves = state.moves > 0;
    const durationMs = Date.now() - state.startedAt;
    context.record2048Session({
      score: state.score,
      bestTile: state.bestTile,
      durationMs,
      madeMoves,
    });
    state.completedRecorded = true;
    state.finished = true;
    state.message = reasonMessage || `Session finished in ${context.formatDuration(durationMs)}.`;
  }

  function maybeRecordLevelSolve() {
    const targetTile = state.levels.find((level) => level.key === state.level)?.targetTile || 512;
    if (state.sessionSolvedLevel === state.level || state.bestTile < targetTile) {
      return;
    }

    context.recordLevelSolve(state.level);
    state.sessionSolvedLevel = state.level;
    state.message = `Target ${targetTile} reached on ${state.levels.find((level) => level.key === state.level)?.label || state.level}. Keep pushing.`;
  }

  function handleMove(direction) {
    if (state.finished) {
      return;
    }

    const result = slideBoard(state.board, direction);
    if (!result.moved) {
      return;
    }

    state.board = addRandomTile(result.board);
    state.score += result.scoreDelta;
    state.moves += 1;
    state.bestTile = Math.max(state.bestTile, Math.max(...state.board));
    state.message = 'Merge toward a bigger tile.';
    context.markDiscovered();
    maybeRecordLevelSolve();

    if (isGameOver(state.board)) {
      finishSession(`Game over. Final score ${state.score}. Restart for another run.`);
      render();
      return;
    }

    saveProgress();
    render();
  }

  function switchLevel(level) {
    if (level === state.level) {
      return;
    }

    if (!state.finished && state.moves > 0) {
      finishSession(`Session banked at ${state.score}. Fresh board ready.`);
    }

    context.setSelectedLevel(level);
    startNewSession(level, true);
  }

  return {
    id: '2048',
    mount(nextRoot, nextContext) {
      root = nextRoot;
      context = nextContext;
      restoreOrStart();

      handleClick = (event) => {
        const target = event.target.closest('[data-action]');
        if (!target) {
          return;
        }

        if (target.dataset.action === 'restart') {
          if (!state.finished && state.moves > 0) {
            finishSession(`Session banked at ${state.score}. Fresh board ready.`);
          }
          startNewSession(state.level, true);
          return;
        }

        if (target.dataset.action === 'select-level') {
          switchLevel(target.dataset.level);
        }
      };

      handleKeydown = (event) => {
        const directionMap = {
          ArrowUp: 'up',
          ArrowDown: 'down',
          ArrowLeft: 'left',
          ArrowRight: 'right',
          w: 'up',
          s: 'down',
          a: 'left',
          d: 'right',
          k: 'up',
          j: 'down',
          h: 'left',
          l: 'right',
        };
        const direction = directionMap[event.key];
        if (!direction) {
          return;
        }

        event.preventDefault();
        handleMove(direction);
      };

      handleTouchStart = (event) => {
        const touch = event.changedTouches?.[0];
        if (!touch) {
          return;
        }

        touchOrigin = { x: touch.clientX, y: touch.clientY };
      };

      handleTouchEnd = (event) => {
        const touch = event.changedTouches?.[0];
        if (!touchOrigin || !touch) {
          return;
        }

        const deltaX = touch.clientX - touchOrigin.x;
        const deltaY = touch.clientY - touchOrigin.y;
        touchOrigin = null;

        if (Math.abs(deltaX) < 24 && Math.abs(deltaY) < 24) {
          return;
        }

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          handleMove(deltaX > 0 ? 'right' : 'left');
        } else {
          handleMove(deltaY > 0 ? 'down' : 'up');
        }
      };

      root.addEventListener('click', handleClick);
      window.addEventListener('keydown', handleKeydown);
      root.addEventListener('touchstart', handleTouchStart, { passive: true });
      root.addEventListener('touchend', handleTouchEnd, { passive: true });
    },
    unmount() {
      if (root && handleClick) {
        root.removeEventListener('click', handleClick);
      }
      if (root && handleTouchStart) {
        root.removeEventListener('touchstart', handleTouchStart);
      }
      if (root && handleTouchEnd) {
        root.removeEventListener('touchend', handleTouchEnd);
      }
      if (handleKeydown) {
        window.removeEventListener('keydown', handleKeydown);
      }

      root = null;
      context = null;
      state = null;
      handleClick = null;
      handleKeydown = null;
      handleTouchStart = null;
      handleTouchEnd = null;
      touchOrigin = null;
    },
    getSnapshot() {
      return state ? createSnapshot(state) : null;
    },
  };
}
