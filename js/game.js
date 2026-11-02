'use strict';
// ===== Bug Hunt — main loop and systems =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const lightC = mkCanvas(1, 1), lctx = lightC.getContext('2d');
const LIGHT_SCALE = 0.5;
let W = 0, H = 0, DPR = 1, ZOOM = 1;
const DEBUG = /[?&]debug/.test(location.search);

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  lightC.width = Math.ceil(W * LIGHT_SCALE); lightC.height = Math.ceil(H * LIGHT_SCALE);
  ZOOM = clamp(Math.min(W, H) / 760, 0.6, 1.2);
}
window.addEventListener('resize', resize);
resize();
const halfW = () => W / 2 / ZOOM, halfH = () => H / 2 / ZOOM;
const spawnRadius = () => Math.hypot(halfW(), halfH()) + 40;

// ---------- Input ----------
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  onKey(e);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G.state === 'play') pauseGame(); });
const stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
canvas.addEventListener('pointerdown', (e) => {
  if (G.state !== 'play') return;
  stick.active = true; stick.id = e.pointerId;
  stick.ox = stick.x = e.clientX; stick.oy = stick.y = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => { if (stick.active && e.pointerId === stick.id) { stick.x = e.clientX; stick.y = e.clientY; } });
const endStick = (e) => { if (e.pointerId === stick.id) stick.active = false; };
canvas.addEventListener('pointerup', endStick);
canvas.addEventListener('pointercancel', endStick);

// ---------- State ----------
const G = { state: 'title', t: 0, real: 0, cam: { x: 0, y: 0 }, enemies: [], p: null };

function newRun(charId) {
  const c = SQUAD.find((s) => s.id === charId) || SQUAD[0];
  Object.assign(G, {
    t: 0, kills: 0, enemies: [], bullets: [], ebullets: [], gems: [], items: [], parts: [], decals: [], pools: [],
    fx: [], lights: [], texts: [], sentries: [], nades: [],
    spawnAcc: 0, eggTimer: 14, events: EVENTS.map((e) => ({ ...e, done: false })), queenSpawned: false, queenDead: false,
    winT: 0, shake: 0, hurtFlash: 0, pendingLevels: 0, pendingCrates: 0, lastPing: 0, bosses: [], nv: 0,
  });
  G.p = {
    x: 0, y: 0, r: 11, hp: c.hp, maxHp: c.hp, baseSpeed: 150 * c.speed, xp: 0, lvl: 1, next: xpNeeded(1),
    aim: 0, move: 0, moving: false, walk: 0, iframe: 0, latched: 0, char: c, weapons: [], passives: {},
  };
  addWeapon(c.weapon);
  for (let i = 0; i < 3; i++) spawnEggCluster(rand(0, TAU), rand(320, 520));
  G.cam.x = 0; G.cam.y = 0;
  G.state = 'play';
}

function xpNeeded(l) { return Math.floor(5 + (l - 1) * 6 + Math.pow(l - 1, 1.5) * 0.8); }
function pl(id) { return G.p.passives[id] || 0; }
const stat = {
  dmg: () => 1 + 0.1 * pl('optics'),
  cd: () => (1 - 0.07 * pl('loader')) * (G.p.char.cd || 1),
  area: () => 1 + 0.1 * pl('ordnance'),
  amount: () => pl('mags'),
  speed: () => G.p.baseSpeed * (1 + 0.08 * pl('boots')) * (G.p.latched > 0 ? 0.6 : 1),
  magnet: () => 85 * (1 + 0.35 * pl('harness')),
  armor: () => Math.min(0.7, 0.08 * pl('armor') + (G.p.char.armor || 0)),
  regen: () => 0.2 + 0.25 * pl('stims'),
};
function addWeapon(id) { G.p.weapons.push({ id, lvl: 1, t: 0.3, burst: 0, bt: 0 }); }

// ---------- Spatial grid ----------
const CELL = 64;
const grid = new Map();
const gkey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);
function buildGrid() {
  grid.clear();
  for (const e of G.enemies) {
    if (e.dead) continue;
    const k = gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    let a = grid.get(k);
    if (!a) { a = []; grid.set(k, a); }
    a.push(e);
  }
}
function forNear(x, y, r, fn) {
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const a = grid.get(gkey(cx, cy));
    if (!a) continue;
    for (let i = 0; i < a.length; i++) if (fn(a[i]) === true) return;
  }
}
function targetable(e) { return !e.dead && e.state !== 'latch'; }
function nearest(x, y, maxR, exclude) {
  let best = null, bd = maxR * maxR;
  for (const e of G.enemies) {
    if (!targetable(e) || (exclude && exclude.has(e))) continue;
    const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function randomNear(x, y, maxR) {
  const c = [];
  const r2 = maxR * maxR;
  for (const e of G.enemies) {
    if (!targetable(e)) continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy < r2) c.push(e);
  }
  return c.length ? pick(c) : null;
}

// ---------- Enemies ----------
function hpMul() { return 1 + (G.t / 60) * 0.2; }
function spawnEnemy(type, x, y) {
  const d = ENEMIES[type];
  const m = type === 'queen' ? 1 : d.boss ? 1 + G.t / 600 : hpMul();
  const e = {
    type, def: d, x, y, hp: d.hp * m, maxHp: d.hp * m, r: d.r,
    speed: d.speed * rand(0.9, 1.1), dmg: d.dmg * (1 + G.t / 1200),
    ang: Math.atan2(G.p.y - y, G.p.x - x), t: 0, seed: Math.random() * 100, flash: 0, atkCd: 0,
    kx: 0, ky: 0, burn: 0, burnDps: 0, state: '', st: 0, cd: rand(1, 3), moving: true,
  };
  if (type === 'larva') e.grow = rand(16, 22);
  if (type === 'egg') e.sense = rand(0, 60);
  if (type === 'queen') Object.assign(e, { spitCd: 3, eggCd: 6, summonCd: 10, chargeCd: 8 });
  G.enemies.push(e);
  return e;
}
function ringPos() {
  const p = G.p;
  const a = p.moving && Math.random() < 0.5 ? p.move + rand(-1.1, 1.1) : rand(0, TAU);
  const R = spawnRadius();
  return [p.x + Math.cos(a) * R, p.y + Math.sin(a) * R];
}
function spawnEggCluster(a, dist) {
  const p = G.p;
  const cx = p.x + Math.cos(a) * dist, cy = p.y + Math.sin(a) * dist;
  const n = randi(3, 6) + Math.min(4, Math.floor(G.t / 180));
  addDecal({ kind: 'resin', x: cx, y: cy, r: 60 + n * 6, rot: rand(0, TAU), seed: randi(1, 9999) });
  for (let i = 0; i < n; i++) {
    const aa = rand(0, TAU), rr = rand(0, 26 + n * 6);
    spawnEnemy('egg', cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr);
  }
}
function spawnTable(m) {
  return [
    ['larva', m < 5 ? 5 : 2], ['drone', 6], ['leaper', 1.5],
    ['runner', m >= 1.5 ? 2 + m * 0.3 : 0],
    ['spitter', m >= 3 ? 0.8 + m * 0.06 : 0],
    ['warrior', m >= 4 ? 1 + (m - 4) * 0.55 : 0],
  ];
}

function director(dt) {
  const m = G.t / 60;
  for (const ev of G.events) if (!ev.done && G.t >= ev.t) { ev.done = true; runEvent(ev); }
  const queenAlive = G.queenSpawned && !G.queenDead;
  let rate = 0.8 + m * 0.85;
  if (queenAlive) rate *= 0.55;
  G.spawnAcc += rate * dt;
  while (G.spawnAcc >= 1) {
    G.spawnAcc -= 1;
    if (G.enemies.length < 320) { const [x, y] = ringPos(); spawnEnemy(weighted(spawnTable(m)), x, y); }
  }
  G.eggTimer -= dt;
  if (G.eggTimer <= 0) {
    G.eggTimer = rand(16, 24) - Math.min(8, m * 0.5);
    const p = G.p;
    spawnEggCluster(p.moving ? p.move + rand(-0.8, 0.8) : rand(0, TAU), rand(480, 720));
  }
}
function runEvent(ev) {
  if (ev.msg) banner(ev.msg[0], ev.msg[1]);
  const p = G.p;
  if (ev.swarm) {
    const [type, n] = ev.swarm;
    const R = spawnRadius();
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; spawnEnemy(type, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R); }
    SFX.play('alarm');
  }
  if (ev.boss) {
    for (let i = 0; i < (ev.n || 1); i++) { const [x, y] = ringPos(); spawnEnemy(ev.boss, x, y); }
    if (ev.boss === 'queen') { G.queenSpawned = true; SFX.play('alarm'); }
    SFX.play('screech');
    G.shake = 10;
  }
}

