// Client de Rupture : affichage 3D (Three.js), contrôles, interface.
// Le serveur décide des règles (tirs, dégâts, manches, argent) ;
// le navigateur gère le déplacement du joueur, l'affichage et les effets.
import * as THREE from 'three';
import * as S from './shared.js';
import { makeWeapon, makeCharacter, setCharacterWeapon, makeBomb, TEX, labelTexture, nameSprite } from './models.js';

const $ = (id) => document.getElementById(id);
const socket = io();
const R = S.RULES;
const nowMs = () => performance.now();
const rand = (a, b) => a + Math.random() * (b - a);

// =====================================================================
// Rendu 3D : scène, lumière, carte
// =====================================================================
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9a77a);
scene.fog = new THREE.Fog(0xd9a77a, 60, 170);
const BASE_FOV = 78;
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

// Ciel : dégradé de fin d'après-midi (dôme)
{
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#3a4a7a'); grd.addColorStop(0.45, '#c98a6a'); grd.addColorStop(0.62, '#f0b27a'); grd.addColorStop(1, '#d9a77a');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
  scene.add(sky);
}
scene.add(new THREE.HemisphereLight(0xffe2c4, 0x4a4035, 1.1));
const sun = new THREE.DirectionalLight(0xffd2a0, 2.4);
sun.position.set(-60, 70, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 60, bottom: -60, near: 10, far: 220 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun);

const texCache = {};
const tex = (name) => (texCache[name] ??= TEX[name]());
function boxMaterial(kind, w, h, d) {
  const make = (t, rx, ry, extra = {}) => {
    const m = tex(t).clone(); m.needsUpdate = true; m.repeat.set(rx, ry);
    return new THREE.MeshStandardMaterial({ map: m, roughness: 0.85, ...extra });
  };
  if (kind === 'crate') return make('crate', 1, 1);
  if (kind === 'tank') return make('metal', 2, h / 3, { metalness: 0.4, roughness: 0.5 });
  if (kind === 'low') return make('concrete', Math.max(w, d) / 4, 0.6);
  // murs : la texture béton fait ~4 m de large, la bande de sécurité reste en bas
  return [make('concrete', d / 4, h / 5), make('concrete', d / 4, h / 5), new THREE.MeshStandardMaterial({ color: 0x8f8372, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x8f8372 }), make('concrete', w / 4, h / 5), make('concrete', w / 4, h / 5)];
}
function buildMap() {
  const floorTex = tex('floor').clone(); floorTex.needsUpdate = true; floorTex.repeat.set(25, 23);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 92), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
  // Sol extérieur (au-delà des murs)
  const out = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0xa8886a, roughness: 1 }));
  out.rotation.x = -Math.PI / 2; out.position.y = -0.02; scene.add(out);
  for (const b of S.BOXES) {
    const w = b.x2 - b.x1, h = b.y2 - b.y1, d = b.z2 - b.z1;
    let geo;
    if (b.kind === 'tank') geo = new THREE.CylinderGeometry(Math.min(w, d) / 2, Math.min(w, d) / 2, h, 24);
    else geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, boxMaterial(b.kind, w, h, d));
    m.position.set((b.x1 + b.x2) / 2, h / 2, (b.z1 + b.z2) / 2);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
  // Zones des sites (sol coloré + grande lettre) et zones d'apparition
  for (const [k, s] of Object.entries(S.SITES)) {
    const w = s.x2 - s.x1, d = s.z2 - s.z1;
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0xff5a36, transparent: true, opacity: 0.07, depthWrite: false }));
    zone.rotation.x = -Math.PI / 2; zone.position.set((s.x1 + s.x2) / 2, 0.02, (s.z1 + s.z2) / 2);
    scene.add(zone);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.01, d)), new THREE.LineBasicMaterial({ color: 0xff7a4a }));
    edges.position.copy(zone.position); edges.position.y = 0.03; scene.add(edges);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: labelTexture(k, '#ff7a4a'), transparent: true, depthWrite: false }));
    label.rotation.x = -Math.PI / 2; label.position.set(s.label[0], 0.04, s.label[1] + 4);
    scene.add(label);
  }
  // Grands panneaux "A" / "B" sur les murs pour s'orienter
  const sign = (txt, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: labelTexture(txt, '#ffffff'), transparent: true }));
    m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
  };
  sign('A', -33, 3, -31.95, 0); sign('B', 36, 3, -31.95, 0);
  sign('A', -20.05, 3, 3, -Math.PI / 2); sign('B', 20.05, 3, -2, Math.PI / 2);
  sign('A', -38.05, 3, -2, -Math.PI / 2); sign('B', 30.05, 3, 4, Math.PI / 2);
  // Tuyaux décoratifs au-dessus des couloirs
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, metalness: 0.6, roughness: 0.4 });
  for (const [x1, z1, x2, z2, y] of [[-50, 30, -20, 30, 5.5], [20, 30, 50, 30, 5.5], [-20, -12, 20, -12, 6.5]]) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, len, 12), pipeMat);
    p.rotation.z = Math.PI / 2; p.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    p.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); p.castShadow = true; scene.add(p);
  }
}
buildMap();

// =====================================================================
// Accueil : choix du personnage
// =====================================================================
let chosenAgent = localStorage.getItem('rp_agent') || 'brume';
if (!S.AGENTS[chosenAgent]) chosenAgent = 'brume';
$('name').value = localStorage.getItem('rp_name') || '';
function renderAgents() {
  $('agents').innerHTML = Object.entries(S.AGENTS).map(([id, a]) => `
    <button class="agent ${id === chosenAgent ? 'sel' : ''}" data-agent="${id}" style="--c:${a.css}">
      <span class="role">${a.role}</span><b>${a.name}</b>
      <span class="ab">Capacité : ${a.ability} (×${a.charges})</span><p>${a.desc}</p>
    </button>`).join('');
  for (const b of document.querySelectorAll('.agent')) b.onclick = () => { chosenAgent = b.dataset.agent; renderAgents(); };
}
renderAgents();

let joined = false;
$('play').onclick = () => {
  const name = $('name').value.trim() || 'Joueur';
  localStorage.setItem('rp_name', name);
  localStorage.setItem('rp_agent', chosenAgent);
  socket.emit('join', { name, agent: chosenAgent });
  joined = true;
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  initAudio();
  lockPointer();
};
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('play').click(); });

// =====================================================================
// État local du joueur
// =====================================================================
const me = { x: 0, y: 0, z: 40, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, crouch: false, onGround: true, eye: S.EYE_STAND };
let myId = null;
let state = null;          // dernier état reçu du serveur
let stateAt = 0;
let roster = new Map();    // id -> { name, team, agent, isBot }
let recoil = { pitch: 0, yaw: 0 };
let localShots = 0, lastShotAt = 0, localSeq = 0, triggerReleased = true;
let pendingSwitch = null;
let localReloadUntil = 0;
let scoped = false;
let sens = +(localStorage.getItem('rp_sens') || 1);
$('sens').value = sens; $('sensVal').textContent = sens;
$('sens').oninput = () => { sens = +$('sens').value; $('sensVal').textContent = sens; localStorage.setItem('rp_sens', sens); };

