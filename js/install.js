// Install helpers: detect whether the app is already installed, work out which device/browser this
// is, and show short "how to install" instructions when the browser can't pop up its own install prompt.

import { h, dialog } from './ui.js';

/** True when running as an installed app (home-screen icon / app window) rather than in a browser tab. */
export function isInstalled() {
  return (
    ['standalone', 'fullscreen', 'minimal-ui'].some((m) => window.matchMedia?.(`(display-mode: ${m})`).matches) ||
    navigator.standalone === true
  );
}

/** Best-effort guess from the user agent: { os, browser }. */
export function detectPlatform(nav = navigator) {
  const ua = nav.userAgent || '';
  const touchMac = /Macintosh/.test(ua) && nav.maxTouchPoints > 1; // iPadOS pretends to be a Mac
  let os = 'other';
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) os = 'ios';
  else if (/Android/.test(ua)) os = 'android';
  else if (/CrOS/.test(ua)) os = 'chromeos';
  else if (/Windows/.test(ua)) os = 'windows';
  else if (/Macintosh|Mac OS/.test(ua)) os = 'mac';
  else if (/Linux/.test(ua)) os = 'linux';

  let browser = 'other';
  if (/SamsungBrowser/.test(ua)) browser = 'samsung';
  else if (/EdgA|EdgiOS|Edg\//.test(ua)) browser = 'edge';
  else if (/Firefox|FxiOS/.test(ua)) browser = 'firefox';
  else if (/OPR\/|Opera/.test(ua)) browser = 'opera';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'chrome';
  else if (/Safari\//.test(ua)) browser = 'safari';
  return { os, browser };
}

const OS_NAMES = { ios: 'iPhone / iPad', android: 'Android', windows: 'Windows', mac: 'Mac', chromeos: 'Chromebook', linux: 'Linux' };
const BROWSER_NAMES = { chrome: 'Chrome', safari: 'Safari', edge: 'Edge', firefox: 'Firefox', samsung: 'Samsung Internet', opera: 'Opera' };

const IOS = ['Tap the Share button (a square with an arrow pointing up) in the browser toolbar.', 'Scroll down and tap “Add to Home Screen”.', 'Tap “Add”. Open the app from its new icon on your Home Screen.'];
const ANDROID_CHROME = ['Tap the ⋮ menu at the top right of Chrome.', 'Tap “Install app” (or “Add to Home screen”, then “Install”).', 'Confirm. Open the app from its new icon on your home screen.'];
const DESKTOP_CHROMIUM = [
  'Look for the install icon (a screen with a down arrow) at the right end of the address bar and click it.',
  'Or open the browser menu: in Chrome choose “Cast, save and share” → “Install page as app…”; in Edge choose “Apps” → “Install this site as an app”.',
  'Confirm. The app opens in its own window.',
];

/** Instructions for one platform: { label, steps, note? } */
export function instructionsFor({ os, browser }) {
  const where = [OS_NAMES[os], BROWSER_NAMES[browser]].filter(Boolean).join(' · ') || 'your device';

  if (os === 'ios') {
    return {
      label: where,
      steps: IOS,
      note: browser === 'safari' ? '' : 'No Share button? Open this page in Safari and follow the same steps.',
    };
  }
  if (os === 'android') {
    if (browser === 'samsung')
      return { label: where, steps: ['Tap the menu (☰) in Samsung Internet.', 'Tap “Add page to” → “Home screen” (or “Install app” if you see it).', 'Confirm. Open the app from your home screen.'] };
    if (browser === 'firefox') return { label: where, steps: ['Tap the ⋮ menu in Firefox.', 'Tap “Install”.', 'Confirm. Open the app from your home screen.'] };
    if (browser === 'edge') return { label: where, steps: ['Tap the … menu at the bottom of Edge.', 'Tap “Add to phone” (or “Add to Home screen”).', 'Confirm. Open the app from your home screen.'] };
    return {
      label: where,
      steps: ANDROID_CHROME,
      note: browser === 'chrome' ? '' : 'For the smoothest install, open this page in Chrome.',
    };
  }
  if (browser === 'safari' && os === 'mac')
    return { label: where, steps: ['In Safari’s menu bar choose File → “Add to Dock…”.', 'Click “Add”. The app opens in its own window.'], note: 'Needs macOS Sonoma or later.' };
  if (browser === 'firefox')
    return { label: where, steps: [], note: 'Firefox on a computer can’t install web apps. Open this page in Chrome or Edge to install it, or just keep using it in this browser tab.' };
  return { label: where, steps: DESKTOP_CHROMIUM };
}

/** Dialog with instructions for this device, plus a collapsible list for other devices. */
export function showInstallHelp() {
  const mine = instructionsFor(detectPlatform());
  const list = (steps) => h('ol', { class: 'install-steps' }, steps.map((s) => h('li', {}, s)));

  const others = [
    ['Android · Chrome', ANDROID_CHROME],
    ['iPhone / iPad · Safari', IOS],
    ['Windows / Mac / Chromebook · Chrome or Edge', DESKTOP_CHROMIUM],
  ];

  const body = h(
    'div',
    { class: 'install-help' },
    h('p', { class: 'install-device' }, `It looks like you’re on: ${mine.label}`),
    mine.steps.length ? list(mine.steps) : null,
    mine.note ? h('p', { class: 'hint' }, mine.note) : null,
    h('details', {}, h('summary', {}, 'Instructions for other devices'), others.map(([name, steps]) => h('div', { class: 'install-other' }, h('h3', {}, name), list(steps)))),
  );
  return dialog({ title: 'Install Bingo Caller', body, buttons: [{ label: 'Done', value: true, kind: 'primary' }] });
}
