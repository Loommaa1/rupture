// Serveur de jeu Rupture
// - sert les fichiers du jeu (dossier public/) et Three.js
// - fait autorité sur les règles : tirs, dégâts, manches, Noyau, économie, capacités
// - fait jouer les bots qui complètent les deux équipes (5 contre 5)
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import * as S from './public/shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use('/three', express.static(path.join(__dirname, 'node_modules/three')));
const http = createServer(app);
const io = new Server(http);
const PORT = +(process.env.PORT || 3200);

const TICK = 20, DT = 1 / TICK;
const R = S.RULES;
// Mode test (manches très courtes) : $env:RAPIDE=1; npm start
if (process.env.RAPIDE) Object.assign(R, { buyTime: 4, roundTime: 30, bombTime: 15, endTime: 3, halfRounds: 2, winRounds: 3, matchEndTime: 5 });
const now = () => Date.now();
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;

const BOT_NAMES = ['Gravier', 'Sirocco', 'Basalte', 'Ardoise', 'Mistral', 'Silex', 'Orage', 'Cobalt', 'Lynx', 'Quartz',
  'Rafale', 'Volt', 'Zéphyr', 'Brasier', 'Grésil', 'Onyx'];
const AGENT_IDS = Object.keys(S.AGENTS);

const players = new Map(); // id -> joueur (humains et bots)
let nextId = 1;
let smokes = [];           // { id, x, y, z, r, until }
let walls = [];            // { id, x1, z1, x2, z2, y1, y2, hp, until, kind }
let heals = [];            // { owner, team, x, z, until }
let pendingFlashes = [];   // { x, y, z, at, owner }

const game = {
  phase: 'waiting',  // waiting | buy | live | planted | end | matchEnd
  timer: 0,
  round: 0,
  score: { braise: 0, givre: 0 },
  attack: 'braise',  // équipe qui attaque
  lossStreak: { braise: 0, givre: 0 },
  bomb: { state: 'none', carrier: null, x: 0, y: 0, z: 0, site: null, timer: 0 },
  botSite: 'A',
  message: '',
  winner: null,
};
const sideOf = (team) => (team === game.attack ? 'attack' : 'defense');
const teamOfSide = (side) => (side === 'attack' ? game.attack : S.otherTeam(game.attack));

// Boîtes qui bloquent : carte + murs de Rocaille
const allBoxes = () => (walls.length ? S.BOXES.concat(walls) : S.BOXES);

// =====================================================================
// Joueurs
// =====================================================================
function freshLoadout(p) {
  p.weapons = { primary: null, secondary: { type: 'dard', mag: S.WEAPONS.dard.mag, reserve: S.WEAPONS.dard.reserve }, melee: { type: 'lame' } };
  p.cur = 'secondary';
  p.armor = 0;
}
function createPlayer({ name, team, agent, isBot, socket = null }) {
  const id = nextId++;
  const p = {
    id, name, team, agent, isBot, socket,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: false, speed: 0, air: false, scoped: false,
    alive: false, hp: 100, armor: 0, money: R.startMoney, weapons: null, cur: 'secondary',
    kills: 0, deaths: 0, lastShot: 0, shots: 0, reloadUntil: 0, seq: 0,
    charges: 0, lastAbility: 0, bought: {}, interact: false, plantP: 0, defuseP: 0, blindUntil: 0,
    lastAttacker: null, ai: {},
  };
  freshLoadout(p);
  players.set(id, p);
  return p;
}
const teamPlayers = (team) => [...players.values()].filter((p) => p.team === team);
const humansIn = (team) => teamPlayers(team).filter((p) => !p.isBot).length;
const humanCount = () => [...players.values()].filter((p) => !p.isBot).length;
const curWeapon = (p) => p.weapons[p.cur] || p.weapons.secondary;

function usedBotName() { return new Set([...players.values()].map((p) => p.name)); }
function addBot(team) {
  const used = usedBotName();
  const name = BOT_NAMES.find((n) => !used.has(n)) || `Bot ${nextId}`;
  const p = createPlayer({ name, team, agent: pick(AGENT_IDS), isBot: true });
  p.alive = false; // il entrera en jeu à la prochaine manche
  return p;
}
function removeBot(team) {
  const bots = teamPlayers(team).filter((p) => p.isBot);
  if (!bots.length) return false;
  const b = bots.find((x) => !x.alive) || bots[0];
  if (game.bomb.carrier === b.id) dropBomb(b);
  players.delete(b.id);
  return true;
}
// Chaque équipe a toujours 5 joueurs : on ajoute ou retire des bots
function balanceBots() {
  for (const team of ['braise', 'givre']) {
    while (teamPlayers(team).length < R.teamSize) addBot(team);
    while (teamPlayers(team).length > R.teamSize && removeBot(team));
  }
}
function roster() {
  io.emit('roster', [...players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, agent: p.agent, isBot: p.isBot })));
}

// =====================================================================
// Manches
// =====================================================================
function spawnPlayer(p, slot) {
  const side = sideOf(p.team);
  const pts = S.SPAWN_POINTS[side];
  const [x, z] = pts[slot % pts.length];
  p.x = x + rand(-0.5, 0.5); p.z = z + rand(-0.5, 0.5); p.y = 0;
  p.yaw = S.SPAWNS[side].yaw; p.pitch = 0;
  p.alive = true; p.hp = 100; p.crouch = false; p.speed = 0;
  p.charges = S.AGENTS[p.agent].charges;
  p.reloadUntil = 0; p.shots = 0; p.interact = false; p.plantP = 0; p.defuseP = 0; p.blindUntil = 0;
  p.bought = {};
  p.ai = {};
  // Les survivants gardent leurs armes ; on remplit les munitions
  for (const k of ['primary', 'secondary']) {
    const w = p.weapons[k];
    if (w) { w.mag = S.WEAPONS[w.type].mag; w.reserve = S.WEAPONS[w.type].reserve; }
  }
  if (!p.weapons.primary) p.cur = 'secondary';
  p.socket?.emit('spawn', { x: p.x, y: p.y, z: p.z, yaw: p.yaw });
}

