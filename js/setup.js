// SETUP mode: build an evening — games, patterns, out-of-play columns, voice packs, secret twists.

import { h, dialog, confirmDialog, toast, } from './ui.js';
import { LETTERS, activeEvening, emptyCells, newEvening, newGame, saveDb, uid } from './store.js';
import { PRESETS, renderCard, thumb } from './patterns.js';
import { ALL_KEYS, REQUIRED_KEYS, cachePacksOffline, cacheStatus, clearVoiceCache } from './audio.js';

const MAX_GAMES = 30;
const hasMarks = (g) => g.patterns.some((p) => p.some(Boolean));

/** Make imported/loaded data safe to use. */
function sanitizeEvening(raw) {
  const ev = newEvening(String(raw?.name || 'Imported Evening').slice(0, 80), 0);
  const games = Array.isArray(raw?.games) ? raw.games.slice(0, MAX_GAMES) : [];
  ev.games = games.map((g) => {
    const out = newGame();
    out.name = String(g?.name || '').slice(0, 80);
    out.kind = g?.kind === 'example' ? 'example' : 'shown';
    const pats = (Array.isArray(g?.patterns) ? g.patterns : []).filter((p) => Array.isArray(p) && p.length === 25);
    out.patterns = pats.length ? pats.map((p) => p.map((v) => (v ? 1 : 0))) : [emptyCells()];
    out.voice = typeof g?.voice === 'string' ? g.voice : '';
    out.outCols = LETTERS.map((_, i) => !!g?.outCols?.[i]);
    return out;
  });
  if (!ev.games.length) ev.games.push(newGame());
  ev.twists = (Array.isArray(raw?.twists) ? raw.twists : [])
    .filter((t) => t && String(t.text || '').trim())
    .map((t) => ({ id: uid(), text: String(t.text).slice(0, 300), when: t.when === 'start' ? 'start' : 'random' }));
  return ev;
}

const stepper = (value, onChange, { min = 1, max = 99, suffix = '' } = {}) =>
  h(
    'div',
    { class: 'stepper' },
    h('button', { class: 'btn small', 'aria-label': 'Fewer', disabled: value <= min, onclick: () => onChange(value - 1) }, '−'),
    h('span', { class: 'stepper-val' }, value + suffix),
    h('button', { class: 'btn small', 'aria-label': 'More', disabled: value >= max, onclick: () => onChange(value + 1) }, '+'),
  );