function hurtEnemy(e, dmg, kx, ky, knock) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flash = 0.08;
  if (knock) {
    const k = knock * (e.def.boss ? 0.04 : e.type === 'egg' ? 0 : e.type === 'warrior' ? 0.5 : 1);
    e.kx += kx * k; e.ky += ky * k;
  }
  if (dmg >= 1 && G.texts.length < 70) G.texts.push({ x: e.x + rand(-6, 6), y: e.y - e.r, txt: Math.round(dmg), life: 0.6 });
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true;
  if (e.state === 'latch') G.p.latched = Math.max(0, G.p.latched - 1);
  G.kills++;
  dropGem(e.x, e.y, e.def.xp);
  const r = Math.random();
  if (r < 0.009) G.items.push({ x: e.x, y: e.y, kind: 'med' });
  else if (r < 0.011) G.items.push({ x: e.x, y: e.y, kind: 'tracker' });
  else if (r < 0.0125) G.items.push({ x: e.x, y: e.y, kind: 'charge' });
  else if (r < 0.0145) G.items.push({ x: e.x, y: e.y, kind: 'nv' });
  const n = Math.min(16, 4 + e.r * 0.6);
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(40, 180);
    G.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.6), max: 0.6, size: rand(1.5, 3.5), color: '#c8f040', drag: 4 });
  }
  if (e.type === 'egg') addDecal({ kind: 'egg', x: e.x, y: e.y, r: e.r, seed: e.seed, broken: true });
  else addDecal({ kind: 'splat', x: e.x, y: e.y, r: e.r * 1.3, rot: rand(0, TAU), seed: randi(1, 9999) });
  if (e.def.acid && e.type !== 'queen') G.pools.push({ x: e.x, y: e.y, r: e.r * 1.5, life: 3.5, max: 3.5 });
  SFX.play('hiss');
  if (e.type === 'praetorian') {
    G.items.push({ x: e.x, y: e.y, kind: 'crate' });
    banner('PRAETORIAN DOWN — SUPPLY DROP', '#e8c547');
  }
  if (e.type === 'queen') {
    G.queenDead = true; G.winT = 3.5;
    for (let i = 0; i < 8; i++) setTimeout(() => explodeFx(e.x + rand(-60, 60), e.y + rand(-60, 60), 80), i * 220);
    banner('THE QUEEN IS DOWN. DUST OFF!', '#9fe870');
    for (const o of G.enemies) if (!o.dead && o.type !== 'queen') { o.dead = true; G.kills++; dropGem(o.x, o.y, o.def.xp); }
  }
}

function dropGem(x, y, v) {
  if (v <= 0) return;
  if (G.gems.length > 300) {
    for (const g of G.gems) {
      if (Math.abs(g.x - x) < 90 && Math.abs(g.y - y) < 90) { g.v += v; return; }
    }
  }
  G.gems.push({ x: x + rand(-4, 4), y: y + rand(-4, 4), v, pull: false, spd: 0 });
}
function hatchEgg(e) {
  e.dead = true;
  addDecal({ kind: 'egg', x: e.x, y: e.y, r: e.r, seed: e.seed, broken: false });
  const l = spawnEnemy('leaper', e.x, e.y);
  l.cd = 0;
  SFX.play('hatch');
}

function damagePlayer(d) {
  const p = G.p;
  if (p.iframe > 0 || G.state !== 'play' || G.queenDead) return;
  p.hp -= d * (1 - stat.armor());
  p.iframe = 0.3;
  G.hurtFlash = 0.35;
  G.shake = Math.max(G.shake, 5);
  SFX.play('hurt');
  if (p.hp <= 0) gameOver();
}
function dotPlayer(d) {
  if (G.state !== 'play' || G.queenDead) return;
  G.p.hp -= d * (1 - stat.armor());
  G.hurtFlash = Math.max(G.hurtFlash, 0.12);
  if (G.p.hp <= 0) gameOver();
}

function updateEnemy(e, dt) {
  const p = G.p;
  e.t += dt;
  if (e.flash > 0) e.flash -= dt;
  e.atkCd -= dt;
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  let mvx = 0, mvy = 0;
  const chase = (mul = 1) => { mvx = ux * e.speed * mul; mvy = uy * e.speed * mul; };

  switch (e.type) {
    case 'egg':
      if (e.state === 'hatch') { e.st -= dt; if (e.st <= 0) { hatchEgg(e); return; } }
      else if (d < 150 + e.sense) { e.state = 'hatch'; e.st = 0.9; }
      break;
    case 'larva':
      chase();
      { const w = Math.sin(e.t * 9 + e.seed) * 0.7, c = Math.cos(w), s = Math.sin(w); const x = mvx; mvx = x * c - mvy * s; mvy = x * s + mvy * c; }
      e.grow -= dt;
      if (e.grow <= 0) {
        e.dead = true;
        const n = spawnEnemy('drone', e.x, e.y);
        n.hp *= 0.8;
        for (let i = 0; i < 8; i++) G.parts.push({ x: e.x, y: e.y, vx: rand(-80, 80), vy: rand(-80, 80), life: 0.4, max: 0.4, size: 2.5, color: '#d1bb9e', drag: 5 });
        return;
      }
      break;
    case 'leaper':
      if (e.state === 'latch') {
        e.x = p.x + e.ox; e.y = p.y + e.oy; e.ang = Math.atan2(-e.oy, -e.ox);
        e.st -= dt;
        dotPlayer(4 * dt);
        e.hp -= 5 * dt;  // the marine pries it loose
        if (e.st <= 0 || e.hp <= 0) killEnemy(e);
        return;
      }
      if (e.state === 'crouch') {
        e.st -= dt;
        if (e.st <= 0) { e.state = 'leap'; e.st = 0.42; e.lvx = ux * 430; e.lvy = uy * 430; SFX.play('leap'); }
      } else if (e.state === 'leap') {
        e.st -= dt; mvx = e.lvx; mvy = e.lvy;
        if (d < e.r + p.r + 2 && p.latched < 3 && !G.queenDead) {
          e.state = 'latch'; e.st = 2.6; p.latched++;
          e.ox = -ux * 8; e.oy = -uy * 8;
          damagePlayer(e.dmg);
          banner('LEAPER LATCHED ON — SHAKE IT OFF!', '#ff6a4a', 1.2);
          return;
        }
        if (e.st <= 0) { e.state = ''; e.cd = 1.6; }
      } else {
        e.cd -= dt;
        chase();
        if (d < 190 && e.cd <= 0) { e.state = 'crouch'; e.st = 0.35; }
      }
      break;
    case 'spitter':
      if (d > 260) chase();
      else if (d < 180) chase(-0.7);
      else { mvx = -uy * e.speed * 0.6; mvy = ux * e.speed * 0.6; }
      e.cd -= dt;
      if (e.cd <= 0 && d < 360) {
        e.cd = rand(3, 4.2);
        const a = Math.atan2(dy, dx);
        G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 185, vy: Math.sin(a) * 185, r: 6, dmg: e.dmg, life: 2.6 });
        SFX.play('spit');
      }
      break;
    case 'praetorian':
      if (e.state === 'wind') {
        e.st -= dt;
        if (e.st <= 0) { e.state = 'charge'; e.st = 0.9; }
      } else if (e.state === 'charge') {
        e.st -= dt; mvx = Math.cos(e.cdir) * 380; mvy = Math.sin(e.cdir) * 380;
        if (e.st <= 0) e.state = '';
      } else {
        chase(); e.cd -= dt;
        if (e.cd <= 0 && d < 420) { e.state = 'wind'; e.st = 0.75; e.cdir = Math.atan2(dy, dx); e.cd = rand(4, 6); SFX.play('screech'); }
      }
      break;
    case 'queen': {
      const enr = e.hp < e.maxHp * 0.5 ? 1.35 : 1;
      if (e.state === 'wind') {
        e.st -= dt; if (e.st <= 0) { e.state = 'charge'; e.st = 1.0; }
      } else if (e.state === 'charge') {
        e.st -= dt; mvx = Math.cos(e.cdir) * 420; mvy = Math.sin(e.cdir) * 420;
        if (e.st <= 0) e.state = '';
      } else {
        chase(enr);
        e.spitCd -= dt * enr; e.eggCd -= dt; e.summonCd -= dt * enr; e.chargeCd -= dt * enr;
        if (e.spitCd <= 0) {
          e.spitCd = 3.2;
          const n = enr > 1 ? 11 : 7, base = Math.atan2(dy, dx);
          for (let i = 0; i < n; i++) {
            const a = base + (i / (n - 1) - 0.5) * 1.1;
            G.ebullets.push({ x: e.x + ux * 40, y: e.y + uy * 40, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, r: 8, dmg: 14, life: 3.2 });
          }
          SFX.play('spit');
        }
        if (e.eggCd <= 0) {
          e.eggCd = 9;
          for (let i = 0; i < 3; i++) { const a = e.ang + Math.PI + rand(-0.8, 0.8); spawnEnemy('egg', e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70); }
        }
        if (e.summonCd <= 0) {
          e.summonCd = 12;
          for (let i = 0; i < 4; i++) { const a = rand(0, TAU); spawnEnemy(i % 2 ? 'warrior' : 'runner', e.x + Math.cos(a) * 80, e.y + Math.sin(a) * 80); }
          SFX.play('screech');
        }
        if (e.chargeCd <= 0 && d < 500) { e.chargeCd = 8; e.state = 'wind'; e.st = 0.9; e.cdir = Math.atan2(dy, dx); }
      }
      break;
    }
    default:
      chase();
  }

  e.x += (mvx + e.kx) * dt;
  e.y += (mvy + e.ky) * dt;
  const kd = Math.exp(-10 * dt);
  e.kx *= kd; e.ky *= kd;
  e.moving = mvx !== 0 || mvy !== 0;
  if (e.moving) e.ang += angDiff(e.ang, Math.atan2(mvy, mvx)) * Math.min(1, dt * 10);

  if (e.burn > 0) {
    e.burn -= dt;
    e.hp -= e.burnDps * dt;
    e.flash = Math.max(e.flash, 0.02);
    if (Math.random() < dt * 14) G.parts.push({ x: e.x + rand(-e.r, e.r) * 0.6, y: e.y + rand(-e.r, e.r) * 0.6, vx: 0, vy: -30, life: 0.35, max: 0.35, size: 3, color: '#ff8a30', drag: 1, glow: true });
    if (e.hp <= 0) { killEnemy(e); return; }
  }

  if (e.type !== 'egg' && d < e.r + p.r && e.atkCd <= 0) { damagePlayer(e.dmg); e.atkCd = 0.8; }

  // Keep the pressure on: stragglers far behind get recycled ahead of the marine.
  const far = spawnRadius() + 380;
  if (d > far && !e.def.boss) {
    if (e.type === 'egg') { e.dead = true; return; }
    const R = spawnRadius();
    e.x = p.x + ux * R; e.y = p.y + uy * R;
  }
}