function startRound() {
  game.round++;
  balanceBots();
  smokes = []; walls = []; heals = []; pendingFlashes = [];
  for (const p of players.values()) if (!p.alive) freshLoadout(p);
  for (const team of ['braise', 'givre']) teamPlayers(team).forEach((p, i) => spawnPlayer(p, i));
  // Le Noyau est confié à un attaquant au hasard
  const attackers = teamPlayers(game.attack);
  const carrier = pick(attackers);
  game.bomb = { state: 'carried', carrier: carrier.id, x: 0, y: 0, z: 0, site: null, timer: 0, defuser: null };
  game.botSite = Math.random() < 0.5 ? 'A' : 'B';
  game.phase = 'buy';
  game.timer = R.buyTime;
  game.winner = null;
  const half = game.round <= R.halfRounds ? 1 : 2;
  game.message = `Manche ${game.round}`;
  for (const p of players.values()) if (p.isBot) botBuy(p);
  assignBotRoles();
  roster();
  io.emit('roundStart', { round: game.round, half, attack: game.attack });
}

function endRound(winnerTeam, reason) {
  if (game.phase === 'end' || game.phase === 'matchEnd') return;
  const loser = S.otherTeam(winnerTeam);
  game.score[winnerTeam]++;
  game.lossStreak[winnerTeam] = 0;
  const lossPay = Math.min(R.lossMax, R.lossReward + R.lossBonus * game.lossStreak[loser]);
  game.lossStreak[loser]++;
  for (const p of players.values()) {
    p.interact = false; p.plantP = 0; p.defuseP = 0;
    p.money = Math.min(R.maxMoney, p.money + (p.team === winnerTeam ? R.winReward : lossPay));
  }
  game.winner = winnerTeam;
  game.message = reason;
  game.phase = 'end';
  game.timer = R.endTime;
  io.emit('roundEnd', { winner: winnerTeam, reason, score: game.score, lossPay });
}

function afterRoundEnd() {
  const { braise, givre } = game.score;
  if (braise >= R.winRounds || givre >= R.winRounds) {
    game.phase = 'matchEnd';
    game.timer = R.matchEndTime;
    game.winner = braise > givre ? 'braise' : 'givre';
    io.emit('matchEnd', { winner: game.winner, score: game.score });
    return;
  }
  if (game.round === R.halfRounds) {
    // Mi-temps : on échange les côtés et on remet l'économie à zéro
    game.attack = S.otherTeam(game.attack);
    game.lossStreak = { braise: 0, givre: 0 };
    for (const p of players.values()) { p.money = R.startMoney; p.alive = false; }
    io.emit('halftime', { attack: game.attack });
  }
  startRound();
}

function resetMatch() {
  game.round = 0;
  game.score = { braise: 0, givre: 0 };
  game.lossStreak = { braise: 0, givre: 0 };
  game.attack = 'braise';
  for (const p of players.values()) { p.money = R.startMoney; p.alive = false; p.kills = 0; p.deaths = 0; }
  startRound();
}

function checkRoundOver() {
  if (game.phase !== 'live' && game.phase !== 'planted') return;
  const attAlive = teamPlayers(game.attack).some((p) => p.alive);
  const defAlive = teamPlayers(S.otherTeam(game.attack)).some((p) => p.alive);
  if (!defAlive) endRound(game.attack, 'Tous les défenseurs sont éliminés');
  else if (!attAlive && game.phase === 'live') endRound(S.otherTeam(game.attack), 'Tous les attaquants sont éliminés');
}

// =====================================================================
// Le Noyau (l'engin à poser)
// =====================================================================
function dropBomb(p) {
  if (game.bomb.carrier !== p.id) return;
  game.bomb.state = 'dropped';
  game.bomb.carrier = null;
  game.bomb.x = p.x; game.bomb.y = S.groundAt(p.x, p.z, p.y, S.BOXES); game.bomb.z = p.z;
  io.emit('feed', { text: `${p.name} a lâché le Noyau`, team: p.team });
}
function updateBomb() {
  const b = game.bomb;
  if (b.state === 'dropped') {
    for (const p of teamPlayers(game.attack)) {
      if (p.alive && dist2(p.x, p.z, b.x, b.z) < 1.5 * 1.5 && Math.abs(p.y - b.y) < 1.5) {
        b.state = 'carried'; b.carrier = p.id;
        io.emit('feed', { text: `${p.name} a ramassé le Noyau`, team: p.team });
        break;
      }
    }
  }
  // Pose
  if (b.state === 'carried' && game.phase === 'live') {
    const p = players.get(b.carrier);
    if (!p || !p.alive) return;
    const site = S.siteAt(p.x, p.z);
    if (p.interact && site && !p.air && p.speed < 0.6) {
      p.plantP += DT;
      if (p.plantP >= R.plantTime) {
        b.state = 'planted'; b.carrier = null; b.site = site;
        b.x = p.x; b.y = p.y; b.z = p.z; b.timer = R.bombTime;
        p.plantP = 0; p.interact = false;
        game.phase = 'planted';
        game.timer = R.bombTime;
        for (const a of teamPlayers(game.attack)) a.money = Math.min(R.maxMoney, a.money + R.plantReward);
        io.emit('planted', { site, x: b.x, y: b.y, z: b.z, by: p.name });
        assignBotRoles();
      }
    } else p.plantP = 0;
  }
  // Désamorçage
  if (b.state === 'planted' && game.phase === 'planted') {
    let defuser = null;
    for (const p of teamPlayers(S.otherTeam(game.attack))) {
      const close = dist2(p.x, p.z, b.x, b.z) < 2 * 2 && Math.abs(p.y - b.y) < 1.6;
      if (p.alive && p.interact && close && p.speed < 0.6) { defuser = p; break; }
      p.defuseP = 0;
    }
    for (const p of players.values()) if (p !== defuser) p.defuseP = 0;
    if (defuser) {
      defuser.defuseP += DT;
      if (defuser.defuseP >= R.defuseTime) {
        b.state = 'defused';
        defuser.defuseP = 0;
        io.emit('defused', { by: defuser.name });
        endRound(defuser.team, `${defuser.name} a désamorcé le Noyau`);
      }
    }
  }
}
function explodeBomb() {
  const b = game.bomb;
  b.state = 'exploded';
  io.emit('explode', { x: b.x, y: b.y, z: b.z });
  endRound(game.attack, 'Le Noyau a explosé');
  for (const p of players.values()) {
    if (!p.alive) continue;
    const d = Math.sqrt(dist2(p.x, p.z, b.x, b.z));
    if (d < R.explodeRadius) killPlayer(p, null, 'Noyau', false);
  }
}