const myState = () => state?.me;
const myTeam = () => state?.me?.team;
const isAttacker = () => state && myTeam() === state.attack;
function curSlotName() {
  const m = myState();
  if (!m) return 'secondary';
  if (pendingSwitch && nowMs() < pendingSwitch.until && m.weapons[pendingSwitch.slot]) return pendingSwitch.slot;
  return m.weapons[m.cur] ? m.cur : 'secondary';
}
function curWeapon() {
  const m = myState();
  if (!m) return null;
  return m.weapons[curSlotName()];
}
// Balles restantes : valeur du serveur moins les tirs pas encore confirmés
function localMag() {
  const w = curWeapon();
  if (!w) return 0;
  if (S.WEAPONS[w.type].melee) return Infinity;
  return Math.max(0, w.mag - Math.max(0, localSeq - (myState().seq || 0)));
}

// =====================================================================
// Contrôles
// =====================================================================
const keys = new Set();
let mouseDown = false, aimDown = false;
let locked = false, shopOpen = false, boardOpen = false;
function lockPointer() {
  try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* ignoré */ }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked) { mouseDown = false; aimDown = false; keys.clear(); socket.emit('interact', false); }
  $('pause').classList.toggle('hidden', locked || !joined || shopOpen);
});
$('resume').onclick = () => lockPointer();
canvas.addEventListener('click', () => { if (joined && !locked && !shopOpen) lockPointer(); });

