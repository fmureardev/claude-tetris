'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // Nut - metallic gray
  '#37474f', // Special - slate
];

const SKIN_KEY = 'tetris-skin';

const SKIN_COLORS = {
  retro: COLORS,
  neon: [
    null,
    '#00e5ff', // I - cyan
    '#ffee00', // O - yellow
    '#e040fb', // T - purple
    '#00ff66', // S - green
    '#ff1744', // Z - red
    '#2979ff', // J - blue
    '#ff9100', // L - orange
    '#e0e0e0', // Nut
    '#ffffff', // Special
  ],
  pastel: [
    null,
    '#a7d8de', // I
    '#fdeaa7', // O
    '#dcc6e0', // T
    '#bde3bd', // S
    '#f2b8b5', // Z
    '#bcd8f7', // J
    '#f7d3a7', // L
    '#d8dcdf', // Nut
    '#c9ced1', // Special
  ],
  pixel: COLORS,
};

const SKIN_STYLES = {
  retro: { bg: null, grid: null },
  neon: { bg: '#000000', grid: '#0c1e1e' },
  pastel: { bg: '#faf6f2', grid: '#ece3da' },
  pixel: { bg: null, grid: null },
};

const pixelPatternCache = {};

const SPECIAL = 9;
const EFFECTS = ['bomb', 'lightning', 'tint', 'gravity', 'freeze'];
const EFFECT_ICONS = { bomb: '💣', lightning: '⚡', tint: '🎨', gravity: '⬇️', freeze: '❄️' };
const FREEZE_DURATION = 5000;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut (tuerca) - hollow center
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor;
let pendingSpecial, lineMilestone, frozenUntil;

let currentSkin = SKIN_COLORS[localStorage.getItem(SKIN_KEY)] ? localStorage.getItem(SKIN_KEY) : 'retro';

function updateGridColor() {
  gridColor = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const clamp = v => Math.min(255, Math.max(0, v));
  const r = clamp((num >> 16) + Math.round(255 * percent));
  const g = clamp(((num >> 8) & 0xff) + Math.round(255 * percent));
  const b = clamp((num & 0xff) + Math.round(255 * percent));
  return `rgb(${r},${g},${b})`;
}

function getPixelPattern(context, colorIndex) {
  let pattern = pixelPatternCache[colorIndex];
  if (pattern) return pattern;
  const color = SKIN_COLORS.pixel[colorIndex];
  const light = shadeColor(color, 0.18);
  const dark = shadeColor(color, -0.18);
  const off = document.createElement('canvas');
  off.width = 8;
  off.height = 8;
  const octx = off.getContext('2d');
  octx.fillStyle = color;
  octx.fillRect(0, 0, 8, 8);
  octx.fillStyle = dark;
  octx.fillRect(0, 0, 4, 4);
  octx.fillRect(4, 4, 4, 4);
  octx.fillStyle = light;
  octx.fillRect(4, 0, 4, 4);
  octx.fillRect(0, 4, 4, 4);
  pattern = context.createPattern(off, 'repeat');
  pixelPatternCache[colorIndex] = pattern;
  return pattern;
}

function drawRoundedRect(context, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(x, y, w, h, radius);
  } else {
    context.moveTo(x + radius, y);
    context.arcTo(x + w, y, x + w, y + h, radius);
    context.arcTo(x + w, y + h, x, y + h, radius);
    context.arcTo(x, y + h, x, y, radius);
    context.arcTo(x, y, x + w, y, radius);
    context.closePath();
  }
}

function skinBg() {
  return SKIN_STYLES[currentSkin].bg;
}

function skinGrid() {
  return SKIN_STYLES[currentSkin].grid || gridColor;
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomSpecialPiece() {
  const effect = EFFECTS[Math.floor(Math.random() * EFFECTS.length)];
  return { type: SPECIAL, shape: [[SPECIAL]], effect, special: true,
           x: Math.floor(COLS / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    const milestone = Math.floor(lines / 10);
    if (milestone > lineMilestone) {
      lineMilestone = milestone;
      pendingSpecial = true;
    }
    updateHUD();
  }
}

function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    const stack = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c]) stack.push(board[r][c]);
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      board[r][c] = stack[ROWS - 1 - r] ?? 0;
    }
  }
}

