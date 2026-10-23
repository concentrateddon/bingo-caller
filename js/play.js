// PLAY mode: run an evening game by game — auto-calling, draw animation, tote board, twists.
//
// All progress lives in one state object (S) that is saved to localStorage after every change,
// so the app can offer to pick up where it left off after a restart.

import { h, dialog, confirmDialog, toast, randInt, shuffle } from './ui.js';
import { LETTERS, activeEvening, clearState, loadInterval, saveInterval, saveState } from './store.js';
import { BALL_KEYS, WILD_KEYS } from './audio.js';
import { ballKey, ballLetter, columnOf, renderCard } from './patterns.js';
import { startBallAnimation } from './balls.js';

const ANIM_MS = 2000; // length of the bouncing-balls animation
const MIN_INTERVAL = 3;
const MAX_INTERVAL = 60;
const WILD_PAUSE_MS = 5000; // fixed pause between balls in a WILD round
const ROTATE_MS = 3500; // how often multiple example patterns alternate

const NUMBERS = Array.from({ length: 75 }, (_, i) => i + 1);

const kindCaption = (g) => (g.kind === 'example' ? 'EXAMPLE — any similar shape wins' : 'AS SHOWN — match exactly');
const outText = (g) => (g.outCols.some(Boolean) ? `Columns out of play: ${LETTERS.filter((_, c) => g.outCols[c]).join(' ')}` : '');

function ballEl(n, size) {
  return h(
    'div',
    { class: `ball ${size} c${columnOf(n)}` },
    h('div', { class: 'ball-in' }, h('div', { class: 'ball-face' }, h('span', { class: 'bl' }, ballLetter(n)), h('span', { class: 'bn' }, n))),
  );
}

/** Modal 0–9 keypad for WILD. Resolves with the chosen digit, or null if cancelled. */
function pickDigit(remainingBalls) {
  return new Promise((resolve) => {
    const close = (v) => {
      backdrop.remove();
      resolve(v);
    };
    const backdrop = h(
      'div',
      { class: 'modal-backdrop', onclick: (e) => e.target === backdrop && close(null) },
      h(
        'div',
        { class: 'modal wild-modal', role: 'dialog', 'aria-modal': 'true' },
        h('h2', {}, 'WILD — call every ball ending in…'),
        h(
          'div',
          { class: 'digit-grid' },
          Array.from({ length: 10 }, (_, d) => {
            const count = remainingBalls.filter((x) => x % 10 === d).length;
            return h(
              'button',
              { class: 'btn digit', disabled: !count, onclick: () => close(d) },
              h('b', {}, d),
              h('small', {}, count ? `${count} ball${count === 1 ? '' : 's'}` : 'none left'),
            );
          }),
        ),
        h('p', {}, 'Balls are called in order, 5 seconds apart, then play stops. Balls already called are skipped.'),
        h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => close(null) }, 'Cancel')),
      ),
    );
    document.body.append(backdrop);
  });
}

