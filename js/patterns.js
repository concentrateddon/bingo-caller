// Bingo card helpers: ball naming, quick-start pattern presets, and card rendering.

import { LETTERS, newEvening, newGame, uid } from './store.js';

export const ballLetter = (n) => LETTERS[Math.floor((n - 1) / 15)];
export const ballKey = (n) => ballLetter(n) + n; // e.g. "B7", "O75" — also the voice file name
export const columnOf = (n) => Math.floor((n - 1) / 15);

const grid = (fn) => Array.from({ length: 25 }, (_, i) => (fn(Math.floor(i / 5), i % 5) ? 1 : 0));

// Starting points the host can tweak. `kind: 'example'` presets bring several variants.
export const PRESETS = [
  {
    name: 'Any Straight Line',
    kind: 'example',
    patterns: [grid((r) => r === 2), grid((r, c) => c === 2), grid((r, c) => r === c), grid((r, c) => r + c === 4)],
  },
  { name: 'Four Corners', patterns: [grid((r, c) => r % 4 === 0 && c % 4 === 0)] },
  { name: 'Blackout', patterns: [grid(() => true)] },
  { name: 'Letter X', patterns: [grid((r, c) => r === c || r + c === 4)] },
  { name: 'Plus Sign', patterns: [grid((r, c) => r === 2 || c === 2)] },
  { name: 'Picture Frame', patterns: [grid((r, c) => r % 4 === 0 || c % 4 === 0)] },
  {
    name: 'Postage Stamp',
    kind: 'example',
    patterns: [
      grid((r, c) => r < 2 && c < 2),
      grid((r, c) => r < 2 && c > 2),
      grid((r, c) => r > 2 && c > 2),
      grid((r, c) => r > 2 && c < 2),
    ],
  },
  { name: 'Letter T', patterns: [grid((r, c) => r === 0 || c === 2)] },
  { name: 'Letter L', patterns: [grid((r, c) => c === 0 || r === 4)] },
  { name: 'Diamond', patterns: [grid((r, c) => Math.abs(r - 2) + Math.abs(c - 2) === 2)] },
  { name: 'Checkerboard', patterns: [grid((r, c) => (r + c) % 2 === 0)] },
];

/**
 * Render a 5x5 card (with B-I-N-G-O header).
 *  - out:      array of 5 booleans, columns that are out of play
 *  - onCell:   (index) => void   makes squares tappable
 *  - onLetter: (col) => void     makes header letters tappable (toggle out-of-play)
 * The returned element has `.update(cells, out)` to repaint without rebuilding.
 */
export function renderCard(cells, { out = [], onCell, onLetter, label = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (onCell ? ' editable' : '');
  if (label) el.setAttribute('aria-label', label);

  const heads = LETTERS.map((L, c) => {
    const h = document.createElement(onLetter ? 'button' : 'div');
    h.className = `card-head c${c}`;
    h.textContent = L;
    if (onLetter) {
      h.type = 'button';
      h.addEventListener('click', () => onLetter(c));
    }
    el.append(h);
    return h;
  });

  const squares = cells.map((_, i) => {
    const s = document.createElement(onCell ? 'button' : 'div');
    s.className = 'sq';
    if (onCell) {
      s.type = 'button';
      s.setAttribute('aria-label', `Row ${Math.floor(i / 5) + 1}, column ${LETTERS[i % 5]}`);
      s.addEventListener('click', () => onCell(i));
    }
    el.append(s);
    return s;
  });

  el.update = (nextCells, nextOut = []) => {
    heads.forEach((h, c) => h.classList.toggle('out', !!nextOut[c]));
    squares.forEach((s, i) => {
      s.classList.toggle('on', !!nextCells[i]);
      s.classList.toggle('out', !!nextOut[i % 5]);
      if (onCell) s.setAttribute('aria-pressed', nextCells[i] ? 'true' : 'false');
    });
  };
  el.update(cells, out);
  return el;
}

/** Tiny non-interactive thumbnail used in lists. */
export function thumb(game) {
  const el = renderCard(game.patterns[0] || [], { out: game.outCols });
  el.classList.add('thumb');
  return el;
}

/** The evening a first-time visitor starts with, so every screen has something to show. */
export function sampleEvening(voice = '') {
  const make = (name, outCols = []) => {
    const p = PRESETS.find((x) => x.name === name);
    const g = newGame();
    g.name = p.name;
    g.kind = p.kind || 'shown';
    g.patterns = p.patterns.map((c) => [...c]);
    g.voice = voice;
    g.outCols = LETTERS.map((_, i) => outCols.includes(i));
    return g;
  };
  const ev = newEvening('Sample Evening', 0);
  ev.games = [
    make('Any Straight Line'),
    make('Four Corners'),
    make('Letter X'),
    make('Postage Stamp'),
    make('Plus Sign', [0, 4]), // B and O out of play
    make('Picture Frame'),
    make('Letter T'),
    make('Diamond'),
    make('Checkerboard'),
    make('Blackout'),
  ];
  ev.twists = [
    { id: uid(), text: 'Swap cards with another player — your choice!', when: 'random' },
    { id: uid(), text: 'Everyone pass your card to the player on your left!', when: 'start' },
  ];
  return ev;
}