export function mountSetup(root, { db, getPacks, reloadPacks, onHome }) {
  let tab = 'games';
  let gi = 0; // selected game
  let vi = 0; // selected example variant
  const ev = () => activeEvening(db);
  const save = () => {
    if (!saveDb(db)) toast('⚠ Could not save — browser storage is full or blocked.');
  };

  function render() {
    const tabs = [
      ['games', 'Games'],
      ['twists', 'Secret Twists'],
      ['evening', 'Evening & Data'],
    ];
    root.replaceChildren(
      h(
        'header',
        { class: 'topbar' },
        h('button', { class: 'btn ghost', onclick: onHome }, '← Home'),
        h('h1', {}, 'Setup'),
        h(
          'label',
          { class: 'evening-pick' },
          h('span', {}, 'Evening'),
          h(
            'select',
            {
              id: 'eveningSelect',
              onchange: (e) => {
                db.activeId = e.target.value;
                gi = vi = 0;
                save();
                render();
              },
            },
            db.evenings.map((e) => h('option', { value: e.id, selected: e.id === db.activeId }, e.name || 'Untitled')),
          ),
        ),
        h(
          'nav',
          { class: 'tabs' },
          tabs.map(([id, label]) =>
            h(
              'button',
              {
                class: 'tab' + (tab === id ? ' sel' : ''),
                onclick: () => {
                  tab = id;
                  render();
                },
              },
              label,
            ),
          ),
        ),
        (cacheBtn = h('button', { class: 'btn small cache-btn', onclick: cacheEveningVoices }, '⬇ Cache voices')),
      ),
      h('main', { class: 'setup-main' }, tab === 'games' ? gamesTab() : tab === 'twists' ? twistsTab() : eveningTab()),
    );
    refreshCacheUi();
  }

  // ---------------------------------------------------------------- offline voice cache

  let cacheBtn = null;
  let caching = false;

  /** Voice packs this evening's games use (found in packs.json) and ids that are not listed. */
  function usedPacks() {
    const ids = [...new Set(ev().games.map((g) => g.voice).filter(Boolean))];
    const known = getPacks();
    return { found: ids.map((id) => known.find((p) => p.id === id)).filter(Boolean), unknown: ids.filter((id) => !known.some((p) => p.id === id)) };
  }

  const isComplete = (st) => st.required >= REQUIRED_KEYS.length;

  /** Repaint the top-bar button and (if open) the status list on the Evening & Data tab. */
  async function refreshCacheUi() {
    const { found, unknown } = usedPacks();
    const statuses = await Promise.all(found.map(cacheStatus));
    const allCached = found.length > 0 && statuses.every(isComplete);

    if (cacheBtn?.isConnected) {
      cacheBtn.disabled = caching || !found.length || !('caches' in window);
      cacheBtn.title = found.length ? '' : 'Assign a voice pack to at least one game first';
      if (!caching) cacheBtn.textContent = allCached ? '✓ Voices cached' : '⬇ Cache voices';
    }

    const list = document.querySelector('.cache-list');
    if (list) {
      const lines = found.map((p, i) => {
        const st = statuses[i];
        const name = p.name || p.id;
        const wild = st.optional ? ` + ${st.optional} wild announcements` : '';
        if (isComplete(st)) return h('li', { class: 'ok' }, `✓ ${name}: ready for offline play (${st.required} clips${wild})`);
        if (st.required) return h('li', { class: 'warn' }, `⚠ ${name}: only ${st.required} of ${REQUIRED_KEYS.length} clips cached`);
        return h('li', {}, `⬇ ${name}: not cached yet`);
      });
      unknown.forEach((id) => lines.push(h('li', { class: 'warn' }, `⚠ Voice pack “${id}” is used by a game but is not in the pack list`)));
      const live = ev().games.map((g, i) => (g.voice ? 0 : i + 1)).filter(Boolean);
      if (live.length) lines.push(h('li', {}, `Games without a voice pack (called live): ${live.join(', ')}`));
      if (!found.length) lines.unshift(h('li', {}, 'No games have a voice pack assigned yet.'));
      list.replaceChildren(...lines);
    }
    document.querySelectorAll('.cache-action').forEach((b) => (b.disabled = caching || !found.length || !('caches' in window)));
  }

  /** Download the clips of every pack this evening uses, so the game works with no internet. */
  async function cacheEveningVoices() {
    const { found } = usedPacks();
    if (caching || !found.length) return;
    caching = true;
    const status = document.querySelector('.cache-progress');
    const report = (d, t) => {
      const msg = `Caching ${d}/${t}…`;
      if (cacheBtn) cacheBtn.textContent = msg;
      if (status) status.textContent = msg;
    };
    refreshCacheUi();
    report(0, found.length * ALL_KEYS.length);
    try {
      await cachePacksOffline(found, report);
    } finally {
      caching = false;
    }
    const statuses = await Promise.all(found.map(cacheStatus));
    const bad = found.filter((_, i) => !isComplete(statuses[i]));
    if (status) status.textContent = '';
    await refreshCacheUi();
    toast(
      bad.length
        ? `⚠ Some clips couldn’t be downloaded for ${bad.map((p) => p.name || p.id).join(', ')} — are you online? Is the pack complete?`
        : `✓ Cached ${found.map((p) => p.name || p.id).join(' + ')}. Those voices now work offline.`,
    );
  }

  // ---------------------------------------------------------------- Games tab

  function gamesTab() {
    const listEl = h('aside', { class: 'game-list' });
    const editorEl = h('section', { class: 'game-editor' });

    async function setGameCount(n) {
      const e = ev();
      n = Math.max(1, Math.min(MAX_GAMES, n));
      if (n < e.games.length) {
        const doomed = e.games.slice(n);
        if (doomed.some(hasMarks) || doomed.some((g) => g.name)) {
          const ok = await confirmDialog(
            'Remove games?',
            `This removes game${doomed.length > 1 ? 's' : ''} ${n + 1}${doomed.length > 1 ? '–' + e.games.length : ''} and their patterns.`,
            'Remove',
            true,
          );
          if (!ok) return;
        }
        e.games.length = n;
      } else {
        while (e.games.length < n) e.games.push(newGame());
      }
      gi = Math.min(gi, e.games.length - 1);
      save();
      paintList();
      paintEditor();
    }

    function paintList() {
      const e = ev();
      const scroll = listEl.querySelector('.game-items')?.scrollTop || 0;
      listEl.replaceChildren(
        h('div', { class: 'list-head' }, h('span', {}, 'Number of games'), stepper(e.games.length, setGameCount, { max: MAX_GAMES })),
        h(
          'div',
          { class: 'game-items' },
          e.games.map((g, i) =>
            h(
              'button',
              {
                class: 'game-item' + (i === gi ? ' sel' : ''),
                onclick: () => {
                  gi = i;
                  vi = 0;
                  paintList();
                  paintEditor();
                },
              },
              h('span', { class: 'num' }, i + 1),
              thumb(g),
              h(
                'span',
                { class: 'gname' },
                g.name || h('em', {}, 'Untitled'),
                h(
                  'small',
                  {},
                  [
                    g.kind === 'example' ? `Example${g.patterns.length > 1 ? ' ×' + g.patterns.length : ''}` : 'As shown',
                    g.outCols.some(Boolean) ? 'out: ' + LETTERS.filter((_, c) => g.outCols[c]).join(' ') : '',
                    g.voice ? '🔊 ' + g.voice : '',
                  ]
                    .filter(Boolean)
                    .join(' · '),
                ),
              ),
            ),
          ),
        ),
      );
      listEl.querySelector('.game-items').scrollTop = scroll;
    }

    function paintEditor() {
      const e = ev();
      const g = e.games[gi];
      const isExample = g.kind === 'example';
      if (!isExample || vi >= g.patterns.length) vi = 0;

      const outText = g.outCols.some(Boolean)
        ? `Out of play: ${LETTERS.filter((_, c) => g.outCols[c]).join(', ')}`
        : 'All columns in play';

      const card = renderCard(g.patterns[vi], {
        out: g.outCols,
        onCell: (i) => {
          g.patterns[vi][i] = g.patterns[vi][i] ? 0 : 1;
          save();
          card.update(g.patterns[vi], g.outCols);
          paintList();
        },
        onLetter: (c) => {
          g.outCols[c] = !g.outCols[c];
          save();
          card.update(g.patterns[vi], g.outCols);
          outLabel.textContent = g.outCols.some(Boolean)
            ? `Out of play: ${LETTERS.filter((_, k) => g.outCols[k]).join(', ')}`
            : 'All columns in play';
          paintList();
        },
        label: 'Pattern editor',
      });
      const outLabel = h('div', { class: 'out-label' }, outText);

      const setCells = (fn) => {
        g.patterns[vi] = g.patterns[vi].map(fn);
        save();
        card.update(g.patterns[vi], g.outCols);
        paintList();
      };

      async function applyPreset(name) {
        const p = PRESETS.find((x) => x.name === name);
        if (!p) return;
        if (hasMarks(g) && !(await confirmDialog('Replace pattern?', `Replace this game's pattern with “${p.name}”?`, 'Replace'))) {
          paintEditor();
          return;
        }
        g.patterns = p.patterns.map((c) => [...c]);
        g.kind = p.kind || 'shown';
        if (!g.name || PRESETS.some((x) => x.name === g.name)) g.name = p.name;
        vi = 0;
        save();
        paintList();
        paintEditor();
      }

      const packs = getPacks();
      const voiceOpts = [
        h('option', { value: '', selected: !g.voice }, 'No voice pack (live caller)'),
        ...packs.map((p) => h('option', { value: p.id, selected: g.voice === p.id }, p.name || p.id)),
      ];
      if (g.voice && !packs.some((p) => p.id === g.voice))
        voiceOpts.push(h('option', { value: g.voice, selected: true }, `${g.voice} (not found)`));

      editorEl.replaceChildren(
        h('div', { class: 'editor-card' }, h('div', { class: 'card-frame' }, card), outLabel, h('p', { class: 'hint' }, 'Tap squares to mark the pattern. Tap a column letter to take that column out of play.')),
        h(
          'div',
          { class: 'editor-fields' },
          h('h2', {}, `Game ${gi + 1}`),
          h(
            'label',
            { class: 'field' },
            h('span', {}, 'Pattern name'),
            h('input', {
              type: 'text',
              maxlength: 60,
              placeholder: 'e.g. Four Corners',
              value: g.name,
              oninput: (ev_) => {
                g.name = ev_.target.value;
                save();
                paintList();
              },
            }),
          ),
          h(
            'div',
            { class: 'field' },
            h('span', {}, 'Shown to players as'),
            h(
              'div',
              { class: 'seg' },
              [
                ['shown', 'As shown'],
                ['example', 'Example'],
              ].map(([k, label]) =>
                h(
                  'button',
                  {
                    class: 'seg-btn' + (g.kind === k ? ' sel' : ''),
                    onclick: () => {
                      g.kind = k;
                      vi = 0;
                      save();
                      paintList();
                      paintEditor();
                    },
                  },
                  label,
                ),
              ),
            ),
            h(
              'p',
              { class: 'hint' },
              isExample
                ? 'Players are told the pattern is just an example — any similar shape counts (e.g. any straight line).'
                : 'Players must match the pattern exactly as shown.',
            ),
          ),
          isExample &&
            h(
              'div',
              { class: 'field' },
              h('span', {}, 'Example patterns (shown in rotation during play)'),
              h(
                'div',
                { class: 'chips' },
                g.patterns.map((_, i) =>
                  h(
                    'button',
                    {
                      class: 'chip' + (i === vi ? ' sel' : ''),
                      onclick: () => {
                        vi = i;
                        paintEditor();
                      },
                    },
                    `Example ${i + 1}`,
                  ),
                ),
                g.patterns.length < 8 &&
                  h(
                    'button',
                    {
                      class: 'chip add',
                      onclick: () => {
                        g.patterns.push(emptyCells());
                        vi = g.patterns.length - 1;
                        save();
                        paintEditor();
                      },
                    },
                    '+ Add example',
                  ),
                g.patterns.length > 1 &&
                  h(
                    'button',
                    {
                      class: 'chip del',
                      onclick: () => {
                        g.patterns.splice(vi, 1);
                        vi = Math.max(0, vi - 1);
                        save();
                        paintList();
                        paintEditor();
                      },
                    },
                    `Remove example ${vi + 1}`,
                  ),
              ),
            ),
          h(
            'div',
            { class: 'field' },
            h('span', {}, 'Card tools'),
            h(
              'div',
              { class: 'chips' },
              h('button', { class: 'btn small', onclick: () => setCells(() => 0) }, 'Clear'),
              h('button', { class: 'btn small', onclick: () => setCells(() => 1) }, 'Fill all'),
              h('button', { class: 'btn small', onclick: () => setCells((v) => (v ? 0 : 1)) }, 'Invert'),
              h(
                'select',
                { class: 'preset-pick', 'aria-label': 'Start from a preset', onchange: (e) => applyPreset(e.target.value) },
                h('option', { value: '' }, 'Start from a preset…'),
                PRESETS.map((p) => h('option', { value: p.name }, p.name)),
              ),
            ),
          ),
          h(
            'label',
            { class: 'field' },
            h('span', {}, 'Voice pack for this game'),
            h(
              'select',
              {
                onchange: (e) => {
                  g.voice = e.target.value;
                  save();
                  paintList();
                  refreshCacheUi();
                },
              },
              voiceOpts,
            ),
          ),
          h(
            'div',
            { class: 'field row' },
            h('button', { class: 'btn small', disabled: gi === 0, onclick: () => moveGame(-1) }, '↑ Move up'),
            h('button', { class: 'btn small', disabled: gi === e.games.length - 1, onclick: () => moveGame(1) }, '↓ Move down'),
            h('button', { class: 'btn small', disabled: e.games.length >= MAX_GAMES, onclick: duplicateGame }, 'Duplicate'),
            h('button', { class: 'btn small danger', disabled: e.games.length <= 1, onclick: deleteGame }, 'Delete game'),
          ),
        ),
      );
    }

    function moveGame(d) {
      const e = ev();
      const j = gi + d;
      if (j < 0 || j >= e.games.length) return;
      [e.games[gi], e.games[j]] = [e.games[j], e.games[gi]];
      gi = j;
      save();
      paintList();
      paintEditor();
    }

    function duplicateGame() {
      const e = ev();
      const copy = JSON.parse(JSON.stringify(e.games[gi]));
      copy.id = uid();
      e.games.splice(gi + 1, 0, copy);
      gi++;
      save();
      paintList();
      paintEditor();
    }

    async function deleteGame() {
      const e = ev();
      const g = e.games[gi];
      if (hasMarks(g) && !(await confirmDialog('Delete game?', `Delete game ${gi + 1}${g.name ? ` (${g.name})` : ''}?`, 'Delete', true))) return;
      e.games.splice(gi, 1);
      gi = Math.min(gi, e.games.length - 1);
      save();
      paintList();
      paintEditor();
    }

    paintList();
    paintEditor();
    return h('div', { class: 'games-tab' }, listEl, editorEl);
  }

  // ---------------------------------------------------------------- Twists tab

  function twistsTab() {
    const e = ev();
    const wrap = h('div', { class: 'twists-tab' });
    function paint() {
      wrap.replaceChildren(
        h(
          'div',
          { class: 'twists-intro' },
          h('h2', {}, 'Secret twists'),
          h(
            'p',
            {},
            'Each twist happens exactly once during the evening, on a randomly chosen game (picked when the evening starts). When it fires, a full-screen message takes over and calling stops until you tap Go.',
          ),
          e.twists.length > e.games.length &&
            h('p', { class: 'warn' }, `You have more twists (${e.twists.length}) than games (${e.games.length}); some games will get two.`),
        ),
        h(
          'div',
          { class: 'twist-list' },
          e.twists.map((t, i) =>
            h(
              'div',
              { class: 'twist' },
              h('div', { class: 'twist-n' }, '🤫 ' + (i + 1)),
              h('textarea', {
                rows: 2,
                maxlength: 300,
                placeholder: 'e.g. Swap cards with another player!',
                'aria-label': `Twist ${i + 1} message`,
                oninput: (ev_) => {
                  t.text = ev_.target.value;
                  save();
                },
                value: t.text,
              }),
              h(
                'select',
                {
                  'aria-label': 'When it happens',
                  onchange: (ev_) => {
                    t.when = ev_.target.value;
                    save();
                  },
                },
                h('option', { value: 'start', selected: t.when === 'start' }, 'Start of the game'),
                h('option', { value: 'random', selected: t.when !== 'start' }, 'Random point in the game'),
              ),
              h(
                'button',
                {
                  class: 'btn small danger',
                  onclick: () => {
                    e.twists.splice(i, 1);
                    save();
                    paint();
                  },
                },
                'Delete',
              ),
            ),
          ),
          !e.twists.length && h('p', { class: 'hint' }, 'No twists yet.'),
        ),
        h(
          'button',
          {
            class: 'btn primary',
            onclick: () => {
              e.twists.push({ id: uid(), text: '', when: 'random' });
              save();
              paint();
              wrap.querySelector('.twist:last-child textarea')?.focus();
            },
          },
          '+ Add secret twist',
        ),
      );
    }
    paint();
    return wrap;
  }

  // ---------------------------------------------------------------- Evening & data tab

  function eveningTab() {
    const e = ev();
    const wrap = h('div', { class: 'evening-tab' });
    const packs = getPacks();

    async function askNew() {
      const nameIn = h('input', { type: 'text', value: 'New Evening', maxlength: 80 });
      const countIn = h('input', { type: 'number', min: 1, max: MAX_GAMES, value: 10 });
      const go = await dialog({
        title: 'New evening',
        body: h('div', { class: 'form' }, h('label', { class: 'field' }, h('span', {}, 'Name'), nameIn), h('label', { class: 'field' }, h('span', {}, 'Number of games'), countIn)),
        buttons: [
          { label: 'Cancel', value: false },
          { label: 'Create', value: true, kind: 'primary' },
        ],
      });
      if (!go) return;
      const n = Math.max(1, Math.min(MAX_GAMES, parseInt(countIn.value, 10) || 10));
      const ne = newEvening(nameIn.value.trim() || 'New Evening', n);
      db.evenings.push(ne);
      db.activeId = ne.id;
      gi = vi = 0;
      tab = 'games';
      save();
      render();
    }

    function duplicate() {
      const copy = sanitizeEvening(e);
      copy.name = `${e.name} (copy)`;
      db.evenings.push(copy);
      db.activeId = copy.id;
      gi = vi = 0;
      save();
      render();
      toast('Evening duplicated');
    }

    async function remove() {
      if (!(await confirmDialog('Delete evening?', `Delete “${e.name}” and all its games and twists? This cannot be undone.`, 'Delete', true))) return;
      db.evenings = db.evenings.filter((x) => x.id !== e.id);
      db.activeId = db.evenings[0].id;
      gi = vi = 0;
      save();
      render();
    }

    function exportJson() {
      const blob = new Blob([JSON.stringify({ bingoEvening: 1, ...e }, null, 2)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `${(e.name || 'evening').replace(/[^\w-]+/g, '_')}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    async function importJson(file) {
      try {
        const raw = JSON.parse(await file.text());
        if (!raw || !Array.isArray(raw.games)) throw new Error('not an evening file');
        const imported = sanitizeEvening(raw);
        db.evenings.push(imported);
        db.activeId = imported.id;
        gi = vi = 0;
        save();
        render();
        toast(`Imported “${imported.name}”`);
      } catch {
        toast('That file is not a valid evening export.');
      }
    }

    const defaultVoice = h(
      'select',
      { id: 'defaultVoice' },
      h('option', { value: '' }, 'No voice pack (live caller)'),
      packs.map((p) => h('option', { value: p.id }, p.name || p.id)),
    );

    wrap.append(
      h(
        'section',
        { class: 'panel' },
        h('h2', {}, 'This evening'),
        h(
          'label',
          { class: 'field' },
          h('span', {}, 'Evening name'),
          h('input', {
            type: 'text',
            maxlength: 80,
            value: e.name,
            oninput: (x) => {
              e.name = x.target.value;
              save();
              const opt = document.querySelector(`#eveningSelect option[value="${e.id}"]`);
              if (opt) opt.textContent = e.name || 'Untitled';
            },
          }),
        ),
        h(
          'div',
          { class: 'field' },
          h('span', {}, 'Set the same voice pack on every game'),
          h(
            'div',
            { class: 'row' },
            defaultVoice,
            h(
              'button',
              {
                class: 'btn small',
                onclick: () => {
                  e.games.forEach((g) => (g.voice = defaultVoice.value));
                  save();
                  toast('Voice pack applied to all games');
                },
              },
              'Apply to all games',
            ),
          ),
        ),
        h(
          'div',
          { class: 'row wrap' },
          h('button', { class: 'btn', onclick: askNew }, '+ New evening'),
          h('button', { class: 'btn', onclick: duplicate }, 'Duplicate'),
          h('button', { class: 'btn', onclick: exportJson }, 'Export (.json)'),
          h(
            'label',
            { class: 'btn file-btn' },
            'Import (.json)',
            h('input', {
              type: 'file',
              accept: 'application/json,.json',
              hidden: true,
              onchange: (x) => {
                if (x.target.files[0]) importJson(x.target.files[0]);
                x.target.value = '';
              },
            }),
          ),
          h('button', { class: 'btn danger', disabled: db.evenings.length <= 1, onclick: remove }, 'Delete evening'),
        ),
      ),
      h(
        'section',
        { class: 'panel' },
        h('h2', {}, 'Voices for offline play'),
        h('p', {}, 'Cache this evening’s voice packs on this device while you have internet, so the game works anywhere. Only the packs assigned to this evening’s games are downloaded.'),
        h('ul', { class: 'cache-list' }),
        h(
          'div',
          { class: 'row wrap' },
          h('button', { class: 'btn primary cache-action', onclick: cacheEveningVoices }, '⬇ Cache voices for this evening'),
          h(
            'button',
            {
              class: 'btn cache-action',
              onclick: async () => {
                if (!(await confirmDialog('Remove cached voices?', 'Voice clips stored on this device will be deleted. You can cache them again while online.', 'Remove', true))) return;
                await clearVoiceCache();
                await refreshCacheUi();
                toast('Cached voices removed');
              },
            },
            'Remove all cached voices',
          ),
          h(
            'button',
            {
              class: 'btn',
              onclick: async () => {
                await reloadPacks();
                render();
                toast('Voice pack list refreshed');
              },
            },
            'Refresh pack list',
          ),
        ),
        h('p', { class: 'cache-progress hint' }),
        h('p', { class: 'hint' }, packs.length ? `Packs on the server: ${packs.map((p) => p.name || p.id).join(', ')}. Run “Cache voices” again after any audio files change.` : 'No voice packs found. Add some under voicepacks/ — see voicepacks/README.md.'),
      ),
    );
    return wrap;
  }

  render();
}
