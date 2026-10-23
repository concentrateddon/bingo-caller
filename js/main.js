// App shell: home screen, mode switching, resume-or-fresh prompt, service worker.

import { LETTERS, activeEvening, clearState, loadDb, loadState, saveDb } from './store.js';
import { Voice, loadPacks } from './audio.js';
import { sampleEvening } from './patterns.js';
import { mountSetup } from './setup.js';
import { mountPlay } from './play.js';
import { confirmDialog, dialog, h, toast } from './ui.js';
import { isInstalled, showInstallHelp } from './install.js';

const app = document.getElementById('app');

// Chrome fires this once, early — listen before anything is awaited so it can't be missed.
let installPrompt = null;
let onHomeScreen = false;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (onHomeScreen) home();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  toast('✓ Installed — open Bingo Caller from your home screen.');
  if (onHomeScreen) home();
});

const voice = new Voice();
let packs = await loadPacks();
let db = loadDb();
if (!db) {
  const ev = sampleEvening(packs.some((p) => p.id === 'demo') ? 'demo' : '');
  db = { activeId: ev.id, evenings: [ev] };
  saveDb(db);
}
navigator.storage?.persist?.().catch(() => {});

let mounted = null; // whatever is currently on screen, so it can be torn down

function show(next) {
  mounted?.destroy?.();
  mounted = next;
  onHomeScreen = false;
}

/** Use the browser's own install prompt when it offers one; otherwise explain how for this device. */
async function install() {
  if (!installPrompt) return showInstallHelp();
  const prompt = installPrompt;
  installPrompt = null; // a prompt can only be used once
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome !== 'accepted') home(); // declined: the button falls back to instructions
}

function home() {
  show(null);
  onHomeScreen = true;
  const saved = loadState();
  app.replaceChildren(
    h(
      'main',
      { class: 'home' },
      h('div', { class: 'logo' }, LETTERS.map((ch, i) => h('span', { class: `lg c${i}` }, ch))),
      h('h1', {}, 'Bingo Caller'),
      h('p', { class: 'lead' }, activeEvening(db).name),
      h(
        'div',
        { class: 'home-buttons' },
        h('button', { class: 'btn huge', onclick: enterSetup }, '⚙  Setup'),
        h('button', { class: 'btn primary huge', onclick: () => enterPlay(false) }, saved ? '▶  Play (resume)' : '▶  Play'),
      ),
      isInstalled()
        ? h('p', { class: 'hint' }, '✓ Running as an installed app')
        : h('button', { class: 'btn ghost install-btn', onclick: install }, '⬇ Install app'),
    ),
  );
}

function enterSetup() {
  app.replaceChildren();
  show(null);
  mountSetup(app, {
    db,
    getPacks: () => packs,
    reloadPacks: async () => (packs = await loadPacks()),
    onHome: home,
  });
}

function startPlay(initialState) {
  app.replaceChildren();
  show(
    mountPlay(app, {
      db,
      getPacks: () => packs,
      voice,
      initialState,
      onHome: home,
    }),
  );
}

async function enterPlay(fromLaunch) {
  const saved = loadState();
  if (!saved) return startPlay(null);

  const g = saved.evening.games[saved.gameIndex];
  const where =
    saved.phase === 'game'
      ? `Game ${saved.gameIndex + 1} of ${saved.evening.games.length}${g?.name ? ` (${g.name})` : ''}, ${saved.called.length} ball${saved.called.length === 1 ? '' : 's'} called`
      : `About to start game ${saved.gameIndex + 1} of ${saved.evening.games.length}`;

  for (;;) {
    const choice = await dialog({
      title: 'Pick up where you left off?',
      body: h('p', {}, `“${saved.evening.name}” — ${where}.`),
      dismissible: false,
      buttons: [
        { label: 'Start fresh', value: 'fresh', kind: 'danger' },
        { label: 'Resume', value: 'resume', kind: 'primary' },
      ],
    });
    if (choice === 'resume') return startPlay(saved);
    if (await confirmDialog('Start fresh?', 'This deletes the saved progress for that evening.', 'Delete and start fresh', true)) {
      clearState();
      return fromLaunch ? home() : startPlay(null);
    }
  }
}

// ---- go
home();
if (loadState()) enterPlay(true);

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker failed', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('App updated — restart it to use the new version.');
  });
}