document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  const zoomF = scoped ? camera.fov / BASE_FOV : 1;
  const k = 0.0022 * sens * zoomF;
  me.yaw -= e.movementX * k;
  me.pitch = S.clamp(me.pitch - e.movementY * k, -1.5, 1.5);
});
document.addEventListener('mousedown', (e) => {
  if (!locked) return;
  if (e.button === 0) {
    mouseDown = true;
    if (!myState()?.alive) cycleSpectate();
  }
  if (e.button === 2) aimDown = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) { mouseDown = false; triggerReleased = true; }
  if (e.button === 2) aimDown = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

let interacting = false;
document.addEventListener('keydown', (e) => {
  if (!joined) return;
  if (e.code === 'Tab') { e.preventDefault(); boardOpen = true; renderBoard(); $('board').classList.remove('hidden'); return; }
  if (e.code === 'KeyB') { e.preventDefault(); toggleShop(); return; }
  if (shopOpen && e.code === 'Escape') { toggleShop(false); return; }
  if (!locked) return;
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyR') reload();
  else if (e.code === 'Digit1') switchWeapon('primary');
  else if (e.code === 'Digit2') switchWeapon('secondary');
  else if (e.code === 'Digit3') switchWeapon('melee');
  else if (e.code === 'KeyE') useAbility();
  else if (e.code === 'KeyF') { interacting = true; socket.emit('interact', true); }
  else if (e.code === 'KeyG') socket.emit('drop');
  else if (e.code === 'Space') jumpQueued = true;
  if (['Space', 'ControlLeft', 'KeyC'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Tab') { boardOpen = false; $('board').classList.add('hidden'); }
  if (e.code === 'KeyF') { interacting = false; socket.emit('interact', false); }
});
document.addEventListener('wheel', (e) => {
  if (!locked || !myState()) return;
  const slots = ['primary', 'secondary', 'melee'].filter((k) => myState().weapons[k]);
  const i = slots.indexOf(curSlotName());
  switchWeapon(slots[(i + (e.deltaY > 0 ? 1 : slots.length - 1)) % slots.length]);
});
let jumpQueued = false;

function switchWeapon(slot) {
  const m = myState();
  if (!m?.alive || !m.weapons[slot] || curSlotName() === slot) return;
  socket.emit('switch', slot);
  pendingSwitch = { slot, until: nowMs() + 400 };
  localReloadUntil = 0; localShots = 0;
  rebuildViewModel(true);
}
function reload() {
  const w = curWeapon();
  if (!w || !myState()?.alive) return;
  const def = S.WEAPONS[w.type];
  if (def.melee || localMag() >= def.mag || w.reserve <= 0 || isReloading()) return;
  socket.emit('reload');
  localReloadUntil = nowMs() + def.reload * 1000;
  playSfx('reload');
}
const isReloading = () => (myState()?.reloading > 0) || nowMs() < localReloadUntil;
function useAbility() {
  const m = myState();
  if (!m?.alive || m.charges <= 0) return;
  if (!['live', 'planted'].includes(state.phase)) { banner('Capacité indisponible', 'Attends le début du combat', 1200); return; }
  const d = S.forwardOf(me.yaw, me.pitch);
  socket.emit('ability', { dir: d });
  playSfx('ability');
}

// =====================================================================
// Réseau
// =====================================================================
socket.on('welcome', ({ id }) => { myId = id; });
socket.on('roster', (list) => {
  roster = new Map(list.map((p) => [p.id, p]));
  for (const [id, a] of avatars) if (!roster.has(id)) { scene.remove(a.mesh); avatars.delete(id); }
});
socket.on('spawn', (p) => {
  Object.assign(me, { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: 0, vx: 0, vz: 0, vy: 0, crouch: false });
  recoil = { pitch: 0, yaw: 0 }; localReloadUntil = 0; localShots = 0;
  spectating = null;
});
socket.on('state', (s) => {
  const prevPhase = state?.phase;
  state = s; stateAt = nowMs();
  if (localSeq < (s.me.seq || 0)) localSeq = s.me.seq;
  if (s.me.reloading <= 0 && localReloadUntil && nowMs() > localReloadUntil - 200) localReloadUntil = 0;
  if (prevPhase === 'buy' && s.phase !== 'buy' && shopOpen) toggleShop(false);
  syncWorld(s);
});
socket.on('roundStart', ({ round, attack }) => {
  const side = myTeam() ? (myTeam() === attack ? 'attaque' : 'défense') : '';
  banner(`Manche ${round}`, side ? `Tu es en ${side}. Phase d'achat : appuie sur B.` : '', 3000);
  clearEffects();
});
socket.on('live', () => { banner('Combat !', isAttacker() ? 'Pose le Noyau sur A ou B' : 'Défends les sites A et B', 1600); playSfx('start'); });
socket.on('planted', ({ site, by }) => { banner(`Noyau posé sur ${site}`, `par ${by} — explosion dans ${R.bombTime} s`, 2500); playSfx('plant'); });
socket.on('defused', ({ by }) => playSfx('defuse'));
socket.on('roundEnd', ({ winner, reason }) => {
  const won = winner === myTeam();
  banner(won ? 'Manche gagnée' : 'Manche perdue', reason, 4000, won ? '#8fe388' : '#ff6b5b');
});
socket.on('halftime', () => setTimeout(() => banner('Mi-temps', 'Changement de côté ! Argent remis à 800.', 3000), 50));
socket.on('matchEnd', ({ winner, score }) => {
  const won = winner === myTeam();
  banner(won ? 'Victoire !' : 'Défaite', `${score[myTeam()]} — ${score[S.otherTeam(myTeam())]} · nouveau match dans ${R.matchEndTime} s`, R.matchEndTime * 1000, won ? '#8fe388' : '#ff6b5b');
});
socket.on('feed', ({ text, team }) => addFeed(`<span style="color:${S.TEAMS[team]?.css || '#ccc'}">${esc(text)}</span>`, team));
socket.on('kill', ({ killer, victim, weapon, head }) => {
  const k = roster.get(killer), v = roster.get(victim);
  const wname = S.WEAPONS[weapon]?.name || weapon;
  const kn = k ? `<span style="color:${S.TEAMS[k.team].css}">${esc(k.name)}</span>` : '';
  const vn = v ? `<span style="color:${S.TEAMS[v.team].css}">${esc(v.name)}</span>` : '?';
  addFeed(`${kn}<span class="w">[${wname}${head ? ' · tête' : ''}]</span>${vn}`, k?.team || v?.team);
  if (victim === myId) { banner('Éliminé', k ? `par ${k.name} (${wname}${head ? ', tir à la tête' : ''})` : '', 2500, '#ff6b5b'); spectating = null; }
});
socket.on('shot', onShot);
socket.on('hitConfirm', ({ head, kill }) => {
  const h = $('hitmark');
  h.classList.remove('hidden'); h.classList.toggle('head', !!head);
  clearTimeout(h._t); h._t = setTimeout(() => h.classList.add('hidden'), kill ? 300 : 140);
  playSfx(head ? 'headshot' : 'hit');
});
socket.on('hurt', ({ dmg }) => { hurtFlash = Math.min(1, hurtFlash + dmg / 60); recoil.pitch += 0.01; });
socket.on('flashThrow', ({ from, to }) => throwOrb(from, to));
socket.on('flash', (f) => onFlash(f));
socket.on('healPulse', (h) => healRing(h));
socket.on('explode', (b) => explosion(b));

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// =====================================================================
// Joueurs affichés (les autres + moi en spectateur)
// =====================================================================
const avatars = new Map(); // id -> { mesh, sprite, pos, yaw, pitch, phase, alive }
let spectating = null;
function syncWorld(s) {
  for (const p of s.players) {
    if (p.id === myId) continue;
    let a = avatars.get(p.id);
    const info = roster.get(p.id);
    if (!a || a.team !== p.team || a.agent !== p.agent) {
      if (a) scene.remove(a.mesh);
      const mesh = makeCharacter(p.team, p.agent);
      scene.add(mesh);
      a = { mesh, team: p.team, agent: p.agent, pos: new THREE.Vector3(p.x, p.y, p.z), yaw: p.yaw, pitch: p.pitch, phase: 0, stepT: 0 };
      if (info && p.team === myTeam()) {
        a.sprite = nameSprite(info.name, S.TEAMS[p.team].css);
        a.sprite.position.y = 2.15; mesh.add(a.sprite);
      }
      avatars.set(p.id, a);
    }
    a.data = p;
    a.target = p;
    setCharacterWeapon(a.mesh, p.w);
    if (a.sprite) a.sprite.visible = p.team === myTeam();
  }
  for (const [id, a] of avatars) if (!s.players.some((p) => p.id === id)) { scene.remove(a.mesh); avatars.delete(id); }
  syncSmokes(s.smokes);
  syncWalls(s.walls);
  syncBomb(s.bomb);
}
function updateAvatars(dt) {
  for (const [id, a] of avatars) {
    const p = a.target;
    if (!p) continue;
    const k = 1 - Math.exp(-14 * dt);
    a.pos.x += (p.x - a.pos.x) * k; a.pos.y += (p.y - a.pos.y) * k; a.pos.z += (p.z - a.pos.z) * k;
    let dy = p.yaw - a.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    a.yaw += dy * k; a.pitch += (p.pitch - a.pitch) * k;
    const m = a.mesh, u = m.userData;
    m.position.copy(a.pos);
    m.rotation.y = a.yaw;
    m.visible = spectating !== id;
    if (!p.alive) {
      // Corps allongé au sol
      m.rotation.set(-Math.PI / 2, a.yaw, 0, 'YXZ');
      m.position.y = a.pos.y + 0.25;
      if (a.sprite) a.sprite.visible = false;
      continue;
    }
    m.rotation.set(0, a.yaw, 0, 'YXZ');
    const crouchK = p.crouch ? 0.72 : 1;
    m.scale.y += (crouchK - m.scale.y) * k;
    u.arms.rotation.x = a.pitch;
    u.head.rotation.x = a.pitch * 0.6;
    a.phase += dt * p.speed * 2.2;
    const swing = Math.min(1, p.speed / 4) * 0.6;
    u.legL.rotation.x = Math.sin(a.phase) * swing;
    u.legR.rotation.x = -Math.sin(a.phase) * swing;
    // Bruits de pas des joueurs qui courent (on ne les entend pas en marchant)
    if (p.speed > 3.6) {
      a.stepT -= dt;
      if (a.stepT <= 0) { a.stepT = 0.36; playSfx('step', a.pos); }
    }
  }
}

// =====================================================================
// Fumées, murs, Noyau
// =====================================================================
const smokeMeshes = new Map();
const smokeMat = new THREE.MeshStandardMaterial({ color: 0x9d95c9, roughness: 1, transparent: true, opacity: 0.97, depthWrite: false });
const smokeInner = new THREE.MeshBasicMaterial({ color: 0x8c86b0, side: THREE.BackSide, transparent: true, opacity: 0.98, depthWrite: false });
function syncSmokes(list) {
  for (const s of list) {
    if (smokeMeshes.has(s.id)) continue;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s.r, 24, 16), smokeMat));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s.r * 0.98, 24, 16), smokeInner));
    // quelques "bouffées" autour pour un aspect moins parfait
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(s.r * rand(0.35, 0.55), 12, 8), smokeMat);
      const a = (i / 7) * Math.PI * 2;
      b.position.set(Math.cos(a) * s.r * 0.75, rand(-0.6, 0.8), Math.sin(a) * s.r * 0.75);
      g.add(b);
    }
    g.position.set(s.x, s.y, s.z);
    g.userData = { born: nowMs(), data: s };
    scene.add(g);
    smokeMeshes.set(s.id, g);
  }
  for (const [id, g] of smokeMeshes) if (!list.some((s) => s.id === id)) { scene.remove(g); smokeMeshes.delete(id); }
}
const wallMeshes = new Map();
function syncWalls(list) {
  for (const w of list) {
    if (wallMeshes.has(w.id)) continue;
    const st = tex('stone').clone(); st.needsUpdate = true; st.repeat.set(Math.max(w.x2 - w.x1, w.z2 - w.z1) / 3, 1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w.x2 - w.x1, w.y2, w.z2 - w.z1), new THREE.MeshStandardMaterial({ map: st, roughness: 0.95 }));
    m.position.set((w.x1 + w.x2) / 2, w.y2 / 2, (w.z1 + w.z2) / 2);
    m.castShadow = true; m.receiveShadow = true;
    m.userData = { born: nowMs() };
    scene.add(m);
    wallMeshes.set(w.id, m);
    playSfx('wall', m.position);
  }
  for (const [id, m] of wallMeshes) if (!list.some((w) => w.id === id)) { scene.remove(m); wallMeshes.delete(id); }
}
const dynBoxes = () => {
  const w = state?.walls;
  if (!w?.length) return S.BOXES;
  return S.BOXES.concat(w.map((b) => ({ ...b, y1: 0 })));
};
const bombMesh = makeBomb();
bombMesh.visible = false;
scene.add(bombMesh);
let beepT = 0;
function syncBomb(b) {
  bombMesh.visible = b.state === 'dropped' || b.state === 'planted' || b.state === 'defused';
  if (bombMesh.visible) bombMesh.position.set(b.x, b.y, b.z);
}
function updateBomb(dt) {
  if (!state || !bombMesh.visible) return;
  const planted = state.bomb.state === 'planted';
  const left = planted ? timerLeft() : 99;
  const rate = planted ? (left < 5 ? 8 : left < 12 ? 4 : 1.5) : 0.6;
  const on = Math.sin(nowMs() / 1000 * rate * Math.PI * 2) > 0;
  bombMesh.userData.ringMat.emissiveIntensity = on ? 2.5 : 0.3;
  bombMesh.userData.light.intensity = on ? 3 : 0.4;
  bombMesh.rotation.y += dt;
  if (planted) {
    beepT -= dt;
    if (beepT <= 0) { beepT = 1 / rate; playSfx('beep', bombMesh.position); }
  }
}