// =====================================================================
// Tirs (le serveur décide de ce qui est touché)
// =====================================================================
function eyeOf(p) { return [p.x, p.y + (p.crouch ? S.EYE_CROUCH : S.EYE_STAND), p.z]; }

// Ajoute une dispersion aléatoire (dans un cône d'angle "spread") à une direction
function scatter(d, spread) {
  if (spread <= 0) return d;
  const [dx, dy, dz] = d;
  // deux vecteurs perpendiculaires à d
  let ux = -dz, uy = 0, uz = dx;
  let ul = Math.hypot(ux, uy, uz);
  if (ul < 1e-6) { ux = 1; uy = 0; uz = 0; ul = 1; }
  ux /= ul; uy /= ul; uz /= ul;
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
  const a = Math.random() * Math.PI * 2, r = spread * Math.sqrt(Math.random());
  const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
  const nx = dx + ux * ox + vx * oy, ny = dy + uy * ox + vy * oy, nz = dz + uz * ox + vz * oy;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

function fire(p, dir, scoped, seq) {
  if (!p.alive) return;
  if (!['live', 'planted', 'end'].includes(game.phase)) return;
  const slot = p.weapons[p.cur];
  if (!slot) return;
  const w = S.WEAPONS[slot.type];
  const t = now();
  if (p.reloadUntil && !w.melee) return;
  if (t - p.lastShot < (60000 / w.rpm) * 0.8) return;
  if (!w.melee && slot.mag <= 0) return;
  const len = Math.hypot(...dir);
  if (!(len > 0.5)) return;
  dir = dir.map((v) => v / len);
  p.shots = t - p.lastShot > w.recover * 1000 ? 0 : p.shots + 1;
  p.lastShot = t;
  if (!w.melee) slot.mag--;
  if (seq) p.seq = seq;
  const spread = spreadOf(p, w, scoped);
  const [ox, oy, oz] = eyeOf(p);
  const boxes = allBoxes();
  const range = w.melee ? w.range : 150;
  const hits = new Map(); // cible -> { dmg, head }
  // Un tir = un rayon, ou plusieurs plombs pour les fusils à pompe
  for (let i = 0; i < (w.pellets || 1); i++) {
    const d = scatter(dir, spread);
    const wallHit = S.rayWalls(ox, oy, oz, d[0], d[1], d[2], boxes, range);
    let best = wallHit.t, target = null, zone = null;
    for (const o of players.values()) {
      if (o === p || !o.alive || o.team === p.team) continue;
      const h = S.rayPlayer(ox, oy, oz, d[0], d[1], d[2], o);
      if (h && h.t < best) { best = h.t; target = o; zone = h.zone; }
    }
    const hx = ox + d[0] * best, hy = oy + d[1] * best, hz = oz + d[2] * best;
    io.emit('shot', { id: p.id, w: slot.type, from: [ox, oy, oz], to: [hx, hy, hz], hit: target ? target.id : null, zone,
      pellet: i, miss: w.melee && !target && best >= range });
    if (target) {
      const h = hits.get(target) || { dmg: 0, head: false };
      h.dmg += S.damageFor(w, zone, best);
      h.head ||= zone === 'head';
      hits.set(target, h);
    } else if (wallHit.box && wallHit.box.kind === 'rempart' && best === wallHit.t) {
      wallHit.box.hp -= w.dmg;
      if (wallHit.box.hp <= 0) walls = walls.filter((x) => x !== wallHit.box);
    }
  }
  for (const [target, h] of hits) if (target.alive) damage(target, h.dmg, p, slot.type, h.head);
}
function spreadOf(p, w, scoped) {
  return S.spreadOf(w, { speed: p.speed, air: p.air, crouch: p.crouch, shots: p.shots, scoped });
}

function damage(target, dmg, attacker, weapon, head) {
  // Le gilet absorbe les dégâts avant les points de vie
  const absorbed = Math.min(target.armor, dmg);
  target.armor -= absorbed;
  target.hp -= dmg - absorbed;
  target.lastAttacker = attacker?.id;
  if (target.isBot && attacker) { target.ai.hurtBy = attacker.id; target.ai.hurtAt = now(); }
  target.socket?.emit('hurt', { from: attacker ? [attacker.x, attacker.z] : null, dmg });
  attacker?.socket?.emit('hitConfirm', { head, kill: target.hp <= 0, dmg });
  if (target.hp <= 0) killPlayer(target, attacker, weapon, head);
}
function killPlayer(p, killer, weapon, head) {
  if (!p.alive) return;
  p.alive = false; p.hp = 0; p.deaths++;
  p.interact = false; p.plantP = 0; p.defuseP = 0;
  if (game.bomb.carrier === p.id) dropBomb(p);
  if (killer && killer.team !== p.team) {
    killer.kills++;
    killer.money = Math.min(R.maxMoney, killer.money + R.killReward);
  }
  freshLoadout(p); // il perd ses armes et son gilet
  io.emit('kill', { killer: killer?.id ?? null, victim: p.id, weapon, head });
  checkRoundOver();
}

// =====================================================================
// Capacités des personnages
// =====================================================================
function useAbility(p, dir) {
  if (!p.alive || p.charges <= 0) return;
  if (!['live', 'planted'].includes(game.phase)) return;
  if (now() - p.lastAbility < 800) return;
  const len = Math.hypot(...dir);
  if (!(len > 0.5)) return;
  const d = dir.map((v) => v / len);
  const [ox, oy, oz] = eyeOf(p);
  const A = S.ABILITY;
  const boxes = allBoxes();
  p.lastAbility = now();
  if (p.agent === 'brume') {
    const { t } = S.rayWalls(ox, oy, oz, d[0], d[1], d[2], boxes, A.smokeRange);
    const tt = Math.max(0, t - 0.6);
    let x = ox + d[0] * tt, z = oz + d[2] * tt;
    const y = S.groundAt(x, z, 10, boxes);
    smokes.push({ id: nextId++, x, y: y + 1.6, z, r: A.smokeRadius, until: now() + A.smokeTime * 1000, born: now() });
  } else if (p.agent === 'lueur') {
    const { t } = S.rayWalls(ox, oy, oz, d[0], d[1], d[2], boxes, A.flashRange);
    const tt = Math.max(0.5, t - 0.6);
    pendingFlashes.push({ x: ox + d[0] * tt, y: Math.max(0.4, oy + d[1] * tt), z: oz + d[2] * tt, at: now() + A.flashDelay * 1000, owner: p.id });
    io.emit('flashThrow', { from: [ox, oy, oz], to: [ox + d[0] * tt, Math.max(0.4, oy + d[1] * tt), oz + d[2] * tt] });
  } else if (p.agent === 'rocaille') {
    // Mur posé au sol devant soi, aligné sur la grille (perpendiculaire à la direction du regard)
    const hx = d[0], hz = d[2], hl = Math.hypot(hx, hz) || 1;
    const { t } = S.rayWalls(ox, 1, oz, hx / hl, 0, hz / hl, boxes, A.wallRange + 1);
    const dist = Math.max(1.6, Math.min(A.wallRange, t - 1));
    const cx = ox + (hx / hl) * dist, cz = oz + (hz / hl) * dist;
    const alongX = Math.abs(hz) > Math.abs(hx); // on regarde vers le nord/sud : le mur s'étend en x
    const hlen = A.wallLen / 2, ht = A.wallT / 2;
    walls.push({ id: nextId++, kind: 'rempart', x1: cx - (alongX ? hlen : ht), x2: cx + (alongX ? hlen : ht),
      z1: cz - (alongX ? ht : hlen), z2: cz + (alongX ? ht : hlen), y1: 0, y2: A.wallH, hp: A.wallHp, until: now() + A.wallTime * 1000 });
  } else if (p.agent === 'aloe') {
    heals.push({ owner: p.id, team: p.team, x: p.x, z: p.z, until: now() + A.healTime * 1000 });
    io.emit('healPulse', { x: p.x, y: p.y, z: p.z, team: p.team });
  }
  p.charges--;
}
function updateAbilities() {
  const t = now();
  smokes = smokes.filter((s) => s.until > t);
  walls = walls.filter((w) => w.until > t && w.hp > 0);
  // Soins : 20 PV par seconde aux alliés proches de la soigneuse
  for (const h of heals) {
    const owner = players.get(h.owner);
    const cx = owner?.alive ? owner.x : h.x, cz = owner?.alive ? owner.z : h.z;
    for (const p of teamPlayers(h.team)) {
      if (p.alive && dist2(p.x, p.z, cx, cz) < S.ABILITY.healRadius ** 2) {
        p.hp = Math.min(100, p.hp + (S.ABILITY.healAmount / S.ABILITY.healTime) * DT);
      }
    }
  }
  heals = heals.filter((h) => h.until > t);
  // Flashs : explosion, puis aveuglement des bots qui regardent (les humains calculent le leur dans le navigateur)
  for (const f of pendingFlashes) {
    if (f.at > t) continue;
    io.emit('flash', { x: f.x, y: f.y, z: f.z });
    for (const p of players.values()) {
      if (!p.alive || !p.isBot) continue;
      const blind = flashAmount(p, f);
      if (blind > 0) p.blindUntil = Math.max(p.blindUntil, t + blind * 1000);
    }
  }
  pendingFlashes = pendingFlashes.filter((f) => f.at > t);
}
function flashAmount(p, f) {
  const [ex, ey, ez] = eyeOf(p);
  const dx = f.x - ex, dy = f.y - ey, dz = f.z - ez, d = Math.hypot(dx, dy, dz);
  if (d > 35 || !S.lineOfSight(ex, ey, ez, f.x, f.y, f.z, allBoxes(), smokes)) return 0;
  const fw = S.forwardOf(p.yaw, p.pitch);
  const facing = (fw[0] * dx + fw[1] * dy + fw[2] * dz) / (d || 1);
  if (facing > 0.5) return S.ABILITY.flashMax;
  if (facing > 0) return 1.4;
  if (facing > -0.4) return 0.5;
  return 0;
}

// =====================================================================
// Achats
// =====================================================================
function inSpawn(p) {
  const s = S.SPAWNS[sideOf(p.team)];
  return p.x > s.x1 - 1 && p.x < s.x2 + 1 && p.z > s.z1 - 1 && p.z < s.z2 + 1;
}
function buy(p, item) {
  if (game.phase !== 'buy' || !p.alive || !inSpawn(p)) return false;
  if (S.WEAPONS[item]) {
    const w = S.WEAPONS[item];
    if (w.melee) return false;
    const cur = p.weapons[w.slot];
    if (cur && cur.type === item) return false;
    const refund = p.bought[w.slot] || 0; // l'arme achetée cette manche est remboursée si on la remplace
    if (p.money + refund < w.price) return false;
    p.money += refund - w.price;
    p.weapons[w.slot] = { type: item, mag: w.mag, reserve: w.reserve };
    p.bought[w.slot] = w.price;
    p.cur = w.slot;
    p.reloadUntil = 0;
    return true;
  }
  if (S.ARMORS[item]) {
    const a = S.ARMORS[item];
    const refund = p.bought.armor || 0;
    if (p.armor >= a.value && !refund) return false;
    if (p.money + refund < a.price) return false;
    p.money += refund - a.price;
    p.armor = a.value;
    p.bought.armor = a.price;
    return true;
  }
  return false;
}
function sell(p, slot) {
  if (game.phase !== 'buy' || !p.alive) return;
  const paid = p.bought[slot];
  if (!paid) return;
  p.money += paid;
  p.bought[slot] = 0;
  if (slot === 'armor') p.armor = 0;
  else if (slot === 'primary') { p.weapons.primary = null; p.cur = 'secondary'; }
  else p.weapons.secondary = { type: 'dard', mag: 12, reserve: 36 };
}

// =====================================================================
// Bots
// =====================================================================
// Graphe de navigation : on relie les points qui se voient (avec une marge pour le corps)
const NAV = S.NAV_POINTS.map(([x, z]) => ({ x, z, links: [] }));
function clearPath(ax, az, bx, bz, boxes = S.BOXES) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
  if (L < 0.01) return true;
  for (const off of [-0.5, 0, 0.5]) {
    const nx = (-dz / L) * off, nz = (dx / L) * off;
    if (!S.lineOfSight(ax + nx, 0.3, az + nz, bx + nx, 0.3, bz + nz, boxes)) return false;
  }
  return true;
}
for (let i = 0; i < NAV.length; i++) {
  for (let j = i + 1; j < NAV.length; j++) {
    const a = NAV[i], b = NAV[j], d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < 24 && clearPath(a.x, a.z, b.x, b.z)) { a.links.push([j, d]); b.links.push([i, d]); }
  }
}
function nearestNode(x, z) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < NAV.length; i++) {
    const d = dist2(x, z, NAV[i].x, NAV[i].z);
    if (d < bd && clearPath(x, z, NAV[i].x, NAV[i].z)) { bd = d; best = i; }
  }
  if (best < 0) for (let i = 0; i < NAV.length; i++) { const d = dist2(x, z, NAV[i].x, NAV[i].z); if (d < bd) { bd = d; best = i; } }
  return best;
}
function findPath(fx, fz, tx, tz) {
  if (clearPath(fx, fz, tx, tz)) return [[tx, tz]];
  const start = nearestNode(fx, fz), goal = nearestNode(tx, tz);
  const dist = new Array(NAV.length).fill(Infinity), prev = new Array(NAV.length).fill(-1), done = new Array(NAV.length).fill(false);
  dist[start] = 0;
  for (;;) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < NAV.length; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
    if (u < 0 || u === goal) break;
    done[u] = true;
    for (const [v, w] of NAV[u].links) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  const path = [];
  for (let c = goal; c >= 0; c = prev[c]) path.unshift([NAV[c].x, NAV[c].z]);
  path.push([tx, tz]);
  return path;
}

