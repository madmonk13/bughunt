'use strict';
// ===== Shared utilities =====
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function weighted(table) {
  let total = 0;
  for (const [, w] of table) total += w;
  let r = Math.random() * total;
  for (const [k, w] of table) { if ((r -= w) <= 0) return k; }
  return table[0][0];
}

// ===== Weapons =====
// up[i] describes what reaching level i+1 does (up[0] is the "new weapon" blurb).
const WEAPONS = {
  pulse: {
    name: 'Pulse Rifle', code: 'PR', color: '#e8c547', max: 8,
    up: ['Standard-issue caseless rifle. Fires bursts at the nearest hostile.', '+1 round per burst', '+40% damage', '-20% cooldown',
      'Rounds pierce +1 target', '+2 rounds per burst', '+50% damage', 'Underbarrel grenade every 3rd burst'],
    stats: (l) => ({ dmg: 11 * (l >= 3 ? 1.4 : 1) * (l >= 7 ? 1.5 : 1), rounds: 3 + (l >= 2) + (l >= 6 ? 2 : 0),
      cd: 1.0 * (l >= 4 ? 0.8 : 1), pierce: 1 + (l >= 5), nade: l >= 8 }),
  },
  shotgun: {
    name: 'Combat Shotgun', code: 'SG', color: '#f0a050', max: 8,
    up: ['Close-range 12-gauge. Wide spread with heavy knockback.', '+2 pellets', '+35% damage', '-20% cooldown',
      '+2 pellets', '+30% range, pellets pierce +1', '+50% damage', '-25% cooldown'],
    stats: (l) => ({ dmg: 8 * (l >= 3 ? 1.35 : 1) * (l >= 7 ? 1.5 : 1), pellets: 6 + (l >= 2 ? 2 : 0) + (l >= 5 ? 2 : 0),
      cd: 1.35 * (l >= 4 ? 0.8 : 1) * (l >= 8 ? 0.75 : 1), range: l >= 6 ? 1.3 : 1, pierce: 1 + (l >= 6) }),
  },
  flamer: {
    name: 'Flamethrower', code: 'FT', color: '#ff6a2a', max: 8,
    up: ['Hoses down anything that gets close. Flames pass through the swarm.', '+25% range', '+30% damage', 'Wider cone',
      'Sets bugs on fire', '+25% range', '+40% damage', 'Napalm: burn damage doubled'],
    stats: (l) => ({ dmg: 2 * (l >= 3 ? 1.3 : 1) * (l >= 7 ? 1.4 : 1), range: 1 + (l >= 2 ? 0.25 : 0) + (l >= 6 ? 0.25 : 0),
      spread: l >= 4 ? 0.55 : 0.35, burn: l >= 5 ? (l >= 8 ? 16 : 8) : 0, rate: 0.045 }),
  },
  smart: {
    name: 'Smart Gun', code: 'SM', color: '#ff5a5a', max: 8,
    up: ['Gyro-stabilized auto-tracking cannon. Rounds seek their own targets.', '+1 round per volley', '+30% damage', '-25% cooldown',
      '+1 round per volley', 'Rounds pierce +1 target', '+40% damage', '-30% cooldown'],
    stats: (l) => ({ dmg: 10 * (l >= 3 ? 1.3 : 1) * (l >= 7 ? 1.4 : 1), shots: 2 + (l >= 2) + (l >= 5),
      cd: 0.7 * (l >= 4 ? 0.75 : 1) * (l >= 8 ? 0.7 : 1), pierce: 1 + (l >= 6) }),
  },
  grenade: {
    name: 'Grenade Launcher', code: 'GL', color: '#9be050', max: 8,
    up: ['Lobs high-explosive rounds into the thick of the swarm.', '+1 grenade', '+40% damage', '+25% blast radius',
      '+1 grenade', '+25% blast radius', '+50% damage', '+1 grenade, -20% cooldown'],
    stats: (l) => ({ dmg: 28 * (l >= 3 ? 1.4 : 1) * (l >= 7 ? 1.5 : 1), count: 1 + (l >= 2) + (l >= 5) + (l >= 8),
      radius: 58 * (l >= 4 ? 1.25 : 1) * (l >= 6 ? 1.25 : 1), cd: 2.6 * (l >= 8 ? 0.8 : 1) }),
  },
  sentry: {
    name: 'Sentry Gun', code: 'SN', color: '#5ac8f0', max: 8,
    up: ['Deploys an automated turret that shreds anything in range.', '+30% damage', '+3s deployment time', '+33% fire rate',
      '+40% damage', '+3s deployment time', '+1 sentry per deployment', '+50% damage'],
    stats: (l) => ({ dmg: 8 * (l >= 2 ? 1.3 : 1) * (l >= 5 ? 1.4 : 1) * (l >= 8 ? 1.5 : 1), dur: 7 + (l >= 3 ? 3 : 0) + (l >= 6 ? 3 : 0),
      rate: 0.16 * (l >= 4 ? 0.75 : 1), count: 1 + (l >= 7), cd: 10, range: 300 }),
  },
  drone: {
    name: 'Combat Drone', code: 'DR', color: '#60f0d0', max: 8,
    up: ['An orbiting drone that zaps nearby bugs and rams anything it touches.', '+1 drone', '+40% damage', '+1 drone',
      '-30% fire cooldown', '+40% damage', '+1 drone', 'Drones fire twin bolts'],
    stats: (l) => ({ dmg: 9 * (l >= 3 ? 1.4 : 1) * (l >= 6 ? 1.4 : 1), count: 1 + (l >= 2) + (l >= 4) + (l >= 7),
      cd: 0.9 * (l >= 5 ? 0.7 : 1), twin: l >= 8 }),
  },
  arc: {
    name: 'Arc Emitter', code: 'AE', color: '#b090ff', max: 8,
    up: ['Experimental tesla coil. Lightning chains from bug to bug.', '+1 chain jump', '+35% damage', '-20% cooldown',
      '+2 chain jumps', 'Fires 2 bolts', '+50% damage', '-25% cooldown'],
    stats: (l) => ({ dmg: 14 * (l >= 3 ? 1.35 : 1) * (l >= 7 ? 1.5 : 1), chains: 3 + (l >= 2) + (l >= 5 ? 2 : 0),
      cd: 1.7 * (l >= 4 ? 0.8 : 1) * (l >= 8 ? 0.75 : 1), bolts: l >= 6 ? 2 : 1, range: 240 }),
  },
};