// =====================================================================
// Effets : traçantes, impacts, flash, soins, explosion
// =====================================================================
const effects = [];
function addEffect(obj, life, update) { scene.add(obj); effects.push({ obj, life, max: life, update }); }
function clearEffects() { for (const e of effects) scene.remove(e.obj); effects.length = 0; }
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    if (e.life <= 0) { scene.remove(e.obj); effects.splice(i, 1); continue; }
    e.update?.(e.obj, 1 - e.life / e.max, dt);
  }
}
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.85 });
const puffGeo = new THREE.SphereGeometry(0.08, 6, 4);
const muzzleFlash = new THREE.PointLight(0xffc070, 0, 6);
scene.add(muzzleFlash);
const lastShotSound = new Map();
function onShot({ id, w, from, to, hit, pellet, miss }) {
  let start = new THREE.Vector3(...from);
  const def = S.WEAPONS[w];
  if (def?.melee) {
    // Couteau : pas de traçante, un bruit de lame chez les autres
    if (id !== myId) playSfx('swish', start);
    if (miss) return;
  } else if (id === myId && viewModel) {
    start = viewModel.localToWorld(viewModel.userData.muzzle.clone());
  } else {
    // Un seul bruit par tir, même avec plusieurs plombs
    if (!pellet || nowMs() - (lastShotSound.get(id) || 0) > 40) playSfx('shot', start, w);
    lastShotSound.set(id, nowMs());
    const a = avatars.get(id);
    if (a) start.set(a.pos.x, from[1] - 0.15, a.pos.z);
  }
  const end = new THREE.Vector3(...to);
  const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
  if (!def?.melee) addEffect(new THREE.Line(geo, tracerMat.clone()), 0.07, (o, t) => { o.material.opacity = 0.85 * (1 - t); });
  // Impact : petit nuage de poussière (ou de sang si un joueur est touché)
  const puff = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: hit ? 0xb3261e : 0xcbbfa8, transparent: true }));
  puff.position.copy(end);
  addEffect(puff, 0.35, (o, t) => { o.scale.setScalar(1 + t * 3); o.material.opacity = 1 - t; });
}
function throwOrb(from, to) {
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3a0 }));
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  addEffect(orb, S.ABILITY.flashDelay, (o, t) => { o.position.lerpVectors(a, b, t); o.position.y += Math.sin(t * Math.PI) * 0.8; });
}
let flashUntil = 0, flashDur = 1;
function onFlash(f) {
  // Lumière blanche à l'endroit de l'éclair
  const light = new THREE.PointLight(0xffffff, 40, 25);
  light.position.set(f.x, f.y, f.z);
  addEffect(light, 0.25, (o, t) => { o.intensity = 40 * (1 - t); });
  playSfx('flash', light.position);
  // Suis-je aveuglé ? (ligne de vue + regard tourné vers l'éclair)
  if (!myState()?.alive) return;
  const ex = me.x, ey = me.y + me.eye, ez = me.z;
  const dx = f.x - ex, dy = f.y - ey, dz = f.z - ez, d = Math.hypot(dx, dy, dz);
  if (d > 35 || !S.lineOfSight(ex, ey, ez, f.x, f.y, f.z, dynBoxes(), state.smokes)) return;
  const fw = S.forwardOf(me.yaw, me.pitch);
  const facing = (fw[0] * dx + fw[1] * dy + fw[2] * dz) / (d || 1);
  const dur = facing > 0.5 ? S.ABILITY.flashMax : facing > 0 ? 1.4 : facing > -0.4 ? 0.5 : 0;
  if (dur > 0) { flashUntil = nowMs() + dur * 1000; flashDur = dur; }
}
function healRing({ x, y, z }) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 32), new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.1, z);
  addEffect(ring, 1.2, (o, t) => { o.scale.setScalar(1 + t * S.ABILITY.healRadius); o.material.opacity = 1 - t; });
  playSfx('heal', ring.position);
}
let shake = 0;
function explosion({ x, y, z }) {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true }));
  ball.position.set(x, y + 1, z);
  addEffect(ball, 1.4, (o, t) => { o.scale.setScalar(1 + t * R.explodeRadius); o.material.opacity = 1 - t; });
  const light = new THREE.PointLight(0xff8030, 80, 60);
  light.position.set(x, y + 3, z);
  addEffect(light, 1.4, (o, t) => { o.intensity = 80 * (1 - t); });
  shake = 1;
  playSfx('explode', ball.position);
}

// =====================================================================
// Arme en vue à la première personne
// =====================================================================
let viewModel = null, viewType = null, viewKick = 0, swapAnim = 0;
const viewHolder = new THREE.Group();
camera.add(viewHolder);
const vmLight = new THREE.PointLight(0xffffff, 0.6, 2);
camera.add(vmLight);
function rebuildViewModel(force = false) {
  const w = curWeapon();
  const type = w?.type || null;
  if (type === viewType && !force) return;
  viewHolder.clear();
  viewModel = null; viewType = type;
  if (!type) return;
  viewModel = makeWeapon(type);
  viewModel.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  // une main/gant simple
  const glove = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.16), new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.9 }));
  glove.position.set(0, -0.06, 0.06); viewModel.add(glove);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.25), new THREE.MeshStandardMaterial({ color: S.AGENTS[myState()?.agent || 'brume'].color }));
  cuff.position.set(0.02, -0.1, 0.25); viewModel.add(cuff);
  viewHolder.add(viewModel);
  swapAnim = 1;
}

