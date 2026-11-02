'use strict';
// ===== Procedural art: floor tiles, light masks, sprites =====
const TILE = 96, ROOM = 8;

function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const K = 4294967296;
  const a = hash2(xi, yi) / K, b = hash2(xi + 1, yi) / K, c = hash2(xi, yi + 1) / K, d = hash2(xi + 1, yi + 1) / K;
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function seeded(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
function ellipse(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); }

// ---------- Floor ----------
const Tiles = (() => {
  function plateBase(g, r, tone) {
    g.fillStyle = '#0d1012'; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = tone; g.fillRect(1, 1, TILE - 2, TILE - 2);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.025)';
      g.fillRect(r() * TILE, r() * TILE, 1 + r() * 2, 1 + r() * 2);
    }
    for (let i = 0; i < 3; i++) {
      const x = r() * TILE, y = r() * TILE, rr = 10 + r() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(0,0,0,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, TILE, TILE);
    }
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,.06)';
    g.beginPath(); g.moveTo(1.5, TILE - 2); g.lineTo(1.5, 1.5); g.lineTo(TILE - 2, 1.5); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.55)';
    g.beginPath(); g.moveTo(TILE - 1.5, 2); g.lineTo(TILE - 1.5, TILE - 1.5); g.lineTo(2, TILE - 1.5); g.stroke();
  }
  function rivets(g) {
    for (const [x, y] of [[7, 7], [TILE - 7, 7], [7, TILE - 7], [TILE - 7, TILE - 7]]) {
      g.fillStyle = '#08090a'; circle(g, x, y + 0.6, 2.2);
      g.fillStyle = '#353d43'; circle(g, x, y, 1.8);
    }
  }
  function diamondPlate(g) {
    g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = 2;
    for (let y = 6; y < TILE; y += 10)
      for (let x = 6 + ((y / 10) % 2) * 5; x < TILE; x += 10) {
        g.beginPath(); g.moveTo(x - 2, y + 2); g.lineTo(x + 2, y - 2); g.stroke();
      }
  }
  function grate(g) {
    g.fillStyle = '#08090a'; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = '#1b2024'; g.fillRect(3, 3, TILE - 6, TILE - 6);
    for (let y = 9; y < TILE - 8; y += 7) {
      g.fillStyle = '#050606'; g.fillRect(9, y, TILE - 18, 3);
      g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(9, y + 3, TILE - 18, 1);
    }
    rivets(g);
  }
  function hazard(g, r, vertical) {
    plateBase(g, r, '#1c2125');
    g.save();
    if (vertical) { g.translate(TILE, 0); g.rotate(Math.PI / 2); }
    const y0 = TILE / 2 - 11;
    g.beginPath(); g.rect(0, y0, TILE, 22); g.clip();
    g.fillStyle = 'rgba(16,15,10,.9)'; g.fillRect(0, y0, TILE, 22);
    g.fillStyle = 'rgba(190,150,30,.5)';
    for (let x = -32; x < TILE + 32; x += 16) {
      g.beginPath(); g.moveTo(x, y0 + 22); g.lineTo(x + 8, y0 + 22); g.lineTo(x + 30, y0); g.lineTo(x + 22, y0); g.fill();
    }
    for (let i = 0; i < 45; i++) { g.fillStyle = 'rgba(18,20,22,.75)'; g.fillRect(r() * TILE, y0 + r() * 22, 2 + r() * 6, 1 + r() * 2); }
    g.restore();
  }
  function vent(g, r) {
    plateBase(g, r, '#1a1f22'); rivets(g);
    const c = TILE / 2;
    g.fillStyle = '#060708'; circle(g, c, c, 30);
    g.strokeStyle = '#2a3136'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, 30, 0, TAU); g.stroke();
    g.fillStyle = '#1e2428';
    const off = r() * TAU;
    for (let i = 0; i < 6; i++) {
      g.save(); g.translate(c, c); g.rotate(off + i * TAU / 6);
      g.beginPath(); g.ellipse(14, 0, 13, 4, 0.5, 0, TAU); g.fill(); g.restore();
    }
    g.fillStyle = '#30383e'; circle(g, c, c, 5);
  }
  function hatch(g, r) {
    plateBase(g, r, '#1d2226'); rivets(g);
    g.strokeStyle = '#090b0c'; g.lineWidth = 3; g.strokeRect(16, 16, TILE - 32, TILE - 32);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.strokeRect(18, 18, TILE - 36, TILE - 36);
    g.fillStyle = 'rgba(210,170,40,.35)'; g.font = 'bold 11px monospace';
    g.fillText(['B-07', 'C-12', 'MED', 'SEC-4', 'D-02', 'HAB', 'OPS', 'LAB-3'][Math.floor(r() * 8)], 22, 32);
    g.fillStyle = '#2c3338'; g.fillRect(TILE / 2 - 10, TILE - 30, 20, 5);
  }
  function resin(g, r, cover) {
    if (cover < 1) { plateBase(g, r, '#1a1f22'); rivets(g); }
    else { g.fillStyle = '#090b09'; g.fillRect(0, 0, TILE, TILE); }
    const n = cover < 1 ? 16 : 42;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      let x = r() * TILE, y = r() * TILE;
      if (cover < 1) x *= 0.55;
      g.strokeStyle = r() < 0.5 ? '#121612' : '#1a201b';
      g.lineWidth = 3 + r() * 7;
      g.beginPath(); g.moveTo(x, y);
      g.bezierCurveTo(x + r() * 40 - 20, y + r() * 40 - 20, x + r() * 60 - 30, y + r() * 60 - 30, x + r() * 80 - 40, y + r() * 80 - 40);
      g.stroke();
      g.strokeStyle = 'rgba(130,160,140,.1)'; g.lineWidth = 1; g.stroke();
    }
    for (let i = 0; i < (cover < 1 ? 3 : 10); i++) {
      const x = (cover < 1 ? 0.55 : 1) * r() * TILE, y = r() * TILE, rr = 2 + r() * 5;
      g.fillStyle = '#101410'; circle(g, x, y, rr);
      g.fillStyle = 'rgba(170,200,180,.18)'; circle(g, x - rr * 0.3, y - rr * 0.3, rr * 0.35);
    }
  }
  const make = (fn, seed, ...a) => { const c = mkCanvas(TILE, TILE); fn(c.getContext('2d'), seeded(seed), ...a); return c; };
  const tones = ['#1b2024', '#191e21', '#1d2327', '#181c1f'];
  const set = {
    plates: tones.map((t, i) => make((g, r) => { plateBase(g, r, t); if (i === 1) diamondPlate(g); rivets(g); }, 11 + i * 97)),
    grate: make(grate, 5),
    hazH: make(hazard, 7, false),
    hazV: make(hazard, 8, true),
    vent: make(vent, 9),
    hatches: [0, 1, 2].map((i) => make(hatch, 21 + i * 13)),
    resin: [0, 1, 2].map((i) => make(resin, 31 + i * 17, 1)),
    resinEdge: [0, 1].map((i) => make(resin, 61 + i * 19, 0.5)),
  };
  function at(ix, iy) {
    const inf = vnoise(ix / 6 + 100, iy / 6 - 50);
    const h = hash2(ix, iy);
    if (inf > 0.68) return set.resin[h % 3];
    if (inf > 0.6) return set.resinEdge[h % 2];
    if (((iy % 10) + 10) % 10 === 0) return set.hazH;
    if (((ix % 14) + 14) % 14 === 0) return set.hazV;
    const m = h % 100;
    if (m < 4) return set.vent;
    if (m < 10) return set.grate;
    if (m < 13) return set.hatches[(h >>> 8) % 3];
    return set.plates[(h >>> 4) % 4];
  }
  return { at };
})();

