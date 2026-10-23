// Local persistence: saved evenings (setup) and in-progress play state (recovery).
// Everything lives in localStorage; nothing is sent anywhere.

const EVENINGS_KEY = 'bingo.evenings.v1';
const STATE_KEY = 'bingo.state.v1';
const INTERVAL_KEY = 'bingo.interval.v1';

export const LETTERS = ['B', 'I', 'N', 'G', 'O'];
export const emptyCells = () => Array(25).fill(0);

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('Could not save', key, e);
    return false;
  }
}

// ---------- Evenings ----------

export function newGame() {
  return {
    id: uid(),
    name: '',
    kind: 'shown', // 'shown' = exactly as shown, 'example' = any similar shape counts
    patterns: [emptyCells()], // more than one only matters for 'example' games
    voice: '', // voice pack id, '' = none (live caller)
    outCols: [false, false, false, false, false],
  };
}

export function newEvening(name = 'New Evening', gameCount = 10) {
  return {
    id: uid(),
    name,
    games: Array.from({ length: gameCount }, newGame),
    twists: [],
  };
}

export function loadDb() {
  const db = read(EVENINGS_KEY);
  if (db && Array.isArray(db.evenings) && db.evenings.length) {
    if (!db.evenings.some((e) => e.id === db.activeId)) db.activeId = db.evenings[0].id;
    return db;
  }
  return null;
}

export function saveDb(db) {
  return write(EVENINGS_KEY, db);
}

export function activeEvening(db) {
  return db.evenings.find((e) => e.id === db.activeId) || db.evenings[0];
}

// ---------- Play state (recovery) ----------

export const loadState = () => {
  const s = read(STATE_KEY);
  return s && s.v === 1 ? s : null;
};
export const saveState = (s) => write(STATE_KEY, s);
export const clearState = () => {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
};

export const loadInterval = () => {
  const n = Number(read(INTERVAL_KEY));
  return n >= 3 && n <= 60 ? n : 12;
};
export const saveInterval = (n) => write(INTERVAL_KEY, n);