// =====================================================================
// Tir
// =====================================================================
let burstLeft = 0, burstNextAt = 0;
function tryFire() {
  const m = myState();
  if (!m?.alive || !state) return;
  if (!['live', 'planted', 'end'].includes(state.phase)) return;
  const w = curWeapon();
  if (!w) return;
  const def = S.WEAPONS[w.type];
  if (!def.auto && !triggerReleased) return;
  if (isReloading() || burstLeft > 0) return;
  const t = nowMs();
  // Après une rafale, petite pause avant la suivante
  if (t - lastShotAt < 60000 / def.rpm + (def.burst ? def.burstDelay : 0)) return;
  if (localMag() <= 0) { triggerReleased = false; reload(); return; }
  triggerReleased = false;
  fireOne(def, w);
  if (def.burst) { burstLeft = def.burst - 1; burstNextAt = t + 60000 / def.rpm; }
}
// Balles 2 et 3 d'une rafale (appelé à chaque image)
function updateBurst() {
  if (burstLeft <= 0 || nowMs() < burstNextAt) return;
  const w = curWeapon();
  const def = w && S.WEAPONS[w.type];
  if (!def?.burst || !myState()?.alive || localMag() <= 0) { burstLeft = 0; return; }
  burstLeft--;
  burstNextAt = nowMs() + 60000 / def.rpm;
  fireOne(def, w);
}
function fireOne(def, w) {
  const t = nowMs();
  localShots = t - lastShotAt > def.recover * 1000 ? 0 : localShots + 1;
  lastShotAt = t;
  if (!def.melee) localSeq++;
  const dir = S.forwardOf(me.yaw + recoil.yaw, me.pitch + recoil.pitch);
  const isScoped = scoped && def.zoom > 1;
  socket.emit('shoot', { dir, scoped: isScoped, seq: def.melee ? 0 : localSeq });
  viewKick = 1;
  if (def.melee) { playSfx('swish'); return; }
  // Recul : la vue monte, puis part de côté après quelques balles
  recoil.pitch += def.kick * rand(0.85, 1.15);
  recoil.yaw += localShots > 3 ? rand(-1, 1) * def.kick * 0.7 : rand(-0.15, 0.15) * def.kick;
  muzzleFlash.intensity = def.silent ? 1.5 : 4;
  if (viewModel) muzzleFlash.position.copy(viewModel.localToWorld(viewModel.userData.muzzle.clone()));
  playSfx('shot', null, w.type);
}
let scopeKick = 0;
function currentSpread() {
  const w = curWeapon();
  if (!w) return 0;
  const def = S.WEAPONS[w.type];
  const shots = nowMs() - lastShotAt > def.recover * 1000 ? 0 : localShots + 1;
  return S.spreadOf(def, { speed: Math.hypot(me.vx, me.vz), air: !me.onGround, crouch: me.crouch, shots, scoped: scoped && def.zoom > 1 });
}

// =====================================================================
// Déplacement du joueur (calculé dans le navigateur)
// =====================================================================
let sendT = 0;
function updateMe(dt) {
  const m = myState();
  if (!m?.alive) return;
  const k = (c) => keys.has(c);
  let fx = 0, fz = 0;
  if (k('KeyW')) fz -= 1;
  if (k('KeyS')) fz += 1;
  if (k('KeyA')) fx -= 1;
  if (k('KeyD')) fx += 1;
  me.crouch = k('ControlLeft') || k('KeyC');
  const walking = k('ShiftLeft') || k('ShiftRight');
  // Pendant la pose / le désamorçage, on ne bouge pas
  const busy = interacting && (m.plantP > 0 || m.defuseP > 0 || canInteractHere());
  if (busy) { fx = 0; fz = 0; }
  const len = Math.hypot(fx, fz) || 1;
  fx /= len; fz /= len;
  const sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
  const wx = fx * cos + fz * sin, wz = -fx * sin + fz * cos;
  let max = me.crouch ? S.CROUCH_SPEED : walking ? S.WALK_SPEED : S.RUN_SPEED;
  const def = S.WEAPONS[curWeapon()?.type];
  if (scoped && def?.zoom > 1) max = Math.min(max, def.zoom >= 2.5 ? 2.2 : 3.6);
  max *= def?.move || 1; // les armes lourdes ralentissent, le couteau accélère
  const accel = me.onGround ? 14 : 2;
  me.vx += (wx * max - me.vx) * Math.min(1, accel * dt);
  me.vz += (wz * max - me.vz) * Math.min(1, accel * dt);
  if (jumpQueued && me.onGround && !busy) { me.vy = S.JUMP_SPEED; me.onGround = false; }
  jumpQueued = false;
  me.vy -= S.GRAVITY * dt;
  const boxes = dynBoxes();
  const h = me.crouch ? S.CROUCH_H : S.STAND_H;
  let nx = me.x + me.vx * dt, nz = me.z + me.vz * dt;
  [nx, nz] = S.collide(nx, nz, me.y, boxes, S.PLAYER_RADIUS, h);
  if (state.phase === 'buy') {
    const sp = S.SPAWNS[isAttacker() ? 'attack' : 'defense'];
    nx = S.clamp(nx, sp.x1, sp.x2); nz = S.clamp(nz, sp.z1, sp.z2);
  }
  me.x = nx; me.z = nz;
  me.y += me.vy * dt;
  const g = S.groundAt(me.x, me.z, Math.max(me.y, 0), boxes);
  if (me.y <= g) { me.y = g; me.vy = 0; me.onGround = true; }
  else me.onGround = me.y - g < 0.02;
  const eyeT = me.crouch ? S.EYE_CROUCH : S.EYE_STAND;
  me.eye += (eyeT - me.eye) * Math.min(1, dt * 14);
  sendT -= dt;
  if (sendT <= 0) {
    sendT = 1 / 30;
    socket.emit('input', { x: me.x, y: me.y, z: me.z, yaw: me.yaw + recoil.yaw, pitch: me.pitch + recoil.pitch,
      crouch: me.crouch, air: !me.onGround, speed: Math.hypot(me.vx, me.vz), scoped: scoped && def?.zoom > 1 });
  }
}
function canInteractHere() {
  if (!state) return false;
  const b = state.bomb;
  if (isAttacker()) return b.carrier === myId && state.phase === 'live' && !!S.siteAt(me.x, me.z);
  return b.state === 'planted' && Math.hypot(me.x - b.x, me.z - b.z) < 2;
}

// =====================================================================
// Caméra (première personne, ou spectateur quand on est mort)
// =====================================================================
function cycleSpectate() {
  if (!state) return;
  const mates = state.players.filter((p) => p.alive && p.team === myTeam() && p.id !== myId);
  const pool = mates.length ? mates : state.players.filter((p) => p.alive && p.id !== myId);
  if (!pool.length) { spectating = null; return; }
  const i = pool.findIndex((p) => p.id === spectating);
  spectating = pool[(i + 1) % pool.length].id;
}
function updateCamera(dt) {
  const m = myState();
  if (m?.alive || !state) {
    spectating = null;
    camera.position.set(me.x, me.y + me.eye, me.z);
    camera.rotation.set(me.pitch + recoil.pitch, me.yaw + recoil.yaw, 0);
    viewHolder.visible = !(scoped && S.WEAPONS[curWeapon()?.type]?.zoom >= 3);
  } else {
    // Mort : on suit un coéquipier
    const target = spectating && avatars.get(spectating);
    if (!target || !target.target?.alive) cycleSpectate();
    const a = spectating && avatars.get(spectating);
    if (a) {
      const p = a.target;
      camera.position.set(a.pos.x, a.pos.y + (p.crouch ? S.EYE_CROUCH : S.EYE_STAND), a.pos.z);
      camera.rotation.set(a.pitch, a.yaw, 0);
      $('spectate').innerHTML = `Tu regardes <b>${esc(roster.get(spectating)?.name || '')}</b> — clic pour changer`;
    } else {
      camera.position.set(0, 40, 30); camera.rotation.set(-1.0, 0, 0);
      $('spectate').textContent = 'En attente de la prochaine manche…';
    }
    viewHolder.visible = false;
  }
  if (shake > 0) {
    camera.position.x += rand(-1, 1) * shake * 0.15; camera.position.y += rand(-1, 1) * shake * 0.15;
    shake = Math.max(0, shake - dt * 1.5);
  }
  // Zoom (clic droit)
  const def = S.WEAPONS[curWeapon()?.type];
  scoped = aimDown && !!m?.alive && !!def && !isReloading();
  const targetFov = scoped && def ? BASE_FOV / def.zoom : BASE_FOV;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 18);
  camera.updateProjectionMatrix();
  $('scope').classList.toggle('hidden', !(scoped && def?.zoom >= 3));
}