function separate() {
  for (const e of G.enemies) {
    if (e.dead || e.type === 'egg' || e.state === 'latch') continue;
    const bossF = e.def.boss ? 0.1 : 1;
    forNear(e.x, e.y, e.r + 52, (o) => {
      if (o === e || o.dead || o.state === 'latch') return;
      const dx = e.x - o.x, dy = e.y - o.y, min = e.r + o.r, d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const f = ((min - d) / d) * 0.35 * (o.type === 'egg' || o.def.boss ? 2 : 1) * bossF;
        e.x += dx * f; e.y += dy * f;
      }
    });
  }
}

// ---------- Weapons ----------
function fireBullet(a, o, fromX, fromY) {
  const p = G.p;
  const x = fromX ?? p.x + Math.cos(a) * 20, y = fromY ?? p.y + Math.sin(a) * 20;
  if (fromX === undefined) { p.aim = a; addLight(x, y, 70, 0.9, 0.05, 'rgba(255,210,120,.8)'); }
  const spd = o.spd;
  G.bullets.push(Object.assign({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, a, max: o.life, hits: new Set(), drag: 0 }, o));
}
function lobGrenade(x, y, dmg, radius, delay = 0) {
  G.nades.push({ x0: G.p.x, y0: G.p.y, x1: x, y1: y, t: -delay, dur: 0.55, dmg, radius, x: G.p.x, y: G.p.y, z: 0 });
  SFX.play('grenade');
}

const WFIRE = {
  pulse(w, dt, s) {
    const p = G.p;
    w.t -= dt;
    if (w.burst > 0) {
      w.bt -= dt;
      if (w.bt <= 0) {
        w.bt = 0.06; w.burst--;
        const tg = nearest(p.x, p.y, 560);
        const a = (tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : p.aim) + rand(-0.06, 0.06);
        fireBullet(a, { kind: 'pulse', spd: 780, life: 0.75, r: 3, dmg: s.dmg * stat.dmg(), pierce: s.pierce, knock: 30 });
        SFX.play('pulse');
      }
      return;
    }
    if (w.t > 0) return;
    const tg = nearest(p.x, p.y, 520);
    if (!tg) return;
    w.burst = s.rounds + stat.amount(); w.bt = 0; w.t = s.cd * stat.cd();
    if (s.nade && (w.n = (w.n || 0) + 1) % 3 === 0) lobGrenade(tg.x, tg.y, 40 * stat.dmg(), 70 * stat.area());
  },
  shotgun(w, dt, s) {
    const p = G.p;
    w.t -= dt;
    if (w.t > 0) return;
    const range = s.range * stat.area();
    const tg = nearest(p.x, p.y, 280 * range);
    if (!tg) return;
    w.t = s.cd * stat.cd();
    const base = Math.atan2(tg.y - p.y, tg.x - p.x);
    const n = s.pellets + 2 * stat.amount();
    for (let i = 0; i < n; i++) {
      const a = base + (i / (n - 1) - 0.5) * 0.65 + rand(-0.04, 0.04);
      fireBullet(a, { kind: 'pellet', spd: rand(580, 700), life: 0.45 * range, r: 3, dmg: s.dmg * stat.dmg(), pierce: s.pierce, knock: 170, drag: 2 });
    }
    SFX.play('shotgun');
    G.shake = Math.max(G.shake, 3);
  },
  flamer(w, dt, s) {
    const p = G.p;
    const range = 150 * s.range * stat.area();
    const tg = nearest(p.x, p.y, range * 1.1);
    if (!tg) { w.t = 0; return; }
    const a = Math.atan2(tg.y - p.y, tg.x - p.x);
    p.aim = a;
    w.t -= dt;
    while (w.t <= 0) {
      w.t += s.rate * stat.cd();
      for (let k = 0; k <= stat.amount(); k++) {
        const aa = a + rand(-s.spread, s.spread) * 0.5, spd = rand(300, 360);
        G.bullets.push({
          kind: 'flame', x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20, vx: Math.cos(aa) * spd, vy: Math.sin(aa) * spd,
          life: range / spd, max: range / spd, r: 5, grow: 13 * stat.area(), dmg: s.dmg * stat.dmg(), pierce: 99, hits: new Set(),
          knock: 8, burn: s.burn * stat.dmg(), drag: 1.2,
        });
      }
    }
    addLight(p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60, 140, 0.8, 0.06, 'rgba(255,130,40,.6)');
    SFX.play('flame');
  },
  smart(w, dt, s) {
    const p = G.p;
    w.t -= dt;
    if (w.burst > 0) {
      w.bt -= dt;
      if (w.bt <= 0) {
        w.bt = 0.07; w.burst--;
        const tg = randomNear(p.x, p.y, 480) || nearest(p.x, p.y, 700);
        const a = (tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : p.aim) + rand(-0.3, 0.3);
        fireBullet(a, { kind: 'smart', spd: 640, life: 1.1, r: 3, dmg: s.dmg * stat.dmg(), pierce: s.pierce, homing: tg, turn: 9, knock: 25 });
        SFX.play('smart');
      }
      return;
    }
    if (w.t > 0 || !nearest(p.x, p.y, 480)) return;
    w.burst = s.shots + stat.amount(); w.bt = 0; w.t = s.cd * stat.cd();
  },
  grenade(w, dt, s) {
    const p = G.p;
    w.t -= dt;
    if (w.t > 0) return;
    const tg = nearest(p.x, p.y, 420);
    if (!tg) return;
    w.t = s.cd * stat.cd();
    const n = s.count + stat.amount();
    for (let i = 0; i < n; i++) {
      const t2 = i === 0 ? tg : randomNear(p.x, p.y, 420) || tg;
      lobGrenade(t2.x + rand(-20, 20), t2.y + rand(-20, 20), s.dmg * stat.dmg(), s.radius * stat.area(), i * 0.12);
    }
  },
  sentry(w, dt, s) {
    const p = G.p;
    w.t -= dt;
    if (w.t > 0) return;
    w.t = s.cd * stat.cd();
    for (let i = 0; i < s.count; i++) {
      const a = rand(0, TAU), r = i ? 34 : 14;
      const dur = s.dur * stat.area();
      G.sentries.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, life: dur, max: dur, cd: 0, ang: p.aim,
        dmg: s.dmg * stat.dmg(), rate: s.rate * stat.cd(), range: s.range * stat.area() });
    }
    while (G.sentries.length > 6) G.sentries.shift();
    SFX.play('deploy');
  },
  drone(w, dt, s) {
    const p = G.p;
    const n = s.count + stat.amount();
    w.ang = (w.ang || 0) + dt * 2.2;
    w.cds = w.cds || [];
    w.pos = [];
    for (let i = 0; i < n; i++) {
      const a = w.ang + (i * TAU) / n;
      const x = p.x + Math.cos(a) * 64, y = p.y + Math.sin(a) * 64;
      w.pos.push({ x, y });
      w.cds[i] = (w.cds[i] ?? rand(0, s.cd)) - dt;
      if (w.cds[i] <= 0) {
        const tg = nearest(x, y, 320);
        if (tg) {
          w.cds[i] = s.cd * stat.cd();
          const aa = Math.atan2(tg.y - y, tg.x - x);
          const offs = s.twin ? [-0.08, 0.08] : [0];
          for (const o of offs) fireBullet(aa + o, { kind: 'bolt', spd: 720, life: 0.6, r: 3, dmg: s.dmg * stat.dmg(), pierce: 1, knock: 20 }, x, y);
          addLight(x, y, 50, 0.7, 0.05, 'rgba(90,255,220,.6)');
          SFX.play('laser');
        }
      }
      forNear(x, y, 60, (e) => {
        if (!targetable(e) || (e.droneHit || 0) > G.t) return;
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy < (e.r + 8) ** 2) { e.droneHit = G.t + 0.4; hurtEnemy(e, s.dmg * 0.6 * stat.dmg(), dx / 20, dy / 20, 60); }
      });
    }
  },
  arc(w, dt, s) {
    const p = G.p;
    w.t -= dt;
    if (w.t > 0) return;
    const range = s.range * stat.area();
    const first = nearest(p.x, p.y, range);
    if (!first) return;
    w.t = s.cd * stat.cd();
    for (let b = 0; b < s.bolts; b++) {
      const hit = new Set();
      let tg = b === 0 ? first : randomNear(p.x, p.y, range) || first;
      const pts = [{ x: p.x, y: p.y - 6 }];
      const chains = s.chains + stat.amount();
      for (let i = 0; i <= chains && tg; i++) {
        hit.add(tg);
        pts.push({ x: tg.x, y: tg.y });
        hurtEnemy(tg, s.dmg * stat.dmg() * (i === 0 ? 1 : 0.85), 0, 0, 0);
        addLight(tg.x, tg.y, 70, 0.8, 0.12, 'rgba(180,150,255,.7)');
        tg = nearest(tg.x, tg.y, 150 * stat.area(), hit);
      }
      G.fx.push({ kind: 'bolt', pts: jagged(pts), life: 0.18, max: 0.18 });
    }
    SFX.play('arc');
  },
};
function jagged(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    for (let k = 1; k < 6; k++) { const t = k / 6, off = rand(-1, 1) * Math.min(14, len * 0.12); out.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off }); }
    out.push(b);
  }
  return out;
}