function botBuy(p) {
  const m = p.money;
  const r = Math.random();
  if (!p.weapons.primary) {
    // Chaque bot a ses préférences selon son budget (en gardant de quoi acheter un gilet)
    if (m >= 4700 + 1000 && r < 0.15) buy(p, 'faucon');
    else if (m >= 2900 + 1000) buy(p, r < 0.5 ? 'tempete' : r < 0.85 ? 'ressac' : 'titan');
    else if (m >= 2400 + 400 && r < 0.15) buy(p, 'jumelle');
    else if (m >= 2050 + 400) buy(p, r < 0.5 ? 'vigie' : 'ronce');
    else if (m >= 1600 + 400 && game.round > 1) buy(p, r < 0.6 ? 'frelon' : r < 0.8 ? 'cyclone' : 'enclume');
    else if (m >= 1100 + 400 && game.round > 1) buy(p, r < 0.6 ? 'moustique' : r < 0.85 ? 'belier' : 'pic');
  }
  if (p.money >= 1000 && p.armor < 50 && (p.weapons.primary || p.money > 2400)) buy(p, 'lourd');
  else if (p.money >= 400 && p.armor < 25) buy(p, 'leger');
  if (p.weapons.secondary.type === 'dard') {
    if (!p.weapons.primary && game.round > 1 && p.money >= 800 && r < 0.3) buy(p, 'cran');
    else if (!p.weapons.primary && game.round > 1 && p.money >= 500) buy(p, r < 0.5 ? 'brise' : r < 0.8 ? 'guepe' : 'grenaille');
  }
  p.cur = p.weapons.primary ? 'primary' : 'secondary';
}