// =====================================================================
// Animation de l'arme et du recul
// =====================================================================
let bobT = 0;
function updateViewModel(dt) {
  rebuildViewModel();
  const w = curWeapon();
  const def = w && S.WEAPONS[w.type];
  // Le recul revient doucement quand on arrête de tirer
  const sinceShot = nowMs() - lastShotAt;
  if (def && sinceShot > (60000 / def.rpm) * 1.3) {
    const r = Math.min(1, dt * 7);
    recoil.pitch -= recoil.pitch * r; recoil.yaw -= recoil.yaw * r;
  }
  if (!viewModel) return;
  const speed = Math.hypot(me.vx, me.vz);
  bobT += dt * speed * 1.7;
  const bob = me.onGround ? Math.min(1, speed / 5) : 0.3;
  viewKick = Math.max(0, viewKick - dt * 12);
  swapAnim = Math.max(0, swapAnim - dt * 3.5);
  const reloadT = isReloading() ? 1 : 0;
  viewModel.userData.reload = (viewModel.userData.reload || 0) + (reloadT - (viewModel.userData.reload || 0)) * Math.min(1, dt * 10);
  const rl = viewModel.userData.reload;
  const aimK = scoped && def?.zoom < 3 ? 1 : 0;
  viewModel.userData.aim = (viewModel.userData.aim || 0) + (aimK - (viewModel.userData.aim || 0)) * Math.min(1, dt * 14);
  const ak = viewModel.userData.aim;
  viewModel.scale.setScalar(0.72);
  viewModel.position.set(
    0.13 * (1 - ak) + Math.cos(bobT) * 0.012 * bob,
    -0.15 + ak * 0.06 - Math.abs(Math.sin(bobT)) * 0.014 * bob - rl * 0.12 - swapAnim * 0.25,
    -0.42 + viewKick * 0.05,
  );
  viewModel.rotation.set(viewKick * 0.08 + rl * 0.6, 0, rl * 0.3);
  muzzleFlash.intensity = Math.max(0, muzzleFlash.intensity - dt * 60);
}

// =====================================================================
// Sons (fabriqués avec WebAudio, sans fichiers)
// =====================================================================
let actx = null, noiseBuf = null, master = null;
function initAudio() {
  if (actx) return;
  try {
    actx = new AudioContext();
    master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.6, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { actx = null; }
}
const SHOT_SOUND = { dard: [2200, 0.12, 0.5], guepe: [2400, 0.09, 0.45], grenaille: [900, 0.3, 0.9], brise: [1500, 0.18, 0.7], cran: [1100, 0.25, 0.85],
  moustique: [2800, 0.08, 0.4], frelon: [2600, 0.09, 0.45], belier: [800, 0.35, 1], cyclone: [900, 0.25, 0.85],
  ronce: [1600, 0.14, 0.6], vigie: [1300, 0.2, 0.7], ressac: [3200, 0.07, 0.25], tempete: [1500, 0.16, 0.65],
  pic: [1000, 0.3, 0.8], jumelle: [750, 0.4, 0.95], faucon: [700, 0.45, 1], enclume: [1200, 0.14, 0.65], titan: [1000, 0.16, 0.7] };
function playSfx(kind, pos = null, extra = null) {
  if (!actx) return;
  const t = actx.currentTime;
  let vol = 1, pan = 0;
  if (pos) {
    const dx = pos.x - camera.position.x, dz = pos.z - camera.position.z, d = Math.hypot(dx, dz);
    vol = 1 / (1 + d * 0.09);
    if (kind === 'step') vol = Math.max(0, 1 - d / 22) * 0.6;
    const right = [Math.cos(camera.rotation.y), -Math.sin(camera.rotation.y)];
    pan = S.clamp((dx * right[0] + dz * right[1]) / (d || 1), -1, 1) * 0.8;
  }
  if (vol < 0.02) return;
  const out = actx.createGain(); out.gain.value = vol;
  const panner = actx.createStereoPanner(); panner.pan.value = pan;
  out.connect(panner).connect(master);
  const noise = (freq, q, dur, v) => {
    const src = actx.createBufferSource(); src.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = actx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur);
  };
  const tone = (freq, dur, v, type = 'sine', endFreq = null) => {
    const o = actx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = actx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur);
  };
  switch (kind) {
    case 'shot': { const [f, d, v] = SHOT_SOUND[extra] || SHOT_SOUND.dard; noise(f, 0.8, d, v); tone(120, d, v * 0.8, 'sine', 40); break; }
    case 'swish': noise(2500, 1.5, 0.12, 0.35); break;
    case 'hit': tone(1600, 0.05, 0.25, 'square'); break;
    case 'headshot': tone(2600, 0.18, 0.35); tone(3900, 0.12, 0.15); break;
    case 'step': noise(300, 1.2, 0.07, 0.5); break;
    case 'reload': noise(3000, 4, 0.05, 0.3); setTimeout(() => playSfx('click'), 400); break;
    case 'click': tone(900, 0.04, 0.2, 'square'); break;
    case 'beep': tone(2100, 0.07, 0.35, 'square'); break;
    case 'plant': tone(600, 0.3, 0.4, 'sawtooth', 1200); break;
    case 'defuse': tone(1200, 0.4, 0.4, 'sawtooth', 300); break;
    case 'start': tone(440, 0.15, 0.3, 'triangle'); setTimeout(() => playSfx('click'), 160); break;
    case 'ability': noise(1200, 2, 0.15, 0.3); break;
    case 'flash': noise(5000, 0.5, 0.4, 0.8); tone(3000, 0.6, 0.2); break;
    case 'heal': tone(500, 0.6, 0.25, 'sine', 900); break;
    case 'wall': noise(150, 0.7, 0.6, 1); break;
    case 'explode': noise(90, 0.5, 2.0, 1.5); tone(60, 1.6, 1, 'sine', 25); break;
  }
}