function explodeFx(x, y, radius) {
  G.fx.push({ kind: 'boom', x, y, r: radius, life: 0.4, max: 0.4 });
  for (let i = 0; i < 18; i++) {
    const a = rand(0, TAU), s = rand(80, 320);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.5), max: 0.5, size: rand(1.5, 3), color: '#ffc060', drag: 4, glow: true });
  }
  for (let i = 0; i < 6; i++) G.parts.push({ x: x + rand(-15, 15), y: y + rand(-15, 15), vx: rand(-20, 20), vy: rand(-20, 20), life: rand(0.6, 1), max: 1, size: rand(10, 20), color: 'smoke', drag: 1 });
  addLight(x, y, radius * 3, 1, 0.3, 'rgba(255,170,70,.9)');
  addDecal({ kind: 'scorch', x, y, r: radius * 0.8 });
  SFX.play('boom');
  G.shake = Math.max(G.shake, 6);
}
function explode(x, y, radius, dmg) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
    if (d < radius + e.r) hurtEnemy(e, dmg, dx / d, dy / d, 220);
  }
  explodeFx(x, y, radius);
}

function addLight(x, y, r, a, life, color) {
  if (G.lights.length < 90) G.lights.push({ x, y, r, a, life, max: life, color });
}
function addDecal(d) {
  G.decals.push(d);
  if (G.decals.length > 240) G.decals.shift();
}

// ---------- Update ----------
function update(dt) {
  G.t += dt;
  const p = G.p;

  // player movement
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (stick.active) {
    const sx = stick.x - stick.ox, sy = stick.y - stick.oy, sl = Math.hypot(sx, sy);
    if (sl > 6) { const m = Math.min(1, sl / 50); mx = (sx / sl) * m; my = (sy / sl) * m; }
  }
  const ml = Math.hypot(mx, my);
  p.moving = ml > 0.05;
  if (p.moving) {
    if (ml > 1) { mx /= ml; my /= ml; }
    const sp = stat.speed();
    p.x += mx * sp * dt; p.y += my * sp * dt;
    p.move = Math.atan2(my, mx);
    p.walk += dt * 14;
    if (!nearest(p.x, p.y, 560)) p.aim += angDiff(p.aim, p.move) * Math.min(1, dt * 8);
  }
  if (p.iframe > 0) p.iframe -= dt;
  p.hp = Math.min(p.maxHp, p.hp + stat.regen() * dt);

  director(dt);
  for (const e of G.enemies) if (!e.dead) updateEnemy(e, dt);
  buildGrid();
  separate();

  for (const w of p.weapons) WFIRE[w.id](w, dt, WEAPONS[w.id].stats(w.lvl));

  // sentries
  for (const s of G.sentries) {
    s.life -= dt; s.cd -= dt;
    const tg = nearest(s.x, s.y, s.range);
    if (tg) {
      const a = Math.atan2(tg.y - s.y, tg.x - s.x);
      s.ang += angDiff(s.ang, a) * Math.min(1, dt * 14);
      if (s.cd <= 0 && Math.abs(angDiff(s.ang, a)) < 0.3) {
        s.cd = s.rate;
        const mx2 = s.x + Math.cos(s.ang) * 20, my2 = s.y + Math.sin(s.ang) * 20;
        fireBullet(s.ang + rand(-0.05, 0.05), { kind: 'sentry', spd: 820, life: 0.5, r: 3, dmg: s.dmg, pierce: 1, knock: 25 }, mx2, my2);
        addLight(mx2, my2, 50, 0.8, 0.04, 'rgba(255,220,120,.7)');
        SFX.play('pulse');
      }
    }
  }
  G.sentries = G.sentries.filter((s) => s.life > 0);

  // grenades
  for (const n of G.nades) {
    n.t += dt;
    if (n.t < 0) { n.x = p.x; n.y = p.y; continue; }
    const f = Math.min(1, n.t / n.dur);
    n.x = n.x0 + (n.x1 - n.x0) * f; n.y = n.y0 + (n.y1 - n.y0) * f; n.z = Math.sin(f * Math.PI) * 45;
    if (f >= 1) { n.done = true; explode(n.x1, n.y1, n.radius, n.dmg); }
  }
  G.nades = G.nades.filter((n) => !n.done);

  updateBullets(dt);

  // enemy acid
  for (const b of G.ebullets) {
    b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (b.r + p.r) ** 2) {
      damagePlayer(b.dmg); b.life = 0;
      G.pools.push({ x: b.x, y: b.y, r: 16, life: 1.5, max: 1.5 });
    }
  }
  G.ebullets = G.ebullets.filter((b) => b.life > 0);

  for (const pool of G.pools) {
    pool.life -= dt;
    if ((pool.x - p.x) ** 2 + (pool.y - p.y) ** 2 < (pool.r + p.r * 0.5) ** 2) dotPlayer(8 * dt);
  }
  G.pools = G.pools.filter((q) => q.life > 0);

  // gems
  const mag = stat.magnet();
  for (const g of G.gems) {
    const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1;
    if (!g.pull && d < mag) g.pull = true;
    if (g.pull) {
      g.spd = Math.min(900, g.spd + 1100 * dt);
      const s = Math.min(d, g.spd * dt);
      g.x += (dx / d) * s; g.y += (dy / d) * s;
      if (d < p.r + 6) { g.got = true; gainXp(g.v); SFX.play('gem'); }
    }
  }
  G.gems = G.gems.filter((g) => !g.got);

  for (const it of G.items) {
    const dx = p.x - it.x, dy = p.y - it.y, d = Math.hypot(dx, dy) || 1;
    if (d < 60) { it.x += (dx / d) * 260 * dt; it.y += (dy / d) * 260 * dt; }
    if (d < p.r + 14) { it.got = true; useItem(it); }
  }
  G.items = G.items.filter((it) => !it.got);

  // cosmetics
  for (const q of G.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; const k = Math.exp(-q.drag * dt); q.vx *= k; q.vy *= k; }
  G.parts = G.parts.filter((q) => q.life > 0);
  if (G.parts.length > 700) G.parts.splice(0, G.parts.length - 700);
  for (const f of G.fx) f.life -= dt;
  G.fx = G.fx.filter((f) => f.life > 0);
  for (const l of G.lights) l.life -= dt;
  G.lights = G.lights.filter((l) => l.life > 0);
  for (const t of G.texts) { t.life -= dt; t.y -= 30 * dt; }
  G.texts = G.texts.filter((t) => t.life > 0);

  G.enemies = G.enemies.filter((e) => !e.dead);
  G.bosses = G.enemies.filter((e) => e.def.boss).sort((a, b) => (b.type === 'queen') - (a.type === 'queen'));

  if (G.nv > 0) G.nv = Math.max(0, G.nv - dt);

  // motion tracker ping
  const PING = 1.3;
  if (G.t - G.lastPing >= PING) {
    G.lastPing = G.t;
    SFX.play('ping');
    const n = nearest(p.x, p.y, 650);
    if (n) { const dr = Math.hypot(n.x - p.x, n.y - p.y) / 650; SFX.play('blip', { f: 2400 - dr * 900, delay: 0.15 + dr * 0.45 }); }
  }

  if (G.queenDead) { G.winT -= dt; if (G.winT <= 0) victory(); }
  else if (G.pendingCrates > 0) openLevelUp(true);
  else if (G.pendingLevels > 0) openLevelUp(false);
}

