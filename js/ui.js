// Small DOM helpers shared by Setup and Play.

/** Hyperscript-style element builder: h('button', { class: 'btn', onclick }, 'Text', child…) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/**
 * Modal dialog. Resolves with the `value` of the pressed button (or undefined if dismissed).
 *   buttons: [{ label, value, kind: 'primary' | 'danger' | '' }]
 */
export function dialog({ title, body, buttons = [{ label: 'OK', value: true, kind: 'primary' }], dismissible = true, stacked = false }) {
  return new Promise((resolve) => {
    const close = (value) => {
      backdrop.remove();
      resolve(value);
    };
    const backdrop = h(
      'div',
      { class: 'modal-backdrop', onclick: (e) => dismissible && e.target === backdrop && close(undefined) },
      h(
        'div',
        { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        title && h('h2', {}, title),
        body && (typeof body === 'string' ? h('p', {}, body) : body),
        h(
          'div',
          { class: 'modal-actions' + (stacked ? ' stacked' : '') },
          buttons.map((b) => h('button', { class: `btn ${b.kind || ''}`, onclick: () => close(b.value) }, b.label)),
        ),
      ),
    );
    document.body.append(backdrop);
  });
}

export const confirmDialog = (title, body, confirmLabel = 'OK', danger = false) =>
  dialog({
    title,
    body,
    buttons: [
      { label: 'Cancel', value: false },
      { label: confirmLabel, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  });

let toastTimer;
export function toast(message) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3200);
}

export const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
