// The "bouncing bingo balls" draw animation, drawn on a canvas inside a glass drum.

import { ballLetter, columnOf } from './patterns.js';

const BALL_COUNT = 28;

/** Start animating on `canvas` (sized by CSS). Returns a function that stops it. */
export function startBallAnimation(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);

  const css = getComputedStyle(document.documentElement);
  const colors = [0, 1, 2, 3, 4].map((i) => css.getPropertyValue(`--c${i}`).trim() || '#888');

  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.4;
  const r = R * 0.135;
  const vMax = R * 1.9;
  const vMin = R * 0.9;

  const balls = Array.from({ length: BALL_COUNT }, () => {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * (R - r);
    const va = Math.random() * Math.PI * 2;
    const sp = vMin + Math.random() * (vMax - vMin);
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: Math.cos(va) * sp, vy: Math.sin(va) * sp, n: 1 + Math.floor(Math.random() * 75) };
  });

  function step(dt) {
    for (const b of balls) {
      // random "air blast" nudges keep things lively
      b.vx += (Math.random() - 0.5) * R * 9 * dt;
      b.vy += (Math.random() - 0.5) * R * 9 * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > vMax || sp < vMin) {
        const k = (sp > vMax ? vMax : vMin) / (sp || 1);
        b.vx *= k;
        b.vy *= k;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const dx = b.x - cx;
      const dy = b.y - cy;
      const d = Math.hypot(dx, dy);
      if (d + r > R) {
        const nx = dx / d;
        const ny = dy / d;
        const dot = b.vx * nx + b.vy * ny;
        if (dot > 0) {
          b.vx -= 2 * dot * nx;
          b.vy -= 2 * dot * ny;
        }
        b.x = cx + nx * (R - r);
        b.y = cy + ny * (R - r);
      }
    }
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i];
        const b = balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < 2 * r) {
          const nx = dx / d;
          const ny = dy / d;
          const push = (2 * r - d) / 2;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            a.vx += rel * nx;
            a.vy += rel * ny;
            b.vx -= rel * nx;
            b.vy -= rel * ny;
          }
        }
      }
    }
  }

  function drawBall(b) {
    const col = colors[columnOf(b.n)];
    const grad = g.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.1, b.x, b.y, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.18, col);
    grad.addColorStop(1, '#00000088');
    g.fillStyle = col;
    g.beginPath();
    g.arc(b.x, b.y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = grad;
    g.globalAlpha = 0.55;
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(b.x, b.y, r * 0.58, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.font = `800 ${r * 0.62}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${ballLetter(b.n)}${b.n}`, b.x, b.y + r * 0.04);
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    const drum = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    drum.addColorStop(0, '#ffffff10');
    drum.addColorStop(1, '#ffffff26');
    g.fillStyle = drum;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = Math.max(4, R * 0.03);
    g.strokeStyle = '#ffffff55';
    g.stroke();
    balls.forEach(drawBall);
  }

  let raf = 0;
  let last = performance.now();
  const frame = (t) => {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