// Répartit les rôles des bots au début de la manche (et quand le Noyau est posé)
function assignBotRoles() {
  const defTeam = S.otherTeam(game.attack);
  const spots = shuffle([...S.HOLD_SPOTS.A.slice(0, 2), ...S.HOLD_SPOTS.B.slice(0, 2), S.HOLD_SPOTS.mid[0]]);
  let i = 0;
  for (const p of teamPlayers(defTeam)) {
    if (!p.isBot) continue;
    const s = spots[i++ % spots.length];
    p.ai.hold = { x: s[0] + rand(-1, 1), z: s[1] + rand(-1, 1), lx: s[2], lz: s[3] };
    p.ai.goal = null;
  }
  for (const p of teamPlayers(game.attack)) {
    if (!p.isBot) continue;
    p.ai.delay = now() + rand(0, 6000); // départs échelonnés
    p.ai.goal = null;
  }
}

function setGoal(p, x, z) {
  const ai = p.ai;
  if (ai.goal && Math.abs(ai.goal[0] - x) < 0.5 && Math.abs(ai.goal[1] - z) < 0.5 && ai.path) return;
  ai.goal = [x, z];
  ai.path = findPath(p.x, p.z, x, z);
}

function visibleEnemy(p) {
  if (now() < p.blindUntil) return null;
  const [ex, ey, ez] = eyeOf(p);
  const fw = S.forwardOf(p.yaw, 0);
  let best = null, bd = Infinity;
  const boxes = allBoxes();
  for (const o of players.values()) {
    if (!o.alive || o.team === p.team) continue;
    const dx = o.x - ex, dz = o.z - ez, d = Math.hypot(dx, dz);
    if (d > 70) continue;
    const recentlyHurt = p.ai.hurtBy === o.id && now() - p.ai.hurtAt < 2500;
    const inFov = (fw[0] * dx + fw[2] * dz) / (d || 1) > Math.cos(1.05); // ~120° de champ de vision
    if (!inFov && !recentlyHurt && d > 4) continue;
    const ty = o.y + (o.crouch ? 1.0 : 1.4);
    if (!S.lineOfSight(ex, ey, ez, o.x, ty, o.z, boxes, smokes)) continue;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function turnToward(p, yaw, pitch, rate) {
  let dy = yaw - p.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  const m = rate * DT;
  p.yaw += Math.max(-m, Math.min(m, dy));
  p.pitch += Math.max(-m, Math.min(m, pitch - p.pitch));
  return Math.abs(dy);
}

function moveBot(p, tx, tz, speed) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 0.05) { p.speed = 0; return; }
  const step = Math.min(d, speed * DT);
  const [nx, nz] = S.collide(p.x + (dx / d) * step, p.z + (dz / d) * step, p.y, allBoxes());
  p.speed = Math.hypot(nx - p.x, nz - p.z) / DT;
  p.x = nx; p.z = nz;
  p.y = S.groundAt(p.x, p.z, p.y, allBoxes());
}