function updateBullets(dt) {
  for (const b of G.bullets) {
    b.life -= dt;
    if (b.homing) {
      if (b.homing.dead) b.homing = nearest(b.x, b.y, 300);
      if (b.homing) {
        const want = Math.atan2(b.homing.y - b.y, b.homing.x - b.x);
        b.a += clamp(angDiff(b.a, want), -b.turn * dt, b.turn * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(b.a) * sp; b.vy = Math.sin(b.a) * sp;
      }
    }
    if (b.drag) { const k = Math.exp(-b.drag * dt); b.vx *= k; b.vy *= k; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.kind === 'flame') b.r = 5 + b.grow * (1 - b.life / b.max);
    const sp = Math.hypot(b.vx, b.vy) || 1;
    forNear(b.x, b.y, b.r + 52, (e) => {
      if (!targetable(e) || b.hits.has(e)) return;
      const rr = b.r + e.r;
      if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 > rr * rr) return;
      b.hits.add(e);
      hurtEnemy(e, b.dmg, b.vx / sp, b.vy / sp, b.knock);
      if (b.burn && !e.dead) { e.burn = 2; e.burnDps = Math.max(e.burnDps, b.burn); }
      if (b.kind !== 'flame') {
        for (let i = 0; i < 3; i++) G.parts.push({ x: b.x, y: b.y, vx: rand(-90, 90) - b.vx * 0.1, vy: rand(-90, 90) - b.vy * 0.1, life: 0.2, max: 0.2, size: 1.8, color: '#c8f040', drag: 6 });
      }
      if (--b.pierce <= 0) { b.life = 0; return true; }
    });
  }
  G.bullets = G.bullets.filter((b) => b.life > 0);
}

function gainXp(v) {
  const p = G.p;
  p.xp += v;
  while (p.xp >= p.next) { p.xp -= p.next; p.lvl++; p.next = xpNeeded(p.lvl); G.pendingLevels++; }
}
const NV_DUR = 20;
// 0..1 strength of the night vision goggles: quick power-up, flickers as the battery dies.
function nvLevel(T) {
  if (G.nv <= 0) return 0;
  const on = Math.min(1, (NV_DUR - G.nv) / 0.4 + (G.nv > NV_DUR ? 1 : 0));
  const dying = G.nv < 3 && Math.sin(T * (40 - G.nv * 8)) > 0.3 ? 0.35 : 1;
  return Math.max(0, Math.min(on, G.nv / 0.5, 1)) * dying;
}
function useItem(it) {
  const p = G.p;
  SFX.play('pickup');
  if (it.kind === 'med') { p.hp = Math.min(p.maxHp, p.hp + 35); banner('MEDKIT +35', '#9fe870', 1); }
  else if (it.kind === 'tracker') { for (const g of G.gems) g.pull = true; banner('SAMPLE RECALL', '#5ae0ff', 1); G.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 900, life: 0.6, max: 0.6, color: '90,220,255' }); }
  else if (it.kind === 'charge') {
    const hw = halfW() + 40, hh = halfH() + 40;
    for (const e of G.enemies) if (!e.dead && Math.abs(e.x - p.x) < hw && Math.abs(e.y - p.y) < hh) hurtEnemy(e, e.def.boss ? 400 : 99999, 0, 0, 0);
    G.fx.push({ kind: 'flash', life: 0.5, max: 0.5 });
    G.shake = 14;
    SFX.play('boom');
    banner('DEMO CHARGE!', '#ff7a30', 1);
  } else if (it.kind === 'nv') {
    G.nv = Math.min(G.nv + NV_DUR, NV_DUR * 1.5);
    SFX.play('nvon');
    banner('NIGHT VISION ONLINE', '#8aff6a', 1);
  } else if (it.kind === 'crate') { G.pendingCrates++; }
}

// ---------- Level up ----------
const $ = (id) => document.getElementById(id);
let currentChoices = [];
function rollOptions() {
  const p = G.p, pool = [];
  for (const w of p.weapons) if (w.lvl < WEAPONS[w.id].max) pool.push({ kind: 'weapon', id: w.id, w: 1.3 });
  if (p.weapons.length < 6) for (const id in WEAPONS) if (!p.weapons.some((w) => w.id === id)) pool.push({ kind: 'weapon', id, w: 1 });
  const owned = Object.keys(p.passives);
  for (const id of owned) if (p.passives[id] < PASSIVES[id].max) pool.push({ kind: 'passive', id, w: 1 });
  if (owned.length < 6) for (const id in PASSIVES) if (!p.passives[id]) pool.push({ kind: 'passive', id, w: 0.8 });
  const out = [];
  while (out.length < 3 && pool.length) {
    let tot = 0;
    for (const o of pool) tot += o.w;
    let r = Math.random() * tot, i = 0;
    for (; i < pool.length - 1; i++) if ((r -= pool[i].w) <= 0) break;
    out.push(pool.splice(i, 1)[0]);
  }
  if (!out.length) out.push({ kind: 'heal' }, { kind: 'intel' });
  return out;
}
function describe(o) {
  const p = G.p;
  if (o.kind === 'weapon') {
    const W0 = WEAPONS[o.id], cur = p.weapons.find((w) => w.id === o.id);
    const lvl = cur ? cur.lvl + 1 : 1;
    return { code: W0.code, color: W0.color, name: W0.name, tag: cur ? `LV ${lvl}` : 'NEW WEAPON', desc: W0.up[lvl - 1], round: false };
  }
  if (o.kind === 'passive') {
    const P0 = PASSIVES[o.id], lvl = (p.passives[o.id] || 0) + 1;
    return { code: P0.code, color: '#9fe870', name: P0.name, tag: lvl === 1 ? 'NEW GEAR' : `LV ${lvl}`, desc: P0.desc, round: true };
  }
  if (o.kind === 'heal') return { code: '+', color: '#9fe870', name: 'Field Rations', tag: 'SUPPLY', desc: 'Restore 40 HP', round: true };
  return { code: '¤', color: '#e8c547', name: 'Colony Intel', tag: 'SUPPLY', desc: 'Download data logs: +500 score', round: true };
}
function openLevelUp(crate) {
  G.state = 'levelup';
  G.levelCrate = crate;
  stick.active = false;
  currentChoices = rollOptions();
  $('lvTitle').textContent = crate ? 'SUPPLY DROP' : 'PROMOTION';
  $('lvSub').textContent = crate ? 'Requisition one item from the crate' : `Level ${G.p.lvl - G.pendingLevels + 1} — choose an upgrade`;
  const box = $('choices');
  box.innerHTML = '';
  currentChoices.forEach((o, i) => {
    const d = describe(o);
    const el = document.createElement('button');
    el.className = 'card choice';
    el.innerHTML = `<div class="badge ${d.round ? 'round' : ''}" style="--c:${d.color}">${d.code}</div>
      <div class="cbody"><div class="ctag">${d.tag}</div><div class="cname">${d.name}</div><div class="cdesc">${d.desc}</div></div>
      <div class="ckey">${i + 1}</div>`;
    el.addEventListener('click', () => choose(i));
    box.appendChild(el);
  });
  show('levelup');
  SFX.play('level');
}
function choose(i) {
  if (G.state !== 'levelup') return;
  const o = currentChoices[i];
  if (!o) return;
  const p = G.p;
  if (o.kind === 'weapon') { const cur = p.weapons.find((w) => w.id === o.id); if (cur) cur.lvl++; else addWeapon(o.id); }
  else if (o.kind === 'passive') {
    p.passives[o.id] = (p.passives[o.id] || 0) + 1;
    if (o.id === 'condition') { p.maxHp += 20; p.hp += 20; }
  } else if (o.kind === 'heal') p.hp = Math.min(p.maxHp, p.hp + 40);
  else G.bonus = (G.bonus || 0) + 500;
  if (G.levelCrate) G.pendingCrates--; else G.pendingLevels--;
  hide('levelup');
  G.state = 'play';
  G.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 120, life: 0.5, max: 0.5, color: '159,232,112' });
}