const PASSIVES = {
  armor: { name: 'Body Armor', code: 'AR', max: 5, desc: '-8% damage taken' },
  stims: { name: 'Combat Stims', code: 'RX', max: 5, desc: 'Regenerate +0.25 HP/sec' },
  optics: { name: 'Targeting Optics', code: 'OP', max: 5, desc: '+10% weapon damage' },
  loader: { name: 'Auto-Loader', code: 'AL', max: 5, desc: '-7% weapon cooldowns' },
  boots: { name: 'Servo Boots', code: 'SB', max: 5, desc: '+8% movement speed' },
  harness: { name: 'Mag Harness', code: 'MH', max: 5, desc: '+35% pickup radius' },
  mags: { name: 'Extended Mags', code: 'XM', max: 2, desc: '+1 projectile for every weapon' },
  ordnance: { name: 'Heavy Ordnance', code: 'HO', max: 5, desc: '+10% blast area & range' },
  condition: { name: 'Conditioning', code: 'HP', max: 5, desc: '+20 max HP' },
};

// ===== Hostiles, smallest to largest =====
const ENEMIES = {
  egg:        { name: 'Egg',        hp: 18,    speed: 0,   r: 13, dmg: 0,  xp: 2 },
  larva:      { name: 'Larva',      hp: 6,     speed: 105, r: 7,  dmg: 5,  xp: 1 },
  leaper:     { name: 'Leaper',     hp: 9,     speed: 62,  r: 9,  dmg: 6,  xp: 2 },
  drone:      { name: 'Drone',      hp: 22,    speed: 66,  r: 12, dmg: 10, xp: 2 },
  runner:     { name: 'Runner',     hp: 16,    speed: 128, r: 10, dmg: 8,  xp: 3 },
  spitter:    { name: 'Spitter',    hp: 34,    speed: 58,  r: 13, dmg: 7,  xp: 5, acid: true },
  warrior:    { name: 'Warrior',    hp: 85,    speed: 76,  r: 16, dmg: 16, xp: 8, acid: true },
  praetorian: { name: 'Praetorian', hp: 1100,  speed: 64,  r: 28, dmg: 28, xp: 60, boss: true, acid: true },
  queen:      { name: 'The Queen',  hp: 14000, speed: 46,  r: 50, dmg: 40, xp: 0, boss: true, acid: true },
};

const SQUAD = [
  { id: 'hale', name: 'Cpl. Hale', role: 'Rifleman', weapon: 'pulse', hp: 100, speed: 1,
    desc: 'Balanced all-rounder.' },
  { id: 'ortega', name: 'Pvt. Ortega', role: 'Smart Gunner', weapon: 'smart', hp: 120, speed: 0.94, armor: 0.05,
    desc: 'Heavy harness: +20 HP, +5% armor, a little slower.' },
  { id: 'brandt', name: 'Sgt. Brandt', role: 'Incinerator', weapon: 'flamer', hp: 110, speed: 1, armor: 0.1,
    desc: 'Fire-resistant suit: +10 HP, +10% armor.' },
  { id: 'okafor', name: 'Tech Okafor', role: 'Combat Tech', weapon: 'drone', hp: 90, speed: 1.06, cd: 0.92,
    desc: 'Gadgeteer: -8% cooldowns, faster, fragile.' },
];

// Scripted moments on the mission clock (seconds).
const EVENTS = [
  { t: 1, msg: ['DROPSHIP AWAY. SWEEP THE COLONY.', '#9fe870'] },
  { t: 60, msg: ['MOTION TRACKER: MULTIPLE SIGNALS', '#e8c547'], swarm: ['larva', 30] },
  { t: 150, msg: ["THEY'RE COMING OUT OF THE WALLS!", '#ff6a4a'], swarm: ['drone', 40] },
  { t: 300, msg: ['BIG SIGNAL. REAL BIG. — PRAETORIAN', '#ff4a3a'], boss: 'praetorian', n: 1 },
  { t: 390, msg: ['FAST MOVERS INBOUND', '#e8c547'], swarm: ['runner', 45] },
  { t: 480, msg: ['ACID SPITTERS IN THE VENTS', '#b8f040'], swarm: ['spitter', 18] },
  { t: 600, msg: ['TWO PRAETORIANS — STAND YOUR GROUND', '#ff4a3a'], boss: 'praetorian', n: 2 },
  { t: 720, msg: ['WARRIOR PACK CLOSING IN', '#ff6a4a'], swarm: ['warrior', 32] },
  { t: 840, msg: ['HIVE CORE AHEAD. STAY FROSTY.', '#e8c547'] },
  { t: 900, msg: ['THE QUEEN IS HERE', '#ff2a2a'], boss: 'queen', n: 1 },
];
const QUEEN_TIME = 900;