function followPath(p, speed, look = true) {
  const ai = p.ai;
  if (!ai.path || !ai.path.length) { p.speed = 0; return true; }
  const [tx, tz] = ai.path[0];
  if (dist2(p.x, p.z, tx, tz) < 0.8 * 0.8) {
    ai.path.shift();
    if (!ai.path.length) { p.speed = 0; return true; }
  }
  const [nx, nz] = ai.path[0];
  if (look) turnToward(p, Math.atan2(-(nx - p.x), -(nz - p.z)), 0, 6);
  moveBot(p, nx, nz, speed);
  // Coincé (contre un mur de Rocaille par exemple) : on recalcule le chemin
  if (!ai.stuckT || now() - ai.stuckT > 1200) {
    if (ai.stuckPos && dist2(p.x, p.z, ai.stuckPos[0], ai.stuckPos[1]) < 0.3 && ai.goal) {
      ai.path = findPath(p.x + rand(-1, 1), p.z + rand(-1, 1), ai.goal[0], ai.goal[1]);
    }
    ai.stuckT = now(); ai.stuckPos = [p.x, p.z];
  }
  return false;
}

function botThink(p) {
  const ai = p.ai;
  const t = now();
  p.interact = false;
  if (game.phase === 'buy' || game.phase === 'waiting') { p.speed = 0; return; }
  const slot = p.weapons[p.cur];
  const w = S.WEAPONS[slot.type];
  // Rechargement
  if (p.reloadUntil && t >= p.reloadUntil) finishReload(p);
  if (!p.reloadUntil && slot.mag === 0 && slot.reserve > 0) startReload(p);

  const enemy = game.phase === 'matchEnd' ? null : visibleEnemy(p);
  if (enemy) {
    if (ai.target !== enemy.id) { ai.target = enemy.id; ai.spotAt = t; ai.react = rand(280, 600); ai.burst = 0; }
    const [ex, ey, ez] = eyeOf(p);
    // Vise plutôt la tête, parfois le torse
    if (ai.aimHead === undefined || Math.random() < 0.02) ai.aimHead = Math.random() < 0.3;
    const h = enemy.crouch ? S.CROUCH_H : S.STAND_H;
    const ty = enemy.y + (ai.aimHead ? h - 0.2 : h * 0.68);
    const dx = enemy.x - ex, dy = ty - ey, dz = enemy.z - ez, dh = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, dh);
    const off = turnToward(p, yaw, pitch, 9);
    p.speed = 0; // les bots s'arrêtent pour tirer précisément
    if (t - ai.spotAt > ai.react && off < 0.15 && !p.reloadUntil && slot.mag > 0) {
      // Erreur de visée qui diminue avec le temps passé sur la cible
      const err = 0.007 + 0.05 * Math.exp(-(t - ai.spotAt - ai.react) / 700);
      const fwd = S.forwardOf(yaw + rand(-err, err), pitch + rand(-err, err) * 0.6);
      const gap = 60000 / w.rpm;
      // Rafales courtes avec les armes automatiques pour garder la précision
      const autoLike = w.auto || w.burst;
      const pause = autoLike && ai.burst >= (w.burst || 4) ? (w.burstDelay || 320) : 0;
      if (t - p.lastShot >= gap + pause + (autoLike ? 0 : rand(80, 260))) {
        if (pause) ai.burst = 0;
        fire(p, fwd, true);
        ai.burst++;
      }
    }
    ai.lastSeen = [enemy.x, enemy.z];
    ai.lastSeenAt = t;
    return;
  }
  ai.target = null;
  if (!p.reloadUntil && slot.mag < S.WEAPONS[slot.type].mag * 0.4 && slot.reserve > 0) startReload(p);

  // Attaqué par quelqu'un qu'on ne voit pas : se tourner vers lui
  if (ai.hurtBy && t - ai.hurtAt < 1500) {
    const o = players.get(ai.hurtBy);
    if (o) turnToward(p, Math.atan2(-(o.x - p.x), -(o.z - p.z)), 0, 7);
  }

  const b = game.bomb;
  const attacking = p.team === game.attack;
  if (game.phase === 'end' || game.phase === 'matchEnd') { p.speed = 0; return; }

  if (attacking) {
    if (t < (ai.delay || 0)) { p.speed = 0; return; }
    if (b.state === 'dropped') {
      // Le bot le plus proche va ramasser le Noyau
      const mates = teamPlayers(p.team).filter((m) => m.alive && m.isBot);
      const closest = mates.sort((a, c) => dist2(a.x, a.z, b.x, b.z) - dist2(c.x, c.z, b.x, b.z))[0];
      if (closest === p) { setGoal(p, b.x, b.z); followPath(p, S.RUN_SPEED); return; }
    }
    if (b.carrier === p.id) {
      const [sx, sz] = S.SITES[game.botSite].label;
      setGoal(p, sx, sz);
      const arrived = followPath(p, S.RUN_SPEED);
      if (arrived || (S.siteAt(p.x, p.z) && dist2(p.x, p.z, sx, sz) < 9)) { p.speed = 0; p.interact = true; }
      return;
    }
    if (b.state === 'planted') {
      if (!ai.post) ai.post = [b.x + rand(-7, 7), b.z + rand(-7, 7)];
      const [px, pz] = S.collide(ai.post[0], ai.post[1], 0, S.BOXES);
      setGoal(p, px, pz);
      if (followPath(p, S.WALK_SPEED * 1.4)) turnToward(p, Math.atan2(-(b.x - p.x), -(b.z - p.z)), 0, 3);
      return;
    }
    // Avancer vers le site choisi (en suivant de loin le porteur si possible)
    const site = S.SITES[game.botSite];
    if (!ai.post) {
      const spots = S.HOLD_SPOTS[game.botSite];
      const s = pick(spots);
      ai.post = [s[0] + rand(-2, 2), s[1] + rand(-2, 2)];
    }
    const [px, pz] = S.collide(ai.post[0], ai.post[1], 0, S.BOXES);
    setGoal(p, px, pz);
    if (followPath(p, S.RUN_SPEED)) turnToward(p, Math.atan2(-(site.label[0] - p.x), -(site.label[1] - p.z)) + Math.PI, 0, 3);
    return;
  }

  // Défense
  if (b.state === 'planted') {
    const defenders = teamPlayers(p.team).filter((m) => m.alive);
    const defuser = defenders.sort((a, c) => dist2(a.x, a.z, b.x, b.z) - dist2(c.x, c.z, b.x, b.z))[0];
    if (defuser === p) {
      setGoal(p, b.x, b.z);
      const arrived = followPath(p, S.RUN_SPEED);
      if (arrived || dist2(p.x, p.z, b.x, b.z) < 1.2) { p.speed = 0; p.interact = true; }
    } else {
      if (!ai.post) ai.post = [b.x + rand(-6, 6), b.z + rand(-6, 6)];
      const [px, pz] = S.collide(ai.post[0], ai.post[1], 0, S.BOXES);
      setGoal(p, px, pz);
      followPath(p, S.RUN_SPEED);
    }
    return;
  }
  // Rejoindre un dernier ennemi aperçu (si proche), sinon tenir sa position
  if (ai.lastSeen && t - ai.lastSeenAt < 4000 && dist2(p.x, p.z, ai.lastSeen[0], ai.lastSeen[1]) < 400) {
    setGoal(p, ai.lastSeen[0], ai.lastSeen[1]);
    followPath(p, S.WALK_SPEED);
    return;
  }
  if (ai.hold) {
    setGoal(p, ai.hold.x, ai.hold.z);
    if (followPath(p, S.RUN_SPEED)) {
      const look = Math.atan2(-(ai.hold.lx - p.x), -(ai.hold.lz - p.z));
      turnToward(p, look + Math.sin(t / 1300 + p.id) * 0.35, 0, 2.5);
    }
  }
}