// ---------- Screens ----------
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function score() { return Math.floor(G.kills * 10 + G.t * 5 + (G.p ? G.p.lvl * 50 : 0) + (G.bonus || 0) + (G.queenDead ? 10000 : 0)); }
function loadBest() { try { return JSON.parse(localStorage.getItem('bughunt.best')) || null; } catch { return null; } }
function saveBest() {
  const b = loadBest(), s = score();
  if (!b || s > b.score) {
    try { localStorage.setItem('bughunt.best', JSON.stringify({ score: s, time: G.t, kills: G.kills, win: G.queenDead })); } catch { /* storage unavailable */ }
    return true;
  }
  return false;
}
function loadoutHTML() {
  const p = G.p;
  const ws = p.weapons.map((w) => `<span class="chip" style="--c:${WEAPONS[w.id].color}">${WEAPONS[w.id].name} <b>${w.lvl}</b></span>`).join('');
  const ps = Object.entries(p.passives).map(([id, l]) => `<span class="chip" style="--c:#9fe870">${PASSIVES[id].name} <b>${l}</b></span>`).join('');
  return ws + ps;
}
function endScreen(won) {
  const rec = saveBest();
  $('overTitle').textContent = won ? 'MISSION COMPLETE' : 'SIGNAL LOST';
  $('overTitle').className = won ? 'win' : 'lose';
  $('overSub').textContent = won ? 'The hive is burning. Dropship inbound for extraction.' : `${G.p.char.name}'s vitals have flatlined.`;
  $('overStats').innerHTML = `
    <div><span>TIME</span><b>${fmtTime(G.t)}</b></div><div><span>KILLS</span><b>${G.kills}</b></div>
    <div><span>LEVEL</span><b>${G.p.lvl}</b></div><div><span>SCORE</span><b>${score()}${rec ? ' ★' : ''}</b></div>`;
  $('overLoadout').innerHTML = loadoutHTML();
  show('over');
}
function gameOver() {
  if (G.state !== 'play') return;
  G.state = 'over';
  SFX.play('lose');
  endScreen(false);
}
function victory() {
  G.state = 'over';
  SFX.play('win');
  endScreen(true);
}
function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'paused';
  $('pauseLoadout').innerHTML = loadoutHTML();
  show('pause');
}
function resumeGame() { if (G.state !== 'paused') return; hide('pause'); G.state = 'play'; }
function toTitle() {
  for (const s of ['pause', 'over', 'levelup']) hide(s);
  G.state = 'title';
  renderBest();
  show('title');
}
function startRun(id) {
  SFX.init();
  hide('title'); hide('over');
  G.lastChar = id;
  newRun(id);
}
function onKey(e) {
  if (e.code === 'KeyM') { const m = SFX.toggleMute(); $('muteBtn').classList.toggle('off', m); }
  if (G.state === 'play' && (e.code === 'Escape' || e.code === 'KeyP')) pauseGame();
  else if (G.state === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) resumeGame();
  else if (G.state === 'levelup' && /^Digit[1-4]$/.test(e.code)) choose(+e.code.slice(5) - 1);
  else if (G.state === 'title' && /^Digit[1-4]$/.test(e.code)) startRun(SQUAD[+e.code.slice(5) - 1].id);
  else if (G.state === 'over' && (e.code === 'Enter' || e.code === 'Space')) startRun(G.lastChar);
  if (DEBUG && G.state === 'play') {
    if (e.code === 'BracketRight') { G.t += 60; for (const ev of G.events) if (ev.t < G.t - 5) ev.done = true; }
    if (e.code === 'KeyL') G.pendingLevels++;
    if (e.code === 'KeyK') for (const en of G.enemies) hurtEnemy(en, 1e6, 0, 0, 0);
    if (e.code === 'KeyG') G.p.hp = G.p.maxHp = 9999;
  }
}

function renderBest() {
  const b = loadBest();
  $('best').innerHTML = b ? `BEST: <b>${b.score}</b> · ${fmtTime(b.time)} · ${b.kills} kills${b.win ? ' · QUEEN SLAIN' : ''}` : '';
}
function buildTitle() {
  const box = $('squad');
  SQUAD.forEach((c, i) => {
    const W0 = WEAPONS[c.weapon];
    const el = document.createElement('button');
    el.className = 'card squad';
    el.innerHTML = `<div class="badge" style="--c:${W0.color}">${W0.code}</div>
      <div class="cbody"><div class="ctag">${c.role}</div><div class="cname">${c.name}</div>
      <div class="cdesc"><b style="color:${W0.color}">${W0.name}</b> · ${c.hp} HP<br>${c.desc}</div></div><div class="ckey">${i + 1}</div>`;
    el.addEventListener('click', () => startRun(c.id));
    box.appendChild(el);
  });
  renderBest();
  $('resumeBtn').addEventListener('click', resumeGame);
  $('quitBtn').addEventListener('click', toTitle);
  $('againBtn').addEventListener('click', () => startRun(G.lastChar));
  $('menuBtn').addEventListener('click', toTitle);
  $('muteBtn').addEventListener('click', () => { SFX.init(); const m = SFX.toggleMute(); $('muteBtn').classList.toggle('off', m); });
  $('pauseBtn').addEventListener('click', () => (G.state === 'paused' ? resumeGame() : pauseGame()));
}
let bannerTimer = 0;
function banner(text, color = '#e8c547', dur = 2.6) {
  const el = $('banner');
  el.textContent = text;
  el.style.color = color;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), dur * 1000);
}

// ---------- Render ----------
function worldTransform(c, scale) {
  c.setTransform(scale * ZOOM, 0, 0, scale * ZOOM, scale * (W / 2 - G.cam.x * ZOOM), scale * (H / 2 - G.cam.y * ZOOM));
}

function render(dt) {
  const T = G.real;
  // camera
  if (G.p && G.state !== 'title') {
    G.cam.x += (G.p.x - G.cam.x) * Math.min(1, dt * 10);
    G.cam.y += (G.p.y - G.cam.y) * Math.min(1, dt * 10);
  } else { G.cam.x += dt * 30; G.cam.y += dt * 12; }
  const cx = G.cam.x, cy = G.cam.y;
  if (G.shake > 0) { G.cam.x += rand(-1, 1) * G.shake; G.cam.y += rand(-1, 1) * G.shake; G.shake = Math.max(0, G.shake - dt * 30); }

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#050607';
  ctx.fillRect(0, 0, W, H);
  worldTransform(ctx, DPR);
  const hw = halfW(), hh = halfH();
  const x0 = Math.floor((G.cam.x - hw) / TILE), x1 = Math.floor((G.cam.x + hw) / TILE);
  const y0 = Math.floor((G.cam.y - hh) / TILE), y1 = Math.floor((G.cam.y + hh) / TILE);
  for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) ctx.drawImage(Tiles.at(ix, iy), ix * TILE, iy * TILE, TILE + 0.5, TILE + 0.5);

  const lamps = [];
  for (let rx = Math.floor(x0 / ROOM) - 1; rx <= Math.floor(x1 / ROOM) + 1; rx++)
    for (let ry = Math.floor(y0 / ROOM) - 1; ry <= Math.floor(y1 / ROOM) + 1; ry++) {
      const l = lampAt(rx, ry);
      if (l) lamps.push(l);
    }
  for (const l of lamps) {
    ctx.fillStyle = '#0c0e10'; ctx.fillRect(l.x - 7, l.y - 7, 14, 14);
    ctx.fillStyle = l.red ? '#5a1010' : '#5a5a48'; circle(ctx, l.x, l.y, 4);
  }

  if (G.state !== 'title') drawWorld(T);

  // darkness
  renderLight(T, lamps);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(lightC, 0, 0, W, H);
  if (G.state !== 'title') drawNightVision(T);

  // emissive pass
  worldTransform(ctx, DPR);
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lamps) {
    const a = l.red ? 0.35 + 0.35 * Math.max(0, Math.sin(T * 3 + l.ph)) : 0.25 * (Math.sin(T * 23 + l.ph) > -0.8 ? 1 : 0.2);
    ctx.globalAlpha = a;
    ctx.drawImage(glowSpr(l.red ? 'rgba(255,40,30,.9)' : 'rgba(200,220,255,.7)'), l.x - 120, l.y - 120, 240, 240);
  }
  ctx.globalAlpha = 1;
  if (G.state !== 'title') drawEmissive(T);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  if (G.state !== 'title') {
    drawTexts();
    drawHUD(T);
  }
  G.cam.x = cx; G.cam.y = cy;
}

function drawWorld(T) {
  const p = G.p;
  for (const d of G.decals) drawDecal(d, T);
  for (const q of G.pools) {
    const f = Math.min(1, q.life / q.max * 2);
    ctx.fillStyle = `rgba(120,170,20,${0.35 * f})`;
    circle(ctx, q.x, q.y, q.r);
  }
  for (const it of G.items) drawItem(ctx, it, T);
  for (const e of G.enemies) if (e.type === 'egg') drawEgg(ctx, e, T);
  for (const s of G.sentries) drawSentry(ctx, s, T);
  for (const e of G.enemies) {
    if (e.type === 'egg' || e.state === 'latch') continue;
    if (e.type === 'larva') drawLarva(ctx, e);
    else if (e.type === 'leaper') drawLeaper(ctx, e);
    else drawXeno(ctx, e, T);
    if ((e.type === 'praetorian' || e.type === 'queen') && e.state === 'wind') {
      ctx.strokeStyle = `rgba(255,40,30,${0.4 + 0.4 * Math.sin(T * 30)})`; ctx.lineWidth = e.r * 0.8;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.cdir) * 360, e.y + Math.sin(e.cdir) * 360); ctx.stroke();
    }
  }
  drawMarine(ctx, p, T);
  for (const e of G.enemies) if (e.state === 'latch') drawLeaper(ctx, e);
  for (const w of p.weapons) if (w.id === 'drone' && w.pos) for (const d of w.pos) drawDrone(ctx, d.x, d.y, T);
  for (const n of G.nades) {
    if (n.t < 0) continue;
    drawShadow(ctx, n.x - 2, n.y - 4, 4, 2.5);
    ctx.fillStyle = '#3c4a2a'; circle(ctx, n.x, n.y - n.z, 4);
  }
}