// =====================================================================
// Interface (HUD)
// =====================================================================
const timerLeft = () => (state ? Math.max(0, state.timer - (nowMs() - stateAt) / 1000) : 0);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const PHASE_LABEL = { waiting: 'Attente', buy: 'Achat', live: 'Combat', planted: 'Noyau posé', end: 'Fin de manche', matchEnd: 'Fin du match' };
let bannerTimer = null;
function banner(title, sub = '', ms = 2500, color = '#e9e6df') {
  $('bannerTitle').textContent = title; $('bannerTitle').style.color = color;
  $('bannerSub').textContent = sub;
  $('banner').classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => $('banner').classList.add('hidden'), ms);
}
function addFeed(html, team) {
  const d = document.createElement('div');
  d.innerHTML = html;
  d.style.setProperty('--c', S.TEAMS[team]?.css || '#888');
  $('feed').prepend(d);
  while ($('feed').children.length > 6) $('feed').lastChild.remove();
  setTimeout(() => d.remove(), 7000);
}
let hurtFlash = 0;
let hudT = 0;
function updateHud(dt) {
  if (!state) return;
  const m = state.me;
  // Crosshair : l'écart dépend de la dispersion actuelle
  const spread = currentSpread();
  const px = (spread / Math.tan((camera.fov * Math.PI) / 360)) * (innerHeight / 2);
  const gap = 3 + Math.min(60, px);
  const ch = $('crosshair');
  ch.querySelector('.t').style.top = `${-gap - 7}px`;
  ch.querySelector('.b').style.top = `${gap}px`;
  ch.querySelector('.l').style.left = `${-gap - 7}px`;
  ch.querySelector('.r').style.left = `${gap}px`;
  ch.style.display = m.alive && !(scoped && S.WEAPONS[curWeapon()?.type]?.zoom >= 3) ? '' : 'none';
  // Effets plein écran
  const fl = Math.max(0, (flashUntil - nowMs()) / 1000);
  $('flash').style.opacity = fl > 0 ? Math.min(1, fl / (flashDur * 0.55)) : 0;
  hurtFlash = Math.max(0, hurtFlash - dt * 1.5);
  $('hurt').style.opacity = hurtFlash;
  smokeScreen.style.opacity = insideSmoke() ? 0.94 : 0;

  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.1;
  const mine = myTeam(), theirs = S.otherTeam(mine);
  $('leftName').textContent = S.TEAMS[mine].name; $('leftName').style.color = S.TEAMS[mine].css;
  $('rightName').textContent = S.TEAMS[theirs].name; $('rightName').style.color = S.TEAMS[theirs].css;
  $('leftRole').textContent = state.attack === mine ? 'Attaque' : 'Défense';
  $('rightRole').textContent = state.attack === theirs ? 'Attaque' : 'Défense';
  $('leftScore').textContent = state.score[mine]; $('leftScore').style.color = S.TEAMS[mine].css;
  $('rightScore').textContent = state.score[theirs]; $('rightScore').style.color = S.TEAMS[theirs].css;
  const row = (team) => state.players.filter((p) => p.team === team).map((p) => `<i class="${p.alive ? '' : 'dead'}"></i>`).join('');
  $('leftAlive').innerHTML = row(mine); $('leftAlive').style.color = S.TEAMS[mine].css;
  $('rightAlive').innerHTML = row(theirs); $('rightAlive').style.color = S.TEAMS[theirs].css;
  $('timer').textContent = fmt(timerLeft());
  $('timer').classList.toggle('bomb', state.phase === 'planted');
  $('phaseLabel').textContent = PHASE_LABEL[state.phase] + (state.round ? ` · manche ${state.round}` : '');
  // Vie, gilet, argent, arme
  $('hp').textContent = m.alive ? m.hp : 0;
  $('hp').style.color = m.hp <= 30 ? '#ff6b5b' : '';
  $('armor').textContent = m.armor;
  $('money').textContent = `${m.money} ¤`;
  const w = curWeapon();
  if (w) {
    $('weaponName').textContent = S.WEAPONS[w.type].name;
    const melee = S.WEAPONS[w.type].melee;
    $('mag').textContent = melee ? '—' : localMag();
    $('reserve').textContent = melee ? '—' : w.reserve;
  }
  $('reloadHint').classList.toggle('hidden', !isReloading());
  const ag = S.AGENTS[m.agent];
  $('abilityName').textContent = `${ag.ability}`;
  $('charges').style.setProperty('--c', ag.css);
  $('charges').innerHTML = Array.from({ length: ag.charges }, (_, i) => `<i class="${i < m.charges ? '' : 'used'}"></i>`).join('');
  // Pose / désamorçage
  const pr = m.plantP > 0 ? ['Pose du Noyau', m.plantP / R.plantTime, '#ff7a2f'] : m.defuseP > 0 ? ['Désamorçage', m.defuseP / R.defuseTime, '#3fc7ff'] : null;
  $('progress').classList.toggle('hidden', !pr);
  if (pr) { $('progressLabel').textContent = pr[0]; $('progressFill').style.width = `${pr[1] * 100}%`; $('progressFill').style.background = pr[2]; }
  let hint = '';
  const b = state.bomb;
  if (m.alive && b.carrier === myId) hint = S.siteAt(me.x, me.z) && state.phase === 'live' ? 'Maintiens <kbd>F</kbd> (immobile) pour poser le Noyau' : 'Tu portes le Noyau — va sur le site A ou B (<kbd>G</kbd> pour le lâcher)';
  else if (m.alive && !isAttacker() && b.state === 'planted' && Math.hypot(me.x - b.x, me.z - b.z) < 2.5) hint = 'Maintiens <kbd>F</kbd> pour désamorcer (7 s)';
  $('bombHint').innerHTML = hint;
  $('bombHint').classList.toggle('hidden', !hint || !!pr);
  $('spectate').classList.toggle('hidden', m.alive);
  $('buyHint').classList.toggle('hidden', !(state.phase === 'buy' && m.alive && !shopOpen));
  if (shopOpen) renderShop();
  if (boardOpen) renderBoard();
  drawMinimap();
}
const smokeScreen = document.createElement('div');
Object.assign(smokeScreen.style, { position: 'fixed', inset: '0', background: '#8c86b0', opacity: 0, pointerEvents: 'none', zIndex: 2, transition: 'opacity .2s' });
document.body.appendChild(smokeScreen);
function insideSmoke() {
  const c = camera.position;
  for (const g of smokeMeshes.values()) {
    const s = g.userData.data;
    if (c.distanceTo(g.position) < s.r * 0.9 * g.scale.x) return true;
  }
  return false;
}
function updateSmokes() {
  for (const g of smokeMeshes.values()) {
    const age = (nowMs() - g.userData.born) / 1000;
    const left = g.userData.data.left - age;
    const grow = Math.min(1, 0.25 + age * 1.2);
    const fade = left < 1.5 ? Math.max(0.05, left / 1.5) : 1;
    g.scale.setScalar(grow * (0.6 + 0.4 * fade));
    g.rotation.y += 0.002;
  }
}