function removeMostCommonColor() {
  const counts = {};
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c]) counts[board[r][c]] = (counts[board[r][c]] || 0) + 1;
  const colors = Object.keys(counts);
  if (!colors.length) return;
  const mostCommon = Number(colors.reduce((a, b) => (counts[a] >= counts[b] ? a : b)));
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === mostCommon) board[r][c] = 0;
  applyGravity();
}

function applyEffect(piece) {
  const { x, y, effect } = piece;
  switch (effect) {
    case 'bomb':
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = y + dr, nc = x + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) board[nr][nc] = 0;
        }
      break;
    case 'lightning':
      if (y >= 0 && y < ROWS) board[y].fill(0);
      for (let r = 0; r < ROWS; r++) if (x >= 0 && x < COLS) board[r][x] = 0;
      break;
    case 'tint':
      removeMostCommonColor();
      break;
    case 'gravity':
      applyGravity();
      break;
    case 'freeze':
      merge();
      frozenUntil = performance.now() + FREEZE_DURATION;
      break;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.special) applyEffect(current);
  else merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  if (pendingSpecial) {
    pendingSpecial = false;
    next = randomSpecialPiece();
  } else {
    next = randomPiece();
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const px = x * size, py = y * size;
  context.globalAlpha = alpha ?? 1;

  switch (currentSkin) {
    case 'neon': {
      const color = SKIN_COLORS.neon[colorIndex];
      context.save();
      context.shadowBlur = 12;
      context.shadowColor = color;
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      context.shadowBlur = 0;
      context.strokeStyle = 'rgba(255,255,255,0.55)';
      context.lineWidth = 1;
      context.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
      context.restore();
      break;
    }
    case 'pastel': {
      const color = SKIN_COLORS.pastel[colorIndex];
      const r = Math.max(4, size * 0.2);
      drawRoundedRect(context, px + 1, py + 1, size - 2, size - 2, r);
      context.fillStyle = color;
      context.fill();
      drawRoundedRect(context, px + 2, py + 2, size - 4, Math.max(2, (size - 4) * 0.35), r * 0.6);
      context.fillStyle = 'rgba(255,255,255,0.4)';
      context.fill();
      break;
    }
    case 'pixel': {
      context.fillStyle = getPixelPattern(context, colorIndex);
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      context.strokeStyle = 'rgba(0,0,0,0.35)';
      context.lineWidth = 1;
      context.strokeRect(px + 1, py + 1, size - 2, size - 2);
      break;
    }
    default: {
      context.fillStyle = SKIN_COLORS.retro[colorIndex];
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    }
  }

  context.globalAlpha = 1;
}

function drawEffectIcon(context, x, y, size, effect, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = '#ffffff';
  context.font = `${Math.floor(size * 0.6)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(EFFECT_ICONS[effect], x * size + size / 2, y * size + size / 2 + 1);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = skinGrid();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  const bg = skinBg();
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.special) drawEffectIcon(ctx, current.x, gy, BLOCK, current.effect, 0.3);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.special) drawEffectIcon(ctx, current.x, current.y, BLOCK, current.effect);

  // freeze feedback
  if (performance.now() < frozenUntil) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#4fc3f7';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('❄️ Congelado', canvas.width / 2, 6);
    ctx.globalAlpha = 1;
  }
}

function drawNext() {
  const NB = 30;
  const bg = skinBg();
  if (bg) {
    nextCtx.fillStyle = bg;
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  } else {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.special) drawEffectIcon(nextCtx, offX, offY, NB, next.effect);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (ts < frozenUntil) {
    dropAccum = 0;
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  if (!gameOver && !paused) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  pendingSpecial = false;
  lineMilestone = 0;
  frozenUntil = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('change', () => {
  document.body.classList.toggle('light-theme', themeToggle.checked);
  updateGridColor();
});

skinSelect.addEventListener('change', () => {
  currentSkin = skinSelect.value;
  localStorage.setItem(SKIN_KEY, currentSkin);
  draw();
  drawNext();
});

skinSelect.value = currentSkin;
updateGridColor();
init();