export function mountPlay(root, { db, getPacks, voice, initialState, onHome }) {
  let S = initialState;
  let cleanups = [];
  const persist = () => saveState(S);
  const onCleanup = (fn) => cleanups.push(fn);
  const runCleanups = () => {
    cleanups.forEach((fn) => fn());
    cleanups = [];
  };
  // Tear down the previous screen first, then build the new one (builders may register cleanups).
  const scene = (build) => {
    runCleanups();
    root.replaceChildren(build());
  };

  const game = () => S.evening.games[S.gameIndex];
  const packOf = (g) => (g.voice ? getPacks().find((p) => p.id === g.voice) || null : null);
  const keysFor = (g) => [...BALL_KEYS.filter((_, i) => !g.outCols[columnOf(i + 1)]), 'Bingo', 'FalseBingo'];
  const remaining = () => {
    const g = game();
    const called = new Set(S.called);
    return NUMBERS.filter((n) => !g.outCols[columnOf(n)] && !called.has(n));
  };

  // ------------------------------------------------------------ shared: pattern pane (left third)

  function patternPane(g, { label, onMenu }) {
    const patterns = g.kind === 'example' ? g.patterns : [g.patterns[0]];
    let idx = 0;
    const card = renderCard(patterns[0], { out: g.outCols, label: 'Current pattern' });
    const dots = patterns.length > 1 ? h('div', { class: 'dots' }, patterns.map((_, i) => h('span', { class: 'dot' + (i === 0 ? ' sel' : '') }))) : null;
    const el = h(
      'section',
      { class: 'left' },
      h(
        'div',
        { class: 'left-top' },
        onMenu && h('button', { class: 'icon-btn', 'aria-label': 'Menu', onclick: onMenu }, '☰'),
        h('div', { class: 'gno' }, label),
      ),
      h('h2', { class: 'pname' }, g.name || 'Pattern'),
      h('div', { class: 'cardwrap' }, card),
      h('div', { class: `kind ${g.kind}` }, kindCaption(g)),
      dots,
    );
    if (patterns.length > 1) {
      const t = setInterval(() => {
        card.classList.add('fading');
        setTimeout(() => {
          idx = (idx + 1) % patterns.length;
          card.update(patterns[idx], g.outCols);
          dots.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('sel', i === idx));
          card.classList.remove('fading');
        }, 250);
      }, ROTATE_MS);
      onCleanup(() => clearInterval(t));
    }
    return el;
  }

  // ------------------------------------------------------------ lobby (no saved state)

  function lobby() {
    let chosen = activeEvening(db);
    const body = h('div', { class: 'lobby-body' });
    const paint = () => {
      const warnings = chosen.games.map((g, i) => (g.patterns.some((p) => p.some(Boolean)) ? null : `Game ${i + 1} has no squares marked.`)).filter(Boolean);
      body.replaceChildren(
        h(
          'div',
          { class: 'lobby-info' },
          h('p', {}, `${chosen.games.length} games · ${chosen.twists.filter((t) => t.text.trim()).length} secret twist(s)`),
          warnings.map((w) => h('p', { class: 'warn' }, '⚠ ' + w)),
        ),
        h(
          'div',
          { class: 'lobby-games' },
          chosen.games.map((g, i) =>
            h('div', { class: 'lobby-game' }, h('span', { class: 'num' }, i + 1), h('span', { class: 'gname' }, g.name || 'Untitled', h('small', {}, g.kind === 'example' ? 'Example' : 'As shown'))),
          ),
        ),
        h('button', { class: 'btn primary huge', onclick: () => startEvening(chosen) }, 'Start evening'),
      );
    };
    paint();
    scene(() =>
      h(
        'div',
        { class: 'screen' },
        h(
          'header',
          { class: 'topbar' },
          h('button', { class: 'btn ghost', onclick: onHome }, '← Home'),
          h('h1', {}, 'Play'),
          h(
            'label',
            { class: 'evening-pick' },
            h('span', {}, 'Evening'),
            h(
              'select',
              {
                onchange: (e) => {
                  chosen = db.evenings.find((x) => x.id === e.target.value);
                  paint();
                },
              },
              db.evenings.map((e) => h('option', { value: e.id, selected: e.id === chosen.id }, e.name || 'Untitled')),
            ),
          ),
        ),
        h('main', { class: 'lobby' }, body),
      ),
    );
  }

  function startEvening(ev) {
    voice.unlock();
    const snapshot = JSON.parse(JSON.stringify(ev));
    // each twist lands on its own random game (wrapping if there are more twists than games)
    const order = shuffle(snapshot.games.map((_, i) => i));
    const twists = snapshot.twists
      .filter((t) => t.text.trim())
      .map((t, k) => ({ id: t.id, text: t.text, when: t.when, gameIndex: order[k % order.length], triggerAt: null, done: false }));
    S = {
      v: 1,
      evening: snapshot,
      phase: 'between',
      gameIndex: 0,
      called: [],
      ended: false,
      interval: loadInterval(),
      muted: false,
      twists,
      pendingTwist: null,
    };
    persist();
    between();
  }

  // ------------------------------------------------------------ between games

  function between() {
    const g = game();
    const n = S.gameIndex + 1;
    const total = S.evening.games.length;
    const pack = packOf(g);
    const status = h('p', { class: 'voice-status' }, '');
    let preload = null;

    if (g.voice && !pack) {
      status.textContent = `⚠ Voice pack “${g.voice}” was not found — this game will be called silently.`;
      status.classList.add('warn');
      voice.load(null, []);
      preload = Promise.resolve({ missing: [] });
    } else if (pack) {
      status.textContent = `🔊 Loading voice pack “${pack.name || pack.id}”…`;
      preload = voice.load(pack, keysFor(g), (d, t) => (status.textContent = `🔊 Loading voices… ${d}/${t}`)).then((r) => {
        status.textContent = r.missing.length
          ? `⚠ ${r.missing.length} voice clip(s) missing (${r.missing.slice(0, 6).join(', ')}${r.missing.length > 6 ? '…' : ''}) — those will be silent.`
          : `🔊 Voice pack “${pack.name || pack.id}” ready.`;
        status.classList.toggle('warn', r.missing.length > 0);
        return voice.load(pack, WILD_KEYS).then(() => r); // optional WILD announcements; never reported missing
      });
    } else {
      status.textContent = 'No voice pack — a human caller will announce the balls.';
      voice.load(null, []);
      preload = Promise.resolve({ missing: [] });
    }

    const start = async () => {
      voice.unlock();
      const veil = h('div', { class: 'veil' }, h('div', { class: 'spinner' }), h('p', {}, 'Getting the balls ready…'));
      document.body.append(veil);
      await preload;
      veil.remove();
      S.phase = 'game';
      S.called = [];
      S.ended = false;
      S.pendingTwist = null;
      planTwistTriggers();
      persist();
      gameScreen();
    };

    scene(() =>
      h(
        'div',
        { class: 'play between' },
        patternPane(g, { label: `GAME ${n} / ${total}`, onMenu: () => betweenMenu() }),
        h(
          'section',
          { class: 'between-right' },
          h('div', { class: 'eyebrow' }, S.gameIndex === 0 ? S.evening.name : 'Up next'),
          h('h1', {}, `Game ${n} of ${total}`),
          h('p', { class: 'lead' }, g.name || ''),
          h('p', {}, kindCaption(g)),
          outText(g) && h('p', { class: 'oop-note' }, outText(g)),
          status,
          h('button', { class: 'btn primary huge', onclick: start }, `Start Game ${n}`),
        ),
      ),
    );
  }

  function planTwistTriggers() {
    const g = game();
    const pool = NUMBERS.filter((x) => !g.outCols[columnOf(x)]).length;
    for (const t of S.twists) {
      if (t.gameIndex === S.gameIndex && !t.done && t.when === 'random' && t.triggerAt == null) {
        t.triggerAt = randInt(2, Math.max(2, Math.min(30, Math.floor(pool * 0.5))));
      }
    }
  }

  function advanceGame() {
    S.called = [];
    S.ended = false;
    S.pendingTwist = null;
    if (S.gameIndex + 1 >= S.evening.games.length) {
      clearState();
      done();
      return;
    }
    S.gameIndex++;
    S.phase = 'between';
    persist();
    between();
  }

  function done() {
    scene(() =>
      h(
        'div',
        { class: 'screen center' },
        h('div', { class: 'big-emoji' }, '🎉'),
        h('h1', {}, 'That’s the evening!'),
        h('p', { class: 'lead' }, `${S.evening.games.length} games played.`),
        h('button', { class: 'btn primary huge', onclick: onHome }, 'Back to home'),
      ),
    );
    S = null;
  }

  // ------------------------------------------------------------ the game screen

  function gameScreen() {
    const g = game();
    const n = S.gameIndex + 1;
    const total = S.evening.games.length;
    voice.muted = !!S.muted;

    let running = false;
    let phase = 'idle'; // idle | anim | show | wild | intro
    let wildQueue = []; // balls still to call in a WILD round
    let wildDigit = null;
    let wildToken = 0; // bumped by stop() so an announcement that finishes late is ignored
    let timer = null;
    let nextAt = 0;
    let drawAt = 0;
    let locked = false; // true while the FALSE BINGO clip plays
    let twistOpen = false;
    let stopAnim = null;

    // --- pieces
    const big = h('div', { class: 'ball big' });
    const prev = h('div', { class: 'prev' });
    const boardCells = new Map();
    const board = h(
      'div',
      { class: 'board' },
      LETTERS.map((L, c) =>
        h(
          'div',
          { class: `board-row r${c}` },
          h('div', { class: 'board-letter' }, L),
          NUMBERS.slice(c * 15, c * 15 + 15).map((num) => {
            const cell = h('div', { class: 'bc' }, num);
            boardCells.set(num, cell);
            return cell;
          }),
        ),
      ),
    );

    const goBtn = h('button', { class: 'btn go', onclick: () => go() }, 'GO');
    const stopBtn = h('button', { class: 'btn stop', onclick: () => stop() }, 'STOP');
    const intervalVal = h('div', { class: 'interval-val' });
    const slot = h('div', { class: 'slot' });
    let nextLabel = null;
    let nextBar = null;

    const setInterval_ = (v) => {
      S.interval = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, v));
      saveInterval(S.interval);
      persist();
      intervalVal.innerHTML = `<b>${S.interval}</b><span>sec / ball</span>`;
      if (running && phase === 'show') {
        nextAt = drawAt + Math.max(1000, S.interval * 1000 - ANIM_MS);
        clearTimeout(timer);
        timer = setTimeout(beginCycle, Math.max(0, nextAt - performance.now()));
      }
    };

    const controls = h(
      'div',
      { class: 'controls' },
      h('div', { class: 'ctl-go' }, goBtn, stopBtn),
      h(
        'div',
        { class: 'ctl-interval' },
        h('button', { class: 'btn round', 'aria-label': 'Faster (one second less)', onclick: () => setInterval_(S.interval - 1) }, '−'),
        intervalVal,
        h('button', { class: 'btn round', 'aria-label': 'Slower (one second more)', onclick: () => setInterval_(S.interval + 1) }, '+'),
      ),
      slot,
    );

    let el;
    scene(
      () =>
        (el = h(
          'div',
          { class: 'play' },
          patternPane(g, { label: `GAME ${n} / ${total}`, onMenu: () => menu() }),
          h('section', { class: 'right' }, h('div', { class: 'hero' }, big, prev), board, controls),
        )),
    );
    setInterval_(S.interval);

    // --- rendering
    function renderBall(pop) {
      const last = S.called[S.called.length - 1];
      if (last == null) {
        big.className = 'ball big empty';
        big.replaceChildren(h('div', { class: 'ball-in' }, h('div', { class: 'ball-face' }, h('span', { class: 'bn' }, '—'))));
      } else {
        big.className = `ball big c${columnOf(last)}`;
        big.replaceChildren(
          h('div', { class: 'ball-in' }, h('div', { class: 'ball-face' }, h('span', { class: 'bl' }, ballLetter(last)), h('span', { class: 'bn' }, last))),
        );
        if (pop) {
          void big.offsetWidth;
          big.classList.add('pop');
        }
      }
      prev.replaceChildren(...S.called.slice(-6, -1).reverse().map((x) => ballEl(x, 'small')));
    }

    function renderBoard() {
      const called = new Set(S.called);
      const last = S.called[S.called.length - 1];
      for (const [num, cell] of boardCells) {
        const out = g.outCols[columnOf(num)];
        cell.classList.toggle('on', called.has(num));
        cell.classList.toggle('oop', out);
        cell.classList.toggle('last', num === last);
      }
    }

    function renderControls() {
      const canGo = !running && !S.ended && !locked && !twistOpen && remaining().length > 0;
      goBtn.disabled = !canGo;
      stopBtn.disabled = !running;
      el.classList.toggle('running', running);
      nextLabel = nextBar = null;
      if (running) {
        nextLabel = h('span', {}, '');
        nextBar = h('i', {});
        slot.replaceChildren(h('div', { class: 'next' }, nextLabel, h('div', { class: 'bar' }, nextBar)));
        tick();
      } else {
        const wildBtn = h('button', { class: 'btn wild', disabled: S.ended || twistOpen || locked || !remaining().length, onclick: wild }, 'WILD');
        if (S.called.length) {
          slot.replaceChildren(
            h('button', { class: 'btn bingo', disabled: S.ended || twistOpen, onclick: bingo }, 'BINGO!'),
            h('button', { class: 'btn false', disabled: S.ended || twistOpen || locked, onclick: falseBingo }, 'FALSE BINGO'),
            wildBtn,
          );
        } else {
          slot.replaceChildren(h('div', { class: 'next idle' }, 'Press GO to start calling'), wildBtn);
        }
      }
    }

    function tick() {
      if (!nextLabel) return;
      if (phase === 'anim') {
        nextLabel.textContent = 'Drawing…';
        nextBar.style.width = '0%';
      } else if (phase === 'show') {
        const left = Math.max(0, nextAt - performance.now()) + ANIM_MS;
        const total = Math.max(MIN_INTERVAL * 1000, S.interval * 1000);
        nextLabel.textContent = `Next ball in ${Math.ceil(left / 1000)}s`;
        nextBar.style.width = `${Math.min(100, Math.max(0, (1 - left / total) * 100))}%`;
      } else if (phase === 'intro') {
        nextLabel.textContent = `WILD ${wildDigit}s · announcing…`;
        nextBar.style.width = '0%';
      } else if (phase === 'wild') {
        const left = Math.max(0, nextAt - performance.now());
        nextLabel.textContent = `WILD ${wildDigit}s · next in ${Math.ceil(left / 1000)}s`;
        nextBar.style.width = `${Math.min(100, Math.max(0, (1 - left / WILD_PAUSE_MS) * 100))}%`;
      }
    }
    const tickTimer = setInterval(tick, 100);
    onCleanup(() => clearInterval(tickTimer));

    // --- engine
    function go() {
      if (running || S.ended || locked || twistOpen || !remaining().length) return;
      voice.unlock();
      running = true;
      renderControls();
      beginCycle();
    }

    function stop() {
      clearTimeout(timer);
      wildQueue = [];
      wildToken++;
      if (phase === 'intro') voice.stop();
      running = false;
      phase = 'idle';
      hideAnim();
      renderControls();
    }

    function dueTwist() {
      return S.twists.find((t) => !t.done && t.gameIndex === S.gameIndex && (t.when === 'start' || S.called.length >= t.triggerAt));
    }

    function beginCycle() {
      const t = dueTwist();
      if (t) {
        stop();
        showTwist(t);
        return;
      }
      if (!remaining().length) {
        stop();
        toast('That’s every ball in play.');
        return;
      }
      phase = 'anim';
      showAnim();
      renderControls();
      timer = setTimeout(draw, ANIM_MS);
    }

    function draw() {
      hideAnim();
      const pool = remaining();
      const num = pool[randInt(0, pool.length - 1)];
      S.called.push(num);
      persist();
      renderBall(true);
      renderBoard();
      voice.play(ballKey(num));
      phase = 'show';
      drawAt = performance.now();
      nextAt = drawAt + Math.max(1000, S.interval * 1000 - ANIM_MS);
      timer = setTimeout(beginCycle, nextAt - drawAt);
      tick();
    }

    // --- WILD: call every remaining ball ending in a chosen digit, 5 seconds apart, then stop
    async function wild() {
      if (running || S.ended || locked || twistOpen) return;
      const left = remaining();
      const digit = await pickDigit(left);
      if (digit == null || running) return;
      voice.unlock();
      wildDigit = digit;
      wildQueue = left.filter((x) => x % 10 === digit);
      running = true;
      const token = ++wildToken;
      phase = 'intro';
      renderControls();
      await voice.play(`Wild${digit}`); // resolves at once if there is no pack, no clip, or voice is off
      if (token !== wildToken) return; // STOP was tapped during the announcement
      callWild();
    }

    function callWild() {
      const num = wildQueue.shift();
      S.called.push(num);
      persist();
      renderBall(true);
      renderBoard();
      voice.play(ballKey(num));
      if (!wildQueue.length) {
        stop(); // back to stopped mode so players can catch up; GO resumes normal calling
        return;
      }
      phase = 'wild';
      drawAt = performance.now();
      nextAt = drawAt + WILD_PAUSE_MS;
      timer = setTimeout(callWild, WILD_PAUSE_MS);
      renderControls();
    }

    // --- draw animation overlay
    let animEl = null;
    function showAnim() {
      if (animEl) return;
      const canvas = h('canvas', { class: 'anim-canvas' });
      animEl = h(
        'div',
        { class: 'anim-overlay' },
        canvas,
        h('div', { class: 'anim-caption' }, 'Drawing the next ball…'),
        h('button', { class: 'btn stop anim-stop', onclick: () => stop() }, 'STOP'),
      );
      document.body.append(animEl);
      stopAnim = startBallAnimation(canvas);
    }
    function hideAnim() {
      stopAnim?.();
      stopAnim = null;
      animEl?.remove();
      animEl = null;
    }
    onCleanup(() => {
      clearTimeout(timer);
      hideAnim();
      voice.stop();
    });

    // --- claims
    function bingo() {
      if (S.ended) return;
      stop();
      S.ended = true;
      carryOverTwists();
      persist();
      voice.play('Bingo');
      renderControls();
      showEnd();
    }

    async function falseBingo() {
      if (locked || S.ended) return;
      locked = true;
      renderControls();
      toast('False bingo — resume play with GO');
      await voice.play('FalseBingo');
      locked = false;
      renderControls();
    }

    /** If a twist for this game never fired, move it to a later game so it still happens once. */
    function carryOverTwists() {
      const last = S.evening.games.length - 1;
      for (const t of S.twists) {
        if (t.gameIndex === S.gameIndex && !t.done && S.gameIndex < last) {
          t.gameIndex = randInt(S.gameIndex + 1, last);
          t.triggerAt = null;
        }
      }
    }

    function showEnd() {
      const isLast = S.gameIndex + 1 >= S.evening.games.length;
      const overlay = h(
        'div',
        { class: 'end-overlay' },
        h('div', { class: 'end-box' },
          h('div', { class: 'end-title' }, 'BINGO!'),
          h('p', {}, `Game ${n} complete · ${S.called.length} balls called`),
          h(
            'button',
            {
              class: 'btn primary huge',
              onclick: () => {
                overlay.remove();
                advanceGame();
              },
            },
            isLast ? 'Finish evening' : `Next: Game ${n + 1}`,
          ),
          h(
            'button',
            {
              class: 'btn ghost',
              onclick: () => {
                overlay.remove();
                S.ended = false;
                persist();
                renderControls();
              },
            },
            'Oops — keep playing this game',
          ),
        ),
      );
      el.append(overlay);
    }

    // --- secret twists
    function showTwist(t) {
      twistOpen = true;
      S.pendingTwist = t.id;
      persist();
      renderControls();
      const overlay = h(
        'div',
        { class: 'twist-overlay' },
        h('div', { class: 'twist-eyebrow' }, '🤫 SECRET TWIST 🤫'),
        h('div', { class: 'twist-text' }, t.text),
        h(
          'button',
          {
            class: 'btn primary huge',
            onclick: () => {
              t.done = true;
              S.pendingTwist = null;
              twistOpen = false;
              persist();
              overlay.remove();
              renderControls();
              const more = dueTwist();
              if (more) showTwist(more);
              else toast('Press GO when everyone is ready');
            },
          },
          'Continue',
        ),
      );
      document.body.append(overlay);
      onCleanup(() => overlay.remove());
    }

    // --- menu
    async function menu() {
      const choice = await dialog({
        title: `Game ${n} menu`,
        stacked: true,
        buttons: [
          { label: S.muted ? '🔇 Voice is off — turn on' : '🔊 Voice is on — turn off', value: 'mute' },
          { label: '↺ Restart this game', value: 'restart' },
          { label: '⏭ Skip to next game', value: 'skip' },
          { label: '⌂ Exit to home (progress is saved)', value: 'home' },
          { label: '✕ End evening and discard progress', value: 'end', kind: 'danger' },
          { label: 'Close', value: undefined, kind: 'primary' },
        ],
      });
      if (!choice) return;
      if (choice === 'mute') {
        S.muted = !S.muted;
        voice.muted = S.muted;
        if (S.muted) voice.stop();
        persist();
        toast(S.muted ? 'Voice off' : 'Voice on');
      } else if (choice === 'restart') {
        if (await confirmDialog('Restart game?', 'All balls called so far in this game will be cleared.', 'Restart', true)) {
          stop();
          S.called = [];
          S.ended = false;
          persist();
          renderBall();
          renderBoard();
          renderControls();
        }
      } else if (choice === 'skip') {
        if (await confirmDialog('Skip this game?', 'Move on to the next game without a winner.', 'Skip', true)) {
          stop();
          carryOverTwists();
          advanceGame();
        }
      } else if (choice === 'home') {
        stop();
        onHome();
      } else if (choice === 'end') {
        if (await confirmDialog('End the evening?', 'Progress will be deleted. This cannot be undone.', 'End evening', true)) {
          stop();
          clearState();
          S = null;
          lobby();
        }
      }
    }

    // --- keep the screen awake while playing
    let wake = null;
    const lockScreen = async () => {
      try {
        wake = (await navigator.wakeLock?.request('screen')) || null;
      } catch {
        wake = null;
      }
    };
    const onVis = () => document.visibilityState === 'visible' && lockScreen();
    document.addEventListener('visibilitychange', onVis);
    lockScreen();
    onCleanup(() => {
      document.removeEventListener('visibilitychange', onVis);
      wake?.release?.().catch(() => {});
    });

    // --- initial paint
    renderBall(false);
    renderBoard();
    renderControls();
    if (S.ended) showEnd();
    else {
      const pending = S.twists.find((t) => t.id === S.pendingTwist && !t.done);
      const start = pending || (S.called.length === 0 ? S.twists.find((t) => !t.done && t.gameIndex === S.gameIndex && t.when === 'start') : null);
      if (start) showTwist(start);
    }
  }

  // The between-games screen has a lighter menu.
  async function betweenMenu() {
    const choice = await dialog({
      title: 'Menu',
      stacked: true,
      buttons: [
        { label: '⏭ Skip this game', value: 'skip' },
        { label: '⌂ Exit to home (progress is saved)', value: 'home' },
        { label: '✕ End evening and discard progress', value: 'end', kind: 'danger' },
        { label: 'Close', value: undefined, kind: 'primary' },
      ],
    });
    if (choice === 'skip') {
      if (await confirmDialog('Skip this game?', 'Move on to the next game.', 'Skip', true)) advanceGame();
    } else if (choice === 'home') onHome();
    else if (choice === 'end' && (await confirmDialog('End the evening?', 'Progress will be deleted. This cannot be undone.', 'End evening', true))) {
      clearState();
      S = null;
      lobby();
    }
  }

  // ------------------------------------------------------------ resume

  async function resume() {
    if (S.phase === 'between') return between();
    // phase === 'game': reload this game's voice pack, then restore the screen
    const g = game();
    const pack = packOf(g);
    voice.unlock();
    const veil = h('div', { class: 'veil' }, h('div', { class: 'spinner' }), h('p', {}, 'Restoring your game…'));
    document.body.append(veil);
    if (pack) await voice.load(pack, [...keysFor(g), ...WILD_KEYS]);
    else await voice.load(null, []);
    veil.remove();
    gameScreen();
  }

  if (S) resume();
  else lobby();

  return {
    destroy() {
      runCleanups();
    },
  };
}
