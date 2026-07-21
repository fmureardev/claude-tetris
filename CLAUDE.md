# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris. No dependencies, no build step, no package.json — three files: `index.html`, `style.css`, `game.js`. Everything runs directly in the browser via Canvas 2D API.

## Running the game

No install/build required. Either open `index.html` directly in a browser, or serve it statically:

```bash
python3 -m http.server 8000
# or
npx serve .
```

There is no test suite, linter, or build/watch command in this repo.

## Architecture

All game logic lives in `game.js` (~300 lines, single file, no modules). Key parts:

- **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–7` identifying which piece type locked there.
- **Pieces**: the 7 tetrominoes are defined as square matrices in `PIECES`. Rotation is done via `rotateCW` (transpose + reverse), not by storing pre-rotated states.
- **Collision** (`collide`): checks board bounds and overlap with locked cells.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until a non-colliding position is found.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates delta time and advances the piece one row once `dropAccum >= dropInterval`.
- **Line clearing** (`clearLines`): scans bottom-to-top, splices full rows out and unshifts empty rows at the top.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop = 2 pts/cell dropped, soft drop = 1 pt/row.
- **Leveling**: level increases every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)` ms.
- **Ghost piece**: `ghostY()` projects the current piece straight down to its landing row; drawn at `globalAlpha = 0.2`.
- **Rendering**: `draw()` redraws the whole board every frame onto `<canvas id="board">` (300×600, `BLOCK = 30`px cells); `drawNext()` renders the preview piece onto a separate small canvas.

Control flow: `init()` → `createBoard()`, seed `next`, `spawn()` (promotes `next` to `current`, generates a new `next`), then starts `loop()`. Keyboard events (`keydown`) handle move/rotate/soft-drop/hard-drop/pause and call `updateHUD()` after each action. If a freshly spawned piece immediately collides, `endGame()` fires and shows the Game Over overlay.

## Tuning constants (in `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, the `<canvas id="board">` `width`/`height` in `index.html` must be updated to match (`COLS×BLOCK` by `ROWS×BLOCK`).