// Emergency beacons scattered through the base, one chance per room.
function lampAt(rx, ry) {
  const h = hash2(rx * 7 + 3, ry * 13 + 1);
  if (h % 10 >= 6) return null;
  return {
    x: (rx * ROOM + 1 + (h % 6)) * TILE + TILE / 2,
    y: (ry * ROOM + 1 + ((h >>> 4) % 6)) * TILE + TILE / 2,
    red: (h >>> 8) % 3 !== 0, ph: (h % 628) / 100,
  };
}

// ---------- Light sprites ----------
const LightSpr = (() => {
  const s = 256, c = mkCanvas(s, s), g = c.getContext('2d');
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.75)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  return c;
})();
const glowCache = {};
function glowSpr(color) {
  if (glowCache[color]) return glowCache[color];
  const c = mkCanvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return (glowCache[color] = c);
}
const CONE_L = 520;
const ConeSpr = (() => {
  const c = mkCanvas(CONE_L, CONE_L), g = c.getContext('2d'), oy = CONE_L / 2;
  for (const [ang, al] of [[0.52, 0.3], [0.43, 0.35], [0.34, 0.45]]) {
    const gr = g.createRadialGradient(0, oy, 0, 0, oy, CONE_L);
    gr.addColorStop(0, `rgba(255,255,255,${al})`);
    gr.addColorStop(0.55, `rgba(255,255,255,${al * 0.6})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, oy); g.arc(0, oy, CONE_L, -ang, ang); g.closePath(); g.fill();
  }
  return c;
})();

// ---------- Sprites ----------
function drawShadow(g, x, y, rx, ry) {
  g.fillStyle = 'rgba(0,0,0,.4)';
  ellipse(g, x + 2, y + 4, rx, ry);
}

function drawMarine(g, p, T) {
  g.save();
  g.translate(p.x, p.y);
  g.scale(1.15, 1.15);
  drawShadow(g, 0, 0, 14, 10);
  // boots, following the movement direction
  g.save();
  g.rotate(p.move);
  const sw = p.moving ? Math.sin(p.walk) * 5 : 0;
  g.fillStyle = '#15180f';
  g.fillRect(sw - 4, -8, 8, 5);
  g.fillRect(-sw - 4, 3, 8, 5);
  g.restore();
  // torso, following the aim
  g.rotate(p.aim);
  g.fillStyle = '#272c22'; g.fillRect(-14, -7, 7, 14);           // backpack
  g.fillStyle = '#3a4430'; g.fillRect(-13, -5, 3, 10);
  g.fillStyle = '#56613f'; ellipse(g, -1, 0, 8, 10.5);            // armor
  g.strokeStyle = '#2b3220'; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, 0); g.lineTo(5, 0); g.stroke();
  g.fillStyle = '#4b5536'; circle(g, -1, -9.5, 4.6); circle(g, -1, 9.5, 4.6); // shoulder pads
  // arms + rifle
  g.fillStyle = '#3d4530'; g.fillRect(2, -8, 8, 4); g.fillRect(2, 4, 10, 4);
  g.fillStyle = '#181b1d'; g.fillRect(4, 1, 21, 5);
  g.fillStyle = '#2b3034'; g.fillRect(6, 0, 9, 3);
  g.fillStyle = '#0c0d0e'; g.fillRect(24, 2, 4, 3);
  g.fillStyle = 'rgba(255,250,210,.9)'; g.fillRect(20, -0.5, 2, 2);   // rail light
  // helmet
  g.fillStyle = '#46512f'; circle(g, 0, 0, 6.4);
  g.fillStyle = '#5b6840'; circle(g, 1, -1, 4.2);
  g.fillStyle = '#20251a'; g.fillRect(4, -3, 2.5, 6);                 // visor edge
  g.restore();
  if (p.iframe > 0 && Math.floor(T * 30) % 2 === 0) {
    g.fillStyle = 'rgba(255,80,60,.35)'; circle(g, p.x, p.y, 13);
  }
}

const XENO = {
  drone: { body: '#1f262e', mid: '#3a4654', hi: 'rgba(160,190,220,.5)', pipes: 1 },
  warrior: { body: '#1a2027', mid: '#36414e', hi: 'rgba(170,200,230,.55)', pipes: 1, ridges: 1 },
  runner: { body: '#3a2b1d', mid: '#5e4730', hi: 'rgba(220,180,130,.4)', quad: 1 },
  spitter: { body: '#1e281e', mid: '#3b4a3c', hi: 'rgba(170,230,140,.45)', sacs: 1, pipes: 1 },
  praetorian: { body: '#171c22', mid: '#323d4a', hi: 'rgba(170,200,235,.55)', crest: 1, pipes: 1, ridges: 1 },
  queen: { body: '#14181e', mid: '#2e3844', hi: 'rgba(180,205,240,.6)', crest: 2, pipes: 1, ridges: 1 },
};

function drawXeno(g, e, T) {
  const L = XENO[e.type];
  const k = e.r / 12;
  const mv = e.moving ? 1 : 0.3;
  const ph = e.t * 9 + e.seed;
  g.save();
  g.translate(e.x, e.y);
  drawShadow(g, 0, 0, e.r * 1.5, e.r * 0.9);
  g.rotate(e.ang);
  g.scale(k, k);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // tail
  const tl = e.type === 'queen' ? 42 : L.quad ? 30 : 26;
  let px = -8, py = 0;
  g.strokeStyle = L.body;
  for (let i = 1; i <= 8; i++) {
    const x = -8 - (i * tl) / 8, y = Math.sin(ph * 0.45 - i * 0.6) * i * 0.75 * (0.4 + mv * 0.6);
    g.lineWidth = 4.4 - i * 0.44;
    g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
    px = x; py = y;
  }
  g.fillStyle = L.mid;
  g.beginPath(); g.moveTo(px - 6, py); g.lineTo(px + 1, py - 2.4); g.lineTo(px + 1, py + 2.4); g.fill();
  // legs (two pairs) + extra arms on the queen
  g.strokeStyle = L.body; g.lineWidth = 2.1;
  const reach = L.quad ? 1.3 : 1;
  const pairs = e.type === 'queen' ? [[-5, 0], [3, 1], [9, 2]] : [[-4, 0], [5, 1]];
  for (const [lx, n] of pairs) {
    for (const side of [-1, 1]) {
      const sw = Math.sin(ph + (side > 0 ? 0 : Math.PI) + n * 1.6) * 4 * mv;
      g.beginPath();
      g.moveTo(lx, side * 3);
      g.lineTo(lx - 3 + sw * 0.5, side * 11 * reach);
      g.lineTo(lx + 3 + sw, side * 15 * reach);
      g.stroke();
    }
  }
  // thorax
  g.fillStyle = L.body; ellipse(g, -1, 0, 9.5, 6.2);
  g.strokeStyle = L.hi; g.lineWidth = 0.6; g.stroke();
  g.fillStyle = L.mid; ellipse(g, -1, 0, 6, 2.2);
  if (L.pipes) {
    g.strokeStyle = L.mid; g.lineWidth = 1.7;
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      g.beginPath(); g.moveTo(-4 + i * 4, s * 4); g.lineTo(-10 + i * 4, s * 9.5); g.stroke();
    }
  }
  if (L.sacs) {
    const pulse = 0.6 + Math.sin(e.t * 5) * 0.25;
    g.fillStyle = `rgba(150,255,70,${pulse})`;
    circle(g, 2, -5, 2.8); circle(g, 2, 5, 2.8);
  }
  // crest: a scalloped shield over the back of the skull
  if (L.crest) {
    const cw = L.crest === 2 ? 10.5 : 7.5, n = L.crest === 2 ? 7 : 5;
    g.fillStyle = L.mid;
    g.beginPath(); g.moveTo(13, 0);
    g.quadraticCurveTo(9, -cw * 0.75, 1, -cw);
    for (let i = 0; i <= n; i++) {
      const y = -cw + (2 * cw * i) / n;
      const back = -1 - (L.crest === 2 ? 4 : 2) * (1 - Math.abs(y / cw) * 0.5);
      g.lineTo(i % 2 ? back + 3 : back, y);
    }
    g.lineTo(1, cw);
    g.quadraticCurveTo(9, cw * 0.75, 13, 0);
    g.closePath(); g.fill();
    g.strokeStyle = L.hi; g.lineWidth = 0.7; g.stroke();
  }
  // elongated head dome
  g.fillStyle = L.body; ellipse(g, 7, 0, 12, 4.7);
  g.strokeStyle = L.hi; g.lineWidth = 0.6; g.stroke();
  g.strokeStyle = L.hi; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(-2, -1.6); g.quadraticCurveTo(8, -3.8, 17, -1); g.stroke();
  if (L.ridges) {
    g.strokeStyle = L.mid; g.lineWidth = 0.9;
    for (let x = 0; x <= 10; x += 3.3) { g.beginPath(); g.moveTo(x, -3.6); g.lineTo(x + 1, 3.6); g.stroke(); }
  }
  g.fillStyle = '#c9d2d8'; g.fillRect(17.4, -1.3, 1.5, 2.6);
  g.restore();
  if (e.flash > 0) { g.fillStyle = `rgba(255,255,255,${Math.min(0.7, e.flash * 9)})`; circle(g, e.x, e.y, e.r); }
}

function drawLarva(g, e) {
  g.save();
  g.translate(e.x, e.y);
  drawShadow(g, 0, 0, 9, 5);
  g.rotate(e.ang);
  const ph = e.t * 14 + e.seed;
  for (let i = 5; i >= 1; i--) {
    const x = -i * 4.1, y = Math.sin(ph - i * 0.9) * i * 0.9;
    g.fillStyle = i % 2 ? '#c4ad90' : '#d1bb9e';
    circle(g, x, y, 5.6 - i * 0.65);
  }
  g.strokeStyle = '#b39c80'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(2, -4); g.lineTo(5, -7); g.moveTo(2, 4); g.lineTo(5, 7); g.stroke();
  g.fillStyle = '#e4d0b5'; circle(g, 2.5, 0, 5);
  g.fillStyle = '#3a1a14'; circle(g, 6, 0, 2.2);
  g.fillStyle = '#f2efe6'; g.fillRect(6.4, -1.6, 1.2, 1); g.fillRect(6.4, 0.6, 1.2, 1);
  g.restore();
  if (e.flash > 0) { g.fillStyle = `rgba(255,255,255,${Math.min(0.7, e.flash * 9)})`; circle(g, e.x, e.y, e.r); }
}

function drawLeaper(g, e) {
  g.save();
  g.translate(e.x, e.y);
  if (e.state !== 'latch') drawShadow(g, 0, 0, 10, 7);
  g.rotate(e.ang);
  const leaping = e.state === 'leap' || e.state === 'latch';
  const curl = leaping ? 0 : Math.sin(e.t * 16 + e.seed) * 0.6;
  // tail
  g.strokeStyle = '#a3875f'; g.lineCap = 'round';
  let px = -5, py = 0;
  for (let i = 1; i <= 7; i++) {
    const x = -5 - i * 3.2, y = Math.sin(e.t * 10 - i * 0.8) * i * 0.7;
    g.lineWidth = 2.8 - i * 0.3;
    g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
    px = x; py = y;
  }
  // eight finger legs
  g.strokeStyle = '#c4a67c'; g.lineWidth = 1.7;
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(2 - i * 1.6, s * 3);
    if (leaping) { g.quadraticCurveTo(8, s * (6 + i * 2.2), 14 - i, s * (5 + i * 2.6)); }
    else {
      g.quadraticCurveTo(4 - i * 2, s * (10 + i), 8 - i * 3.5 + curl * 2 * (i % 2 ? 1 : -1), s * (9 + i * 1.6));
    }
    g.stroke();
  }
  g.fillStyle = '#d8bd92'; ellipse(g, 0, 0, 6.6, 5.6);
  g.strokeStyle = '#8f7350'; g.lineWidth = 0.8;
  for (let x = -3; x <= 3; x += 2) { g.beginPath(); g.moveTo(x, -4); g.lineTo(x, 4); g.stroke(); }
  g.restore();
  if (e.flash > 0) { g.fillStyle = `rgba(255,255,255,${Math.min(0.7, e.flash * 9)})`; circle(g, e.x, e.y, e.r); }
}

function drawEggShape(g, x, y, r, open, seed, T, dim) {
  g.save();
  g.translate(x, y);
  if (open > 0 && open < 1) g.rotate(Math.sin(T * 40) * 0.07);
  drawShadow(g, 0, 0, r * 1.05, r * 0.8);
  const gr = g.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
  gr.addColorStop(0, dim ? '#4a4430' : '#8c8156');
  gr.addColorStop(0.6, dim ? '#2c281b' : '#4d4630');
  gr.addColorStop(1, dim ? '#16140e' : '#29251a');
  g.fillStyle = gr; circle(g, 0, 0, r);
  // veins
  const rr = seeded(seed + 7);
  g.strokeStyle = 'rgba(30,22,14,.6)'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const a = rr() * TAU;
    g.beginPath(); g.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    g.quadraticCurveTo(Math.cos(a + 0.4) * r * 0.6, Math.sin(a + 0.4) * r * 0.6, Math.cos(a + 0.2) * r * 0.3, Math.sin(a + 0.2) * r * 0.3);
    g.stroke();
  }
  if (open <= 0) {
    g.strokeStyle = '#1d1a12'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-r * 0.4, -r * 0.4); g.lineTo(r * 0.4, r * 0.4); g.moveTo(r * 0.4, -r * 0.4); g.lineTo(-r * 0.4, r * 0.4); g.stroke();
  } else {
    g.fillStyle = '#070806'; circle(g, 0, 0, r * 0.62 * open);
    if (!dim) { g.fillStyle = `rgba(140,255,90,${0.35 * open})`; circle(g, 0, 0, r * 0.4 * open); }
    g.fillStyle = dim ? '#3a3524' : '#6e6544';
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      g.save(); g.rotate(a);
      g.beginPath(); g.moveTo(r * 0.25, -r * 0.35); g.quadraticCurveTo(r * (0.7 + open * 0.5), 0, r * 0.25, r * 0.35); g.fill();
      g.restore();
    }
  }
  g.restore();
}
function drawEgg(g, e, T) {
  const pulse = 1 + Math.sin(e.t * 3 + e.seed) * 0.035;
  const open = e.state === 'hatch' ? 1 - e.st / 0.9 : 0;
  drawEggShape(g, e.x, e.y, e.r * pulse, open, e.seed, T, false);
  if (e.flash > 0) { g.fillStyle = `rgba(255,255,255,${Math.min(0.7, e.flash * 9)})`; circle(g, e.x, e.y, e.r); }
}

function drawSentry(g, s, T) {
  g.save(); g.translate(s.x, s.y);
  drawShadow(g, 0, 0, 13, 9);
  g.strokeStyle = '#2a2f33'; g.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); g.stroke(); }
  g.rotate(s.ang);
  g.fillStyle = '#3b4248'; g.fillRect(-8, -7, 15, 14);
  g.fillStyle = '#1a1d20'; g.fillRect(4, -4.5, 16, 3); g.fillRect(4, 1.5, 16, 3);
  g.fillStyle = (Math.floor(T * 4) % 2) ? '#ff4030' : '#60ff70'; g.fillRect(-6, -2, 3, 3);
  g.restore();
  const f = s.life / s.max;
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(s.x - 12, s.y + 15, 24, 3);
  g.fillStyle = '#5ac8f0'; g.fillRect(s.x - 12, s.y + 15, 24 * f, 3);
}

function drawDrone(g, x, y, T) {
  g.save(); g.translate(x, y);
  drawShadow(g, 0, 6, 8, 4);
  g.fillStyle = 'rgba(120,150,160,.25)'; circle(g, 0, 0, 10 + Math.sin(T * 60) * 0.6);
  g.fillStyle = '#2f3b40'; g.beginPath();
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.lineTo(Math.cos(a) * 6.5, Math.sin(a) * 6.5); }
  g.fill();
  g.fillStyle = '#60f0d0'; circle(g, 0, 0, 2.3);
  g.restore();
}

const ITEM_LOOK = {
  med: { color: '#e8eef0', glow: 'rgba(120,255,140,.7)', label: '+' },
  tracker: { color: '#5ae0ff', glow: 'rgba(90,220,255,.7)', label: '◎' },
  charge: { color: '#ff7a30', glow: 'rgba(255,120,40,.7)', label: '✸' },
  nv: { color: '#8aff6a', glow: 'rgba(120,255,90,.7)', label: '◉' },
  crate: { color: '#7b8450', glow: 'rgba(255,220,90,.7)', label: '▣' },
};
function drawItem(g, it, T) {
  const L = ITEM_LOOK[it.kind];
  const bob = Math.sin(T * 4 + it.x) * 2;
  g.save(); g.translate(it.x, it.y + bob);
  drawShadow(g, 0, 6 - bob, 9, 4);
  if (it.kind === 'crate') {
    g.fillStyle = '#4f5634'; g.fillRect(-12, -10, 24, 20);
    g.strokeStyle = '#2b2f1c'; g.lineWidth = 2; g.strokeRect(-12, -10, 24, 20);
    g.beginPath(); g.moveTo(-12, -10); g.lineTo(12, 10); g.moveTo(12, -10); g.lineTo(-12, 10); g.stroke();
    g.fillStyle = '#d8c060'; g.fillRect(-4, -3, 8, 6);
  } else {
    g.fillStyle = '#20262a'; g.fillRect(-8, -8, 16, 16);
    g.strokeStyle = L.color; g.lineWidth = 1.5; g.strokeRect(-8, -8, 16, 16);
    g.fillStyle = L.color; g.font = 'bold 13px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(L.label, 0, 1);
  }
  g.restore();
}