// Mini-carte
const mm = $('minimap').getContext('2d');
const MMS = 2; // pixels par mètre
const mmx = (x) => (x - S.MAP_BOUNDS.x1) * MMS, mmz = (z) => (z - S.MAP_BOUNDS.z1) * MMS;
function drawMinimap() {
  const c = mm;
  c.clearRect(0, 0, 200, 184);
  c.fillStyle = 'rgba(80,75,68,.55)'; c.fillRect(0, 0, 200, 184);
  for (const [k, s] of Object.entries(S.SITES)) {
    c.fillStyle = 'rgba(255,90,54,.18)'; c.fillRect(mmx(s.x1), mmz(s.z1), (s.x2 - s.x1) * MMS, (s.z2 - s.z1) * MMS);
    c.fillStyle = 'rgba(255,140,100,.9)'; c.font = 'bold 16px Segoe UI'; c.fillText(k, mmx(s.label[0]) - 5, mmz(s.label[1]) + 6);
  }
  c.fillStyle = '#1c1d20';
  for (const b of S.BOXES) c.fillRect(mmx(b.x1), mmz(b.z1), (b.x2 - b.x1) * MMS, (b.z2 - b.z1) * MMS);
  c.fillStyle = '#8a6f52';
  for (const w of state.walls) c.fillRect(mmx(w.x1), mmz(w.z1), (w.x2 - w.x1) * MMS, (w.z2 - w.z1) * MMS);
  c.fillStyle = 'rgba(157,149,201,.75)';
  for (const s of state.smokes) { c.beginPath(); c.arc(mmx(s.x), mmz(s.z), s.r * MMS, 0, Math.PI * 2); c.fill(); }
  const b = state.bomb;
  if (b.state === 'planted' || (isAttacker() && b.state === 'dropped')) {
    c.fillStyle = Math.sin(nowMs() / 150) > 0 ? '#ff5a36' : '#ffd36b';
    c.fillRect(mmx(b.x) - 4, mmz(b.z) - 4, 8, 8);
  }
  const eye = [camera.position.x, camera.position.y, camera.position.z];
  for (const p of state.players) {
    if (!p.alive) continue;
    const mine = p.team === myTeam();
    const isMe = p.id === myId;
    const pos = isMe ? me : (avatars.get(p.id)?.pos || p);
    if (!mine && !isMe) {
      // Les ennemis apparaissent seulement si on les voit
      if (!S.lineOfSight(eye[0], eye[1], eye[2], pos.x, pos.y + 1.3, pos.z, dynBoxes(), state.smokes)) continue;
      const fw = S.forwardOf(camera.rotation.y, 0), dx = pos.x - eye[0], dz = pos.z - eye[2];
      if ((fw[0] * dx + fw[2] * dz) / (Math.hypot(dx, dz) || 1) < 0.45) continue;
    }
    const yaw = isMe ? me.yaw : p.yaw;
    c.save();
    c.translate(mmx(pos.x), mmz(pos.z));
    c.rotate(-yaw);
    c.fillStyle = isMe ? '#ffffff' : mine ? S.TEAMS[p.team].css : '#ff3b3b';
    c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 4); c.lineTo(-4, 4); c.closePath(); c.fill();
    c.restore();
    if (mine && b.carrier === p.id) { c.fillStyle = '#ffd36b'; c.fillRect(mmx(pos.x) + 4, mmz(pos.z) - 8, 5, 5); }
  }
}

// Tableau des scores
function renderBoard() {
  if (!state) return;
  const mine = myTeam();
  const table = (team) => {
    const rows = state.players.filter((p) => p.team === team).sort((a, b) => b.k - a.k).map((p) => {
      const r = roster.get(p.id) || {};
      const money = team === mine ? `${p.money} ¤` : '—';
      return `<tr class="${p.id === myId ? 'me' : ''} ${p.alive ? '' : 'dead'}"><td style="color:${S.AGENTS[p.agent].css}">${S.AGENTS[p.agent].name}</td>
        <td>${esc(r.name || '?')}${r.isBot ? ' <small>(bot)</small>' : ''}</td><td>${p.k}</td><td>${p.d}</td><td>${money}</td><td>${p.alive ? p.hp : '✕'}</td></tr>`;
    }).join('');
    const role = state.attack === team ? 'Attaque' : 'Défense';
    return `<h3 style="color:${S.TEAMS[team].css}">${S.TEAMS[team].name} · ${role} · ${state.score[team]}</h3>
      <table><tr><th>Perso</th><th>Nom</th><th>Élim.</th><th>Morts</th><th>Argent</th><th>PV</th></tr>${rows}</table>`;
  };
  $('board').innerHTML = table(mine) + table(S.otherTeam(mine)) + `<small style="color:#9a9790">Manche ${state.round} · ${R.winRounds} manches pour gagner · changement de côté après ${R.halfRounds}</small>`;
}

// Magasin
function toggleShop(force) {
  const open = force ?? !shopOpen;
  if (open && !(state?.phase === 'buy' && myState()?.alive)) { if (!shopOpen) banner('Magasin fermé', 'On ne peut acheter que pendant la phase d’achat', 1400); return; }
  shopOpen = open;
  $('shop').classList.toggle('hidden', !open);
  if (open) { document.exitPointerLock?.(); renderShop(); }
  else { $('pause').classList.add('hidden'); lockPointer(); }
}
$('shopClose').onclick = () => toggleShop(false);
function renderShop() {
  const m = myState();
  if (!m) return;
  $('shopMoney').textContent = `${m.money} ¤`;
  $('shopTimer').textContent = `Temps restant : ${Math.ceil(timerLeft())} s`;
  const item = (id, def, owned, bought, price, stats) => `
    <button class="item ${owned ? 'owned' : ''} ${bought ? 'bought' : ''} ${!owned && price > m.money + (bought || 0) ? 'cant' : ''}" data-item="${id}">
      <b>${def.name}</b><span class="price">${price ? price + ' ¤' : 'Gratuit'}</span>${owned ? ' · <small>équipé</small>' : ''}
      <span class="stats">${stats}</span></button>`;
  const cols = S.SHOP.map((col) => `<div class="shop-col">${col.map((grp) => `<h3>${grp.cat}</h3>${grp.items.map((id) => {
    const w = S.WEAPONS[id];
    const owned = m.weapons[w.slot]?.type === id;
    const bought = owned && m.bought[w.slot];
    const mode = w.pellets ? `${w.pellets} plombs` : w.burst ? `rafale de ${w.burst}` : w.auto ? 'automatique' : 'coup par coup';
    return item(id, w, owned, bought, w.price, `${w.cat}<br>${w.pellets ? w.pellets + ' × ' : ''}${w.dmg} dégâts · tête ×${w.head}<br>${mode} · ${w.mag} balles`);
  }).join('')}`).join('')}</div>`);
  cols.push(`<div class="shop-col"><h3>Gilets</h3>${Object.entries(S.ARMORS).map(([id, a]) => {
    const owned = m.armor >= a.value && (m.bought.armor ? m.bought.armor === a.price : true);
    return item(id, a, owned && m.armor > 0, owned && m.bought.armor, a.price, `+${a.value} points de protection<br>absorbe les dégâts avant tes PV`);
  }).join('')}</div>`);
  const html = cols.join('');
  if ($('shopGrid')._html !== html) {
    $('shopGrid').innerHTML = html; $('shopGrid')._html = html;
    for (const b of $('shopGrid').querySelectorAll('.item')) b.onclick = () => {
      const id = b.dataset.item;
      const slot = S.WEAPONS[id]?.slot || 'armor';
      if (b.classList.contains('bought')) socket.emit('sell', slot);
      else socket.emit('buy', id);
      playSfx('click');
    };
  }
}

// =====================================================================
// Boucle principale
// =====================================================================
let last = nowMs();
function frame() {
  requestAnimationFrame(frame);
  const t = nowMs();
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (state && joined) {
    updateMe(dt);
    if (mouseDown && locked && myState()?.alive) tryFire();
    updateBurst();
    updateViewModel(dt);
  }
  updateAvatars(dt);
  updateBomb(dt);
  updateSmokes();
  updateEffects(dt);
  if (joined) { updateCamera(dt); updateHud(dt); }
  else {
    // Accueil : la caméra tourne lentement au-dessus de la carte
    const a = t / 9000;
    camera.position.set(Math.sin(a) * 45, 28, Math.cos(a) * 45);
    camera.lookAt(0, 0, -5);
  }
  renderer.render(scene, camera);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
// Petit outil de test, utilisable dans la console du navigateur (F12) : rupture.state, rupture.me…
window.rupture = { me, get state() { return state; }, controlsWithoutMouseLock() { locked = true; }, fire: () => { triggerReleased = true; tryFire(); } };
frame();