// =====================================================================
// Rechargement
// =====================================================================
function startReload(p) {
  const slot = p.weapons[p.cur];
  if (!slot || S.WEAPONS[slot.type].melee || p.reloadUntil || slot.reserve <= 0 || slot.mag >= S.WEAPONS[slot.type].mag) return;
  p.reloadUntil = now() + S.WEAPONS[slot.type].reload * 1000;
}
function finishReload(p) {
  const slot = p.weapons[p.cur];
  p.reloadUntil = 0;
  if (!slot) return;
  const need = S.WEAPONS[slot.type].mag - slot.mag;
  const n = Math.min(need, slot.reserve);
  slot.mag += n; slot.reserve -= n;
}

// =====================================================================
// Connexions
// =====================================================================
io.on('connection', (socket) => {
  let me = null;
  socket.on('join', ({ name, agent } = {}) => {
    if (me) return;
    name = String(name || '').trim().slice(0, 16) || 'Joueur';
    if (!S.AGENTS[agent]) agent = pick(AGENT_IDS);
    // On rejoint l'équipe qui a le moins d'humains ; un bot laisse sa place
    const team = humansIn('braise') <= humansIn('givre') ? 'braise' : 'givre';
    removeBot(team);
    me = createPlayer({ name, team, agent, isBot: false, socket });
    me.money = Math.max(R.startMoney, Math.round(teamPlayers(team).filter((p) => p !== me).reduce((s, p) => s + p.money, 0) / 4) || R.startMoney);
    socket.emit('welcome', { id: me.id, team });
    if (game.phase === 'waiting') resetMatch();
    else if (game.phase === 'buy') spawnPlayer(me, teamPlayers(team).length - 1);
    roster();
    io.emit('feed', { text: `${name} a rejoint l'équipe ${S.TEAMS[team].name}`, team });
  });
  socket.on('input', (d) => {
    if (!me || !me.alive || !d) return;
    let x = +d.x, y = +d.y, z = +d.z;
    if (![x, y, z].every(Number.isFinite)) return;
    if (game.phase === 'buy') {
      // Pendant l'achat, on reste dans sa zone d'apparition
      const s = S.SPAWNS[sideOf(me.team)];
      x = S.clamp(x, s.x1, s.x2); z = S.clamp(z, s.z1, s.z2);
    }
    me.x = x; me.y = y; me.z = z;
    me.yaw = +d.yaw || 0; me.pitch = S.clamp(+d.pitch || 0, -1.5, 1.5);
    me.crouch = !!d.crouch; me.air = !!d.air; me.scoped = !!d.scoped;
    me.speed = S.clamp(+d.speed || 0, 0, 12);
  });
  socket.on('shoot', (d) => { if (me && Array.isArray(d?.dir)) fire(me, d.dir.map(Number), !!d.scoped, d.seq | 0); });
  socket.on('reload', () => { if (me?.alive) startReload(me); });
  socket.on('switch', (slot) => {
    if (!me?.alive || !['primary', 'secondary', 'melee'].includes(slot) || !me.weapons[slot]) return;
    if (me.cur !== slot) { me.cur = slot; me.reloadUntil = 0; me.shots = 0; }
  });
  socket.on('buy', (item) => { if (me) buy(me, String(item)); });
  socket.on('sell', (slot) => { if (me) sell(me, String(slot)); });
  socket.on('ability', (d) => { if (me && Array.isArray(d?.dir)) useAbility(me, d.dir.map(Number)); });
  socket.on('interact', (on) => { if (me) me.interact = !!on; });
  socket.on('drop', () => { if (me?.alive && game.bomb.carrier === me.id) dropBomb(me); });
  socket.on('disconnect', () => {
    if (!me) return;
    if (game.bomb.carrier === me.id) dropBomb(me);
    players.delete(me.id);
    io.emit('feed', { text: `${me.name} a quitté la partie`, team: me.team });
    if (humanCount() === 0) {
      game.phase = 'waiting';
      for (const p of [...players.values()]) players.delete(p.id);
    } else {
      addBot(me.team);
      checkRoundOver();
    }
    roster();
  });
});