function drawDecal(d, T) {
  if (d.kind === 'splat') {
    const r = seeded(d.seed);
    ctx.fillStyle = 'rgba(95,120,20,.45)';
    for (let i = 0; i < 6; i++) { const a = r() * TAU, dd = r() * d.r; circle(ctx, d.x + Math.cos(a) * dd, d.y + Math.sin(a) * dd, d.r * (0.2 + r() * 0.35)); }
  } else if (d.kind === 'egg') {
    drawEggShape(ctx, d.x, d.y, d.r, 1, d.seed, T, true);
    if (d.broken) { ctx.fillStyle = 'rgba(95,120,20,.5)'; circle(ctx, d.x, d.y, d.r * 0.7); }
  } else if (d.kind === 'scorch') {
    ctx.globalAlpha = 0.5; ctx.drawImage(glowSpr('rgba(0,0,0,.9)'), d.x - d.r, d.y - d.r, d.r * 2, d.r * 2); ctx.globalAlpha = 1;
  } else if (d.kind === 'resin') {
    const r = seeded(d.seed);
    ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const a = r() * TAU, dd = r() * d.r;
      const x = d.x + Math.cos(a) * dd, y = d.y + Math.sin(a) * dd;
      ctx.strokeStyle = r() < 0.5 ? 'rgba(14,18,14,.85)' : 'rgba(26,32,27,.85)';
      ctx.lineWidth = 4 + r() * 8;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + r() * 50 - 25, y + r() * 50 - 25, d.x + (r() - 0.5) * 20, d.y + (r() - 0.5) * 20);
      ctx.stroke();
    }
  }
}

function renderLight(T, lamps) {
  const p = G.p;
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.globalAlpha = 1;
  lctx.clearRect(0, 0, lightC.width, lightC.height);
  const nv = G.state === 'title' ? 0 : nvLevel(T);
  lctx.fillStyle = `rgba(2,4,6,${0.67 * (1 - 0.8 * nv)})`;
  lctx.fillRect(0, 0, lightC.width, lightC.height);
  lctx.globalCompositeOperation = 'destination-out';
  worldTransform(lctx, LIGHT_SCALE);
  const cut = (x, y, r, a) => { lctx.globalAlpha = a; lctx.drawImage(LightSpr, x - r, y - r, r * 2, r * 2); };
  for (const l of lamps) cut(l.x, l.y, 150, l.red ? 0.3 + 0.3 * Math.max(0, Math.sin(T * 3 + l.ph)) : 0.45);
  if (G.state === 'title') {
    cut(G.cam.x, G.cam.y, 260 + Math.sin(T * 7) * 6, 0.85);
    return;
  }
  const flick = Math.sin(T * 31) > 0.96 ? 0.85 : 1;
  cut(p.x, p.y, 290, 0.95 * flick);
  lctx.save();
  lctx.translate(p.x, p.y); lctx.rotate(p.aim);
  lctx.globalAlpha = 0.95 * flick;
  lctx.drawImage(ConeSpr, 0, -CONE_L / 2);
  lctx.restore();
  for (const l of G.lights) cut(l.x, l.y, l.r, l.a * (l.life / l.max));
  for (const q of G.pools) cut(q.x, q.y, q.r * 2, 0.3);
  for (const b of G.ebullets) cut(b.x, b.y, 30, 0.4);
  let k = 0;
  for (const b of G.bullets) if (b.kind === 'flame' && (k++ & 3) === 0) cut(b.x, b.y, b.r * 4, 0.5);
  for (const s of G.sentries) cut(s.x, s.y, 70, 0.5);
  for (const f of G.fx) if (f.kind === 'boom') cut(f.x, f.y, f.r * 2.5, f.life / f.max);
}

