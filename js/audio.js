// Voice packs: a pack is a folder voicepacks/<id>/ of short audio clips named B1.<ext> … O75.<ext>,
// Bingo.<ext> and FalseBingo.<ext>. packs.json lists the available packs and their file extension.
// Clips are fetched and decoded into memory when a game starts, so playback is instant.

import { ballKey } from './patterns.js';

export const VOICE_CACHE = 'bingo-voice-v1'; // keep in sync with sw.js
const PACKS_LS = 'bingo.packs.v1';

export const BALL_KEYS = Array.from({ length: 75 }, (_, i) => ballKey(i + 1));
// Optional clips: one announcement per digit, played before a WILD round ("…mark every ball ending in 7…").
// A pack without them still works; the round just starts without an announcement.
export const WILD_KEYS = Array.from({ length: 10 }, (_, d) => `Wild${d}`);
export const REQUIRED_KEYS = [...BALL_KEYS, 'Bingo', 'FalseBingo'];
export const ALL_KEYS = [...REQUIRED_KEYS, ...WILD_KEYS];

export const packUrl = (pack, key) => `voicepacks/${encodeURIComponent(pack.id)}/${key}.${pack.ext || 'mp3'}`;

/** Fetch the list of available packs (falls back to the last list seen, for offline use). */
export async function loadPacks() {
  try {
    const res = await fetch('voicepacks/packs.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const packs = ((await res.json()).packs || []).filter((p) => p && p.id);
    localStorage.setItem(PACKS_LS, JSON.stringify(packs));
    return packs;
  } catch {
    try {
      return JSON.parse(localStorage.getItem(PACKS_LS)) || [];
    } catch {
      return [];
    }
  }
}

export class Voice {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.inflight = new Map();
    this.packId = '';
    this.source = null;
    this.muted = false;
  }

  ensureCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this.ctx;
  }

  /** Call from a tap handler so the browser allows audio. */
  unlock() {
    try {
      const ctx = this.ensureCtx();
      if (ctx.state === 'suspended') ctx.resume();
    } catch {
      /* no audio available */
    }
  }

  /**
   * Load the given clip keys of a pack into memory. Resolves with the keys that were missing.
   * Passing no pack releases whatever was loaded.
   */
  async load(pack, keys, onProgress) {
    if (!pack) {
      this.packId = '';
      this.buffers.clear();
      this.inflight.clear();
      return { missing: [], total: 0 };
    }
    if (this.packId !== pack.id) {
      this.buffers.clear();
      this.inflight.clear();
      this.packId = pack.id;
    }
    const packId = pack.id;
    const ctx = this.ensureCtx();

    const fetchOne = (key) => {
      if (this.buffers.has(key)) return Promise.resolve(true);
      if (!this.inflight.has(key)) {
        this.inflight.set(
          key,
          (async () => {
            try {
              const res = await fetch(packUrl(pack, key));
              if (!res.ok) return false;
              const buf = await ctx.decodeAudioData(await res.arrayBuffer());
              if (this.packId === packId) this.buffers.set(key, buf);
              return true;
            } catch {
              return false;
            }
          })(),
        );
      }
      return this.inflight.get(key);
    };

    const missing = [];
    let done = 0;
    const queue = [...keys];
    const worker = async () => {
      while (queue.length) {
        const key = queue.shift();
        if (!(await fetchOne(key))) missing.push(key);
        onProgress?.(++done, keys.length);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    return { missing, total: keys.length };
  }

  /** Play a clip; resolves when it finishes (immediately if muted or not available). */
  play(key) {
    return new Promise((resolve) => {
      this.stop();
      const buf = this.buffers.get(key);
      if (this.muted || !buf || !this.ctx) return resolve();
      this.ctx.resume?.();
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.onended = () => {
        if (this.source === src) this.source = null;
        resolve();
      };
      this.source = src;
      src.start();
    });
  }

  stop() {
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    this.source = null;
  }
}

/** Download every clip of every pack into the offline cache (also refreshes older copies). */
export async function cachePacksOffline(packs, onProgress) {
  const cache = await caches.open(VOICE_CACHE);
  const jobs = packs.flatMap((p) => ALL_KEYS.map((k) => packUrl(p, k)));
  let done = 0;
  let stored = 0;
  const queue = [...jobs];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      // retry transient failures (flaky wifi, busy server); a 404 just means the clip doesn't exist
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(url, { cache: 'reload' });
          if (res.ok) {
            await cache.put(url, res);
            stored++;
            break;
          }
          if (res.status === 404) break;
        } catch {
          /* offline or interrupted: try again */
        }
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
      onProgress?.(++done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { stored, total: jobs.length };
}

const absUrl = (pack, key) => new URL(packUrl(pack, key), document.baseURI).href;

/** How much of a pack is stored on this device: { required, optional } clip counts. */
export async function cacheStatus(pack) {
  if (!('caches' in window)) return { required: 0, optional: 0 };
  const cache = await caches.open(VOICE_CACHE);
  const have = new Set((await cache.keys()).map((r) => r.url));
  const count = (keys) => keys.filter((k) => have.has(absUrl(pack, k))).length;
  return { required: count(REQUIRED_KEYS), optional: count(WILD_KEYS) };
}

/** Delete every cached voice clip (the pack list itself is kept). */
export async function clearVoiceCache() {
  const cache = await caches.open(VOICE_CACHE);
  for (const req of await cache.keys()) {
    if (!new URL(req.url).pathname.endsWith('/voicepacks/packs.json')) await cache.delete(req);
  }
}