// =====================================================================
// Boucle de jeu (20 fois par seconde)
// =====================================================================
function tick() {
  const t = now();
  if (game.phase !== 'waiting') {
    game.timer -= DT;
    for (const p of players.values()) {
      if (!p.alive) continue;
      if (p.reloadUntil && t >= p.reloadUntil) finishReload(p);
      if (p.isBot) botThink(p);
    }
    updateAbilities();
    updateBomb();
    if (game.phase === 'buy' && game.timer <= 0) { game.phase = 'live'; game.timer = R.roundTime; io.emit('live'); }
    else if (game.phase === 'live' && game.timer <= 0) endRound(S.otherTeam(game.attack), 'Temps écoulé : le Noyau n’a pas été posé');
    else if (game.phase === 'planted' && game.timer <= 0) explodeBomb();
    else if (game.phase === 'end' && game.timer <= 0) afterRoundEnd();
    else if (game.phase === 'matchEnd' && game.timer <= 0) resetMatch();
  }
  broadcast();
}

function broadcast() {
  const b = game.bomb;
  const pub = {
    phase: game.phase, timer: Math.max(0, game.timer), round: game.round, score: game.score, attack: game.attack,
    message: game.message, winner: game.winner,
    bomb: { state: b.state, carrier: b.carrier, x: b.x, y: b.y, z: b.z, site: b.site },
    players: [...players.values()].map((p) => ({
      id: p.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3),
      alive: p.alive, crouch: p.crouch, w: (p.weapons[p.cur] || p.weapons.secondary).type, team: p.team, agent: p.agent,
      hp: Math.ceil(p.hp), armor: p.armor, money: p.money, k: p.kills, d: p.deaths, speed: +p.speed.toFixed(1),
      act: p.plantP > 0 ? 'plant' : p.defuseP > 0 ? 'defuse' : null,
    })),
    smokes: smokes.map((s) => ({ id: s.id, x: s.x, y: s.y, z: s.z, r: s.r, left: (s.until - now()) / 1000 })),
    walls: walls.map((w) => ({ id: w.id, x1: w.x1, x2: w.x2, z1: w.z1, z2: w.z2, y2: w.y2, hp: w.hp })),
  };
  for (const p of players.values()) {
    if (!p.socket) continue;
    p.socket.emit('state', {
      ...pub,
      me: {
        alive: p.alive, hp: Math.ceil(p.hp), armor: p.armor, money: p.money, weapons: p.weapons, cur: p.cur,
        reloading: p.reloadUntil ? Math.max(0, (p.reloadUntil - now()) / 1000) : 0, charges: p.charges, seq: p.seq,
        plantP: p.plantP, defuseP: p.defuseP, bought: p.bought, inSpawn: inSpawn(p), team: p.team, agent: p.agent,
      },
    });
  }
}

setInterval(tick, 1000 / TICK);
http.listen(PORT, () => {
  console.log(`\nRupture est lancé ! Ouvre http://localhost:${PORT} dans ton navigateur.\n`);
});