// Phosphor-green goggle look: tint everything, lift the blacks, darken the lens edges.
function drawNightVision(T) {
  const nv = nvLevel(T);
  if (nv <= 0) return;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${Math.round(255 - 165 * nv)},255,${Math.round(255 - 155 * nv)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(20,70,24,${0.55 * nv})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  gr.addColorStop(0, 'rgba(0,10,0,0)'); gr.addColorStop(1, `rgba(0,10,0,${0.7 * nv})`);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
}

function drawEmissive(T) {
  const p = G.p;
  for (const g of G.gems) {
    const c = g.v >= 20 ? 'rgba(255,90,240,.8)' : g.v >= 5 ? 'rgba(80,215,255,.8)' : 'rgba(120,255,100,.8)';
    const s = g.v >= 20 ? 7 : g.v >= 5 ? 5.5 : 4;
    ctx.globalAlpha = 0.5;
    ctx.drawImage(glowSpr(c), g.x - s * 3, g.y - s * 3, s * 6, s * 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(g.x, g.y - s); ctx.lineTo(g.x + s * 0.6, g.y); ctx.lineTo(g.x, g.y + s); ctx.lineTo(g.x - s * 0.6, g.y); ctx.fill();
  }
  for (const it of G.items) {
    ctx.globalAlpha = 0.4 + 0.2 * Math.sin(T * 5);
    ctx.drawImage(glowSpr(ITEM_LOOK[it.kind].glow), it.x - 30, it.y - 30, 60, 60);
  }
  ctx.globalAlpha = 1;
  for (const q of G.pools) {
    ctx.globalAlpha = 0.35 * Math.min(1, (q.life / q.max) * 2);
    ctx.drawImage(glowSpr('rgba(170,255,40,.8)'), q.x - q.r * 1.4, q.y - q.r * 1.4, q.r * 2.8, q.r * 2.8);
  }
  ctx.globalAlpha = 1;
  for (const e of G.enemies) {
    if (e.type === 'spitter' || e.burn > 0) {
      ctx.globalAlpha = e.burn > 0 ? 0.6 : 0.25;
      ctx.drawImage(glowSpr(e.burn > 0 ? 'rgba(255,120,30,.8)' : 'rgba(150,255,60,.7)'), e.x - e.r * 2, e.y - e.r * 2, e.r * 4, e.r * 4);
    }
  }
  ctx.globalAlpha = 1;
  // bullets
  ctx.lineCap = 'round';
  for (const b of G.bullets) {
    if (b.kind === 'flame') {
      const f = 1 - b.life / b.max;
      ctx.globalAlpha = 0.55 * (1 - f * 0.7);
      const col = f < 0.3 ? 'rgba(255,230,140,.9)' : f < 0.65 ? 'rgba(255,140,40,.9)' : 'rgba(200,60,20,.8)';
      ctx.drawImage(glowSpr(col), b.x - b.r * 1.6, b.y - b.r * 1.6, b.r * 3.2, b.r * 3.2);
      continue;
    }
    const col = b.kind === 'smart' ? '#ff6a5a' : b.kind === 'bolt' ? '#60f0d0' : b.kind === 'pellet' ? '#ffcf70' : '#ffe08a';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = b.kind === 'bolt' ? 3 : 2.2;
    const tl = b.kind === 'pellet' ? 0.012 : 0.022;
    ctx.beginPath(); ctx.moveTo(b.x - b.vx * tl, b.y - b.vy * tl); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const b of G.ebullets) {
    ctx.drawImage(glowSpr('rgba(170,255,40,.9)'), b.x - b.r * 2.2, b.y - b.r * 2.2, b.r * 4.4, b.r * 4.4);
    ctx.fillStyle = '#d8ff70'; circle(ctx, b.x, b.y, b.r * 0.55);
  }
  for (const n of G.nades) if (n.t >= 0) { ctx.globalAlpha = 0.6; ctx.drawImage(glowSpr('rgba(160,255,80,.6)'), n.x - 10, n.y - n.z - 10, 20, 20); }
  ctx.globalAlpha = 1;
  for (const q of G.parts) {
    const a = q.life / q.max;
    if (q.color === 'smoke') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a * 0.35;
      ctx.drawImage(glowSpr('rgba(40,40,40,.9)'), q.x - q.size * (2 - a), q.y - q.size * (2 - a), q.size * (4 - 2 * a), q.size * (4 - 2 * a));
      ctx.globalCompositeOperation = 'lighter';
      continue;
    }
    ctx.globalAlpha = q.glow ? a : a * 0.8;
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
  for (const f of G.fx) {
    const a = f.life / f.max;
    if (f.kind === 'boom') {
      const r = f.r * (1.1 - a * 0.6);
      ctx.globalAlpha = a;
      ctx.drawImage(glowSpr('rgba(255,170,60,.95)'), f.x - r * 1.3, f.y - r * 1.3, r * 2.6, r * 2.6);
      ctx.strokeStyle = `rgba(255,220,150,${a})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();
    } else if (f.kind === 'bolt') {
      ctx.globalAlpha = a;
      for (const [w, c] of [[6, 'rgba(140,100,255,.5)'], [2, '#efe8ff']]) {
        ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath(); f.pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.stroke();
      }
    } else if (f.kind === 'ring') {
      ctx.globalAlpha = a;
      ctx.strokeStyle = `rgba(${f.color},${a})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, f.r * (1 - a) + 10, 0, TAU); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawTexts() {
  ctx.font = 'bold 11px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  for (const t of G.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 3);
    ctx.fillStyle = '#000'; ctx.fillText(t.txt, t.x + 1, t.y + 1);
    ctx.fillStyle = '#f2f2e0'; ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawHUD(T) {
  const p = G.p;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const small = W < 640;
  // hurt vignette
  const low = p.hp / p.maxHp < 0.3 ? 0.25 + 0.15 * Math.sin(T * 6) : 0;
  const hv = Math.max(G.hurtFlash * 1.6, low);
  if (hv > 0) {
    const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, `rgba(200,0,0,${Math.min(0.6, hv)})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  G.hurtFlash = Math.max(0, G.hurtFlash - 1 / 60);
  for (const f of G.fx) if (f.kind === 'flash') { ctx.fillStyle = `rgba(255,250,230,${f.life / f.max})`; ctx.fillRect(0, 0, W, H); }

  // XP bar
  ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 0, W, 10);
  ctx.fillStyle = '#4fd8ff'; ctx.fillRect(0, 0, W * Math.min(1, p.xp / p.next), 10);
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, 0, W * Math.min(1, p.xp / p.next), 3);
  ctx.font = 'bold 11px "Share Tech Mono", monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#d8f8ff'; ctx.fillText(`LV ${p.lvl}`, W - 8, 13);

  // vitals
  const x = 12, y = 18, bw = small ? 130 : 190;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9fe870'; ctx.fillText(`${p.char.name.toUpperCase()} · VITALS`, x, y);
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x, y + 15, bw, 10);
  const hf = Math.max(0, p.hp / p.maxHp);
  ctx.fillStyle = hf > 0.5 ? '#6fdc5a' : hf > 0.25 ? '#e8c547' : '#ff4a3a';
  ctx.fillRect(x, y + 15, bw * hf, 10);
  ctx.strokeStyle = 'rgba(159,232,112,.5)'; ctx.strokeRect(x + 0.5, y + 15.5, bw, 10);
  const hpTxt = `${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}`;
  if (small) { ctx.font = 'bold 9px "Share Tech Mono", monospace'; ctx.fillStyle = '#061006'; ctx.fillText(hpTxt, x + 3, y + 15.5); ctx.font = 'bold 11px "Share Tech Mono", monospace'; }
  else { ctx.fillStyle = '#e8f0e0'; ctx.fillText(hpTxt, x + bw + 6, y + 14); }

  // loadout
  const sz = small ? 22 : 26;
  p.weapons.forEach((w, i) => slot(x + i * (sz + 4), y + 32, sz, WEAPONS[w.id].code, WEAPONS[w.id].color, w.lvl, WEAPONS[w.id].max, false));
  Object.entries(p.passives).forEach(([id, l], i) => slot(x + i * (sz + 4), y + 36 + sz, sz, PASSIVES[id].code, '#9fe870', l, PASSIVES[id].max, true));

  // night vision battery
  if (G.nv > 0) {
    const ny = y + 44 + sz * 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8aff6a'; ctx.fillText(`NV ${Math.ceil(G.nv)}s`, x, ny);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x + 50, ny + 3, 80, 6);
    ctx.fillStyle = '#8aff6a'; ctx.fillRect(x + 50, ny + 3, 80 * Math.min(1, G.nv / NV_DUR), 6);
  }

  // clock
  ctx.textAlign = 'center';
  ctx.font = `bold ${small ? 20 : 26}px "Share Tech Mono", monospace`;
  ctx.fillStyle = G.t >= QUEEN_TIME - 60 && !G.queenDead ? '#ff6a4a' : '#e8f0e0';
  ctx.fillText(fmtTime(G.t), W / 2, 16);
  ctx.font = '12px "Share Tech Mono", monospace';
  ctx.fillStyle = '#9fb0a0';
  ctx.fillText(`☠ ${G.kills}`, W / 2, small ? 40 : 46);

  if (p.latched > 0) {
    ctx.font = 'bold 14px "Share Tech Mono", monospace'; ctx.fillStyle = Math.floor(T * 6) % 2 ? '#ff4a3a' : '#ffd0c0';
    ctx.fillText('LATCHED! SLOWED', W / 2, H / 2 + 34);
  }

  // boss bar
  const boss = G.bosses[0];
  if (boss) {
    // clear the corner buttons (bottom-left) and the tracker (bottom-right)
    const bw2 = Math.min(520, small ? W - 40 : W - 340), bx = (W - bw2) / 2, by = H - (small ? 150 : 46);
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(bx, by, bw2, 12);
    ctx.fillStyle = '#c0283a'; ctx.fillRect(bx, by, bw2 * Math.max(0, boss.hp / boss.maxHp), 12);
    ctx.strokeStyle = '#ff6a6a'; ctx.strokeRect(bx + 0.5, by + 0.5, bw2, 12);
    ctx.font = 'bold 12px "Share Tech Mono", monospace'; ctx.fillStyle = '#ffd0d0';
    ctx.fillText(boss.def.name.toUpperCase() + (G.bosses.length > 1 ? `  ×${G.bosses.length}` : ''), W / 2, by - 15);
  }

  drawTracker(T, small);

  if (stick.active) {
    ctx.strokeStyle = 'rgba(159,232,112,.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(stick.ox, stick.oy, 50, 0, TAU); ctx.stroke();
    const sx = stick.x - stick.ox, sy = stick.y - stick.oy, sl = Math.hypot(sx, sy), m = Math.min(1, 50 / (sl || 1));
    ctx.fillStyle = 'rgba(159,232,112,.4)'; circle(ctx, stick.ox + sx * m, stick.oy + sy * m, 18);
  }
}
function slot(x, y, s, code, color, lvl, max, round) {
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.strokeStyle = color; ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (round) ctx.roundRect(x, y, s, s, s / 2); else ctx.rect(x, y, s, s);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(s * 0.42)}px "Share Tech Mono", monospace`;
  ctx.fillText(code, x + s / 2, y + s / 2 - 1);
  ctx.textBaseline = 'top';
  const pw = s / max;
  for (let i = 0; i < max; i++) { ctx.fillStyle = i < lvl ? color : 'rgba(255,255,255,.12)'; ctx.fillRect(x + i * pw + 0.5, y + s - 3, pw - 1, 2); }
}

function drawTracker(T, small) {
  const p = G.p;
  const R = small ? 54 : 70, cx = W - R - 14, cy = H - R - 14, TR = 650;
  ctx.fillStyle = 'rgba(4,16,9,.85)'; circle(ctx, cx, cy, R);
  ctx.strokeStyle = 'rgba(80,200,110,.35)'; ctx.lineWidth = 1;
  for (const f of [1 / 3, 2 / 3]) { ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, TAU); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  ctx.strokeStyle = '#3fae5c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  const ph = ((G.t - G.lastPing) / 1.3) % 1;
  ctx.strokeStyle = `rgba(150,255,170,${0.6 * (1 - ph)})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, ph * R, 0, TAU); ctx.stroke();
  let nd = Infinity, n = 0;
  for (const e of G.enemies) {
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    if (d > TR) continue;
    if (d < nd && e.type !== 'egg') nd = d;
    if (n++ > 260) continue;
    const dr = d / TR;
    const lit = Math.max(0, 1 - ((ph - dr + 1) % 1) * 2.2);
    ctx.fillStyle = e.def.boss ? `rgba(255,120,110,${0.35 + 0.65 * lit})` : `rgba(200,255,210,${0.2 + 0.8 * lit})`;
    const s = e.def.boss ? 4.5 : e.type === 'egg' ? 1.6 : 2.4;
    ctx.fillRect(cx + (dx / TR) * R - s / 2, cy + (dy / TR) * R - s / 2, s, s);
  }
  ctx.fillStyle = '#9fe870';
  ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + 3, cy + 3); ctx.lineTo(cx - 3, cy + 3); ctx.fill();
  ctx.font = `bold ${small ? 13 : 16}px "Share Tech Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = nd < 200 ? '#ff6a4a' : '#9fe870';
  ctx.fillText(nd === Infinity ? '--' : `${Math.round(nd / 12)}m`, cx, cy - R - 20);
}

// ---------- Main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.real += dt;
  if (G.state === 'play') update(dt);
  render(G.state === 'play' || G.state === 'title' ? dt : 0);
  requestAnimationFrame(frame);
}
buildTitle();
requestAnimationFrame(frame);
