// Code partagé entre le serveur (Node.js) et le navigateur.
// On y met tout ce que les deux côtés doivent connaître de la même façon :
// règles, armes, personnages, carte, collisions et calcul de la précision.

// ---------------------------------------------------------------------
// Joueur et déplacements
// ---------------------------------------------------------------------
export const PLAYER_RADIUS = 0.4;
export const STAND_H = 1.8;          // taille debout (m)
export const CROUCH_H = 1.3;         // taille accroupi
export const EYE_STAND = 1.62;       // hauteur des yeux debout
export const EYE_CROUCH = 1.12;
export const RUN_SPEED = 5.4;        // course (m/s)
export const WALK_SPEED = 2.6;       // marche silencieuse (Maj)
export const CROUCH_SPEED = 2.0;
export const GRAVITY = 20;
export const JUMP_SPEED = 6.2;
export const STEP = 0.45;            // hauteur qu'on franchit sans sauter

// ---------------------------------------------------------------------
// Règles d'une partie
// ---------------------------------------------------------------------
export const RULES = {
  teamSize: 5,
  buyTime: 20,        // phase d'achat (s)
  roundTime: 100,     // durée d'une manche (s)
  bombTime: 40,       // le Noyau explose 40 s après avoir été posé
  plantTime: 4,       // temps pour poser (s)
  defuseTime: 7,      // temps pour désamorcer (s)
  endTime: 6,         // pause entre deux manches
  halfRounds: 12,     // changement de côté après 12 manches
  winRounds: 13,      // la première équipe à 13 manches gagne
  matchEndTime: 12,
  startMoney: 800,
  maxMoney: 9000,
  winReward: 3000,
  lossReward: 1900,
  lossBonus: 500,     // +500 par défaite d'affilée…
  lossMax: 2900,      // …jusqu'à 2900
  killReward: 200,
  plantReward: 300,   // pour toute l'équipe d'attaque
  explodeRadius: 14,
};

export const TEAMS = {
  braise: { name: 'Braise', color: 0xff7a2f, css: '#ff7a2f' },
  givre: { name: 'Givre', color: 0x3fc7ff, css: '#3fc7ff' },
};
export const otherTeam = (t) => (t === 'braise' ? 'givre' : 'braise');

// ---------------------------------------------------------------------
// Armes (noms et valeurs originaux)
//  dmg      : dégâts au corps        head/leg : multiplicateurs tête / jambes
//  rpm      : cadence (balles/min)   auto     : tir automatique en maintenant le clic
//  base     : dispersion à l'arrêt (radians)   run : dispersion ajoutée en courant
//  air      : dispersion en l'air    bloom    : dispersion ajoutée à chaque balle d'une rafale
//  kick     : recul vertical par balle (la vue monte)   recover : temps pour que la rafale "se calme"
//  falloff  : [distance, multiplicateur] au-delà de cette distance
// ---------------------------------------------------------------------
//  pellets  : nombre de plombs par tir (fusils à pompe)     burst : balles par rafale (+ burstDelay ms de pause)
//  move     : vitesse de déplacement quand on tient l'arme (1 = normale)
//  scopedBase : dispersion quand on vise à la lunette
export const WEAPONS = {
  // ---- Pistolets ----
  dard: { name: 'Dard', cat: 'Pistolet', slot: 'secondary', price: 0, dmg: 26, head: 3, leg: 0.8, rpm: 380, auto: false,
    mag: 12, reserve: 36, reload: 1.6, base: 0.004, run: 0.045, air: 0.15, bloom: 0.012, maxBloom: 0.05, kick: 0.012,
    recover: 0.28, falloff: [22, 0.8], zoom: 1.15, color: 0x9aa4b0 },
  guepe: { name: 'Guêpe', cat: 'Pistolet automatique', slot: 'secondary', price: 450, dmg: 22, head: 2.6, leg: 0.8, rpm: 600, auto: true,
    mag: 14, reserve: 42, reload: 1.5, base: 0.01, run: 0.03, air: 0.14, bloom: 0.009, maxBloom: 0.05, kick: 0.009,
    recover: 0.3, falloff: [14, 0.75], zoom: 1.1, color: 0xe0b23a },
  grenaille: { name: 'Grenaille', cat: 'Pistolet à plombs', slot: 'secondary', price: 300, dmg: 12, head: 3, leg: 0.8, rpm: 200, auto: false,
    pellets: 12, mag: 2, reserve: 6, reload: 1.8, base: 0.07, run: 0.02, air: 0.1, bloom: 0, maxBloom: 0, kick: 0.04,
    recover: 0.5, falloff: [7, 0.5], zoom: 1, color: 0x8b5a3c },
  brise: { name: 'Brise', cat: 'Pistolet lourd', slot: 'secondary', price: 500, dmg: 42, head: 4, leg: 0.8, rpm: 150, auto: false,
    mag: 7, reserve: 21, reload: 2.0, base: 0.003, run: 0.065, air: 0.18, bloom: 0.025, maxBloom: 0.07, kick: 0.035,
    recover: 0.4, falloff: [28, 0.85], zoom: 1.15, color: 0xc9a227 },
  cran: { name: 'Cran', cat: 'Revolver', slot: 'secondary', price: 800, dmg: 55, head: 3.3, leg: 0.8, rpm: 160, auto: false,
    mag: 6, reserve: 24, reload: 2.2, base: 0.0035, run: 0.07, air: 0.2, bloom: 0.04, maxBloom: 0.09, kick: 0.05,
    recover: 0.45, falloff: [30, 0.85], zoom: 1.2, color: 0xb8b8b8 },
  // ---- Mitraillettes ----
  moustique: { name: 'Moustique', cat: 'Mitraillette légère', slot: 'primary', price: 1100, dmg: 25, head: 2.5, leg: 0.8, rpm: 900, auto: true,
    mag: 20, reserve: 60, reload: 2.1, base: 0.012, run: 0.02, air: 0.12, bloom: 0.006, maxBloom: 0.06, kick: 0.006,
    recover: 0.28, falloff: [15, 0.75], zoom: 1.15, color: 0x6fc2d0 },
  frelon: { name: 'Frelon', cat: 'Mitraillette', slot: 'primary', price: 1600, dmg: 24, head: 2.5, leg: 0.8, rpm: 780, auto: true,
    mag: 25, reserve: 75, reload: 2.2, base: 0.006, run: 0.022, air: 0.12, bloom: 0.005, maxBloom: 0.045, kick: 0.007,
    recover: 0.3, falloff: [18, 0.75], zoom: 1.15, color: 0x58c46a },
  // ---- Fusils à pompe ----
  belier: { name: 'Bélier', cat: 'Fusil à pompe', slot: 'primary', price: 900, dmg: 11, head: 3, leg: 0.8, rpm: 70, auto: false,
    pellets: 14, mag: 5, reserve: 10, reload: 2.4, base: 0.065, run: 0.02, air: 0.12, bloom: 0, maxBloom: 0, kick: 0.05,
    recover: 0.9, falloff: [9, 0.55], zoom: 1, color: 0x9c4a2f, move: 0.97 },
  cyclone: { name: 'Cyclone', cat: 'Fusil à pompe automatique', slot: 'primary', price: 1850, dmg: 10, head: 3, leg: 0.8, rpm: 210, auto: true,
    pellets: 10, mag: 7, reserve: 21, reload: 2.2, base: 0.075, run: 0.02, air: 0.12, bloom: 0.004, maxBloom: 0.02, kick: 0.03,
    recover: 0.4, falloff: [9, 0.55], zoom: 1, color: 0xd07a2a, move: 0.95 },
  // ---- Fusils ----
  ronce: { name: 'Ronce', cat: 'Fusil à rafale', slot: 'primary', price: 2050, dmg: 33, head: 3.3, leg: 0.85, rpm: 900, auto: false,
    burst: 3, burstDelay: 330, mag: 24, reserve: 72, reload: 2.4, base: 0.0025, run: 0.07, air: 0.2, bloom: 0.004, maxBloom: 0.03,
    kick: 0.009, recover: 0.4, falloff: [40, 0.9], zoom: 1.35, color: 0x6a8f3c },
  vigie: { name: 'Vigie', cat: 'Fusil semi-automatique', slot: 'primary', price: 2200, dmg: 45, head: 3.5, leg: 0.85, rpm: 280, auto: false,
    mag: 15, reserve: 45, reload: 2.4, base: 0.0018, run: 0.07, air: 0.2, bloom: 0.016, maxBloom: 0.05, kick: 0.022,
    recover: 0.35, falloff: [50, 0.9], zoom: 1.5, color: 0x7f8cff },
  ressac: { name: 'Ressac', cat: "Fusil d'assaut silencieux", slot: 'primary', price: 2900, dmg: 37, head: 4, leg: 0.85, rpm: 660, auto: true,
    mag: 30, reserve: 60, reload: 2.5, base: 0.002, run: 0.075, air: 0.22, bloom: 0.006, maxBloom: 0.055, kick: 0.011,
    recover: 0.3, falloff: [16, 0.85], zoom: 1.25, color: 0x5b6b8a, silent: true },
  tempete: { name: 'Tempête', cat: "Fusil d'assaut lourd", slot: 'primary', price: 2900, dmg: 39, head: 4, leg: 0.85, rpm: 600, auto: true,
    mag: 25, reserve: 75, reload: 2.5, base: 0.0022, run: 0.08, air: 0.22, bloom: 0.008, maxBloom: 0.07, kick: 0.014,
    recover: 0.32, falloff: [999, 1], zoom: 1.25, color: 0xe2553f },
  // ---- Précision ----
  pic: { name: 'Pic', cat: 'Carabine à verrou', slot: 'primary', price: 950, dmg: 101, head: 2, leg: 0.85, rpm: 90, auto: false,
    mag: 5, reserve: 10, reload: 2.6, base: 0.05, scopedBase: 0.0008, run: 0.12, air: 0.3, bloom: 0.03, maxBloom: 0.06, kick: 0.04,
    recover: 0.7, falloff: [999, 1], zoom: 2.5, color: 0x8c7a5b },
  jumelle: { name: 'Jumelle', cat: 'Fusil à deux coups', slot: 'primary', price: 2400, dmg: 140, head: 2, leg: 0.85, rpm: 120, auto: false,
    mag: 2, reserve: 10, reload: 3.6, base: 0.07, scopedBase: 0.0005, run: 0.14, air: 0.3, bloom: 0.04, maxBloom: 0.08, kick: 0.05,
    recover: 0.8, falloff: [999, 1], zoom: 2.5, color: 0x4d3b2a, move: 0.95 },
  faucon: { name: 'Faucon', cat: 'Fusil de précision lourd', slot: 'primary', price: 4700, dmg: 150, head: 1.7, leg: 0.85, rpm: 42, auto: false,
    mag: 5, reserve: 15, reload: 3.5, base: 0.09, scopedBase: 0.0004, run: 0.15, air: 0.3, bloom: 0.05, maxBloom: 0.1, kick: 0.06,
    recover: 1.2, falloff: [999, 1], zoom: 4, color: 0x2f9e8f, move: 0.92 },
  // ---- Mitrailleuses ----
  enclume: { name: 'Enclume', cat: 'Mitrailleuse légère', slot: 'primary', price: 1600, dmg: 28, head: 3, leg: 0.85, rpm: 600, auto: true,
    mag: 50, reserve: 100, reload: 3.2, base: 0.006, run: 0.06, air: 0.2, bloom: 0.006, maxBloom: 0.07, kick: 0.009,
    recover: 0.35, falloff: [30, 0.85], zoom: 1.25, color: 0x707a4a, move: 0.92 },
  titan: { name: 'Titan', cat: 'Mitrailleuse lourde', slot: 'primary', price: 3200, dmg: 34, head: 2.6, leg: 0.85, rpm: 720, auto: true,
    mag: 100, reserve: 100, reload: 5, base: 0.008, run: 0.07, air: 0.2, bloom: 0.005, maxBloom: 0.08, kick: 0.008,
    recover: 0.35, falloff: [30, 0.9], zoom: 1.25, color: 0x3d4a5c, move: 0.88 },
  // ---- Couteau (toujours dans la poche, touche 3) ----
  lame: { name: 'Lame', cat: 'Couteau', slot: 'melee', price: 0, dmg: 50, head: 1.5, leg: 1, rpm: 110, auto: true, melee: true,
    range: 2.4, base: 0, run: 0, air: 0, bloom: 0, maxBloom: 0, kick: 0, recover: 0.5, falloff: [999, 1], zoom: 1, color: 0x8a8f96, move: 1.08 },
};
// Magasin : 4 colonnes, chacune avec une ou plusieurs catégories
export const SHOP = [
  [{ cat: 'Pistolets', items: ['dard', 'guepe', 'grenaille', 'brise', 'cran'] }],
  [{ cat: 'Mitraillettes', items: ['moustique', 'frelon'] }, { cat: 'Fusils à pompe', items: ['belier', 'cyclone'] }],
  [{ cat: 'Fusils', items: ['ronce', 'vigie', 'ressac', 'tempete'] }],
  [{ cat: 'Précision', items: ['pic', 'jumelle', 'faucon'] }, { cat: 'Mitrailleuses', items: ['enclume', 'titan'] }],
];
export const ARMORS = {
  leger: { name: 'Gilet léger', price: 400, value: 25 },
  lourd: { name: 'Gilet lourd', price: 1000, value: 50 },
};

// ---------------------------------------------------------------------
// Personnages (originaux) : chacun a une capacité (touche E par défaut)
// ---------------------------------------------------------------------
export const AGENTS = {
  brume: { name: 'Brume', role: 'Contrôle', color: 0x8a7cff, css: '#8a7cff', ability: 'Voile',
    desc: 'Lance une capsule qui forme un nuage de fumée opaque pendant 15 s. Personne ne voit à travers.', charges: 2 },
  lueur: { name: 'Lueur', role: 'Ouverture', color: 0xffd23f, css: '#ffd23f', ability: 'Éclair',
    desc: 'Lance une sphère qui éclate et aveugle ceux qui la regardent (jusqu’à 2,5 s). Retourne-toi pour l’éviter.', charges: 2 },
  rocaille: { name: 'Rocaille', role: 'Défense', color: 0xb07a46, css: '#b07a46', ability: 'Rempart',
    desc: 'Fait surgir un mur de pierre de 6 m qui bloque passages et balles pendant 18 s (ou jusqu’à sa destruction).', charges: 1 },
  aloe: { name: 'Aloé', role: 'Soutien', color: 0x3ddc84, css: '#3ddc84', ability: 'Onde de soin',
    desc: 'Soigne toi-même et tes alliés à moins de 7 m : +60 PV en 3 secondes.', charges: 2 },
};
export const ABILITY = {
  smokeRange: 28, smokeRadius: 4.6, smokeTime: 15,
  flashRange: 14, flashDelay: 0.5, flashMax: 2.5,
  wallRange: 9, wallLen: 6, wallH: 3.2, wallT: 0.6, wallHp: 800, wallTime: 18,
  healRadius: 7, healAmount: 60, healTime: 3,
};

// ---------------------------------------------------------------------
// Carte originale « Raffinerie » : boîtes [x1, z1, x2, z2, hauteur, type]
// x va de -50 (ouest) à 50 (est), z de -46 (nord, défense) à 46 (sud, attaque)
// ---------------------------------------------------------------------
const RAW = [
  // Murs extérieurs
  [-51, -47, 51, -46, 8, 'outer'], [-51, 46, 51, 47, 8, 'outer'], [-51, -47, -50, 47, 8, 'outer'], [50, -47, 51, 47, 8, 'outer'],
  // Blocs du milieu (séparent les trois couloirs)
  [-20, 14, -8, 28, 5, 'wall'], [-20, -8, -8, 8, 5, 'wall'],     // ouest : passage « Liaison A » entre z 8 et 14
  [8, 20, 20, 28, 5, 'wall'], [8, -8, 20, 14, 5, 'wall'],        // est : passage « Liaison B » entre z 14 et 20
  [-14, -30, 14, -14, 6, 'wall'],                               // grand bâtiment central de la défense
  // Goulots d'étranglement
  [-50, -4, -38, 0, 5, 'wall'], [-28, -4, -20, 0, 5, 'wall'],    // entrée du site A
  [20, 2, 30, 6, 5, 'wall'], [40, 2, 50, 6, 5, 'wall'],          // entrée du site B
  // Murs arrière des sites (côté défense)
  [-50, -34, -26, -32, 4, 'wall'], [26, -34, 50, -32, 4, 'wall'],
  // Site A : couverts
  [-36, -24, -32, -20, 1.3, 'crate'], [-28, -16, -25, -13, 2.4, 'crate'], [-46, -14, -43, -11, 1.1, 'crate'],
  [-40, -30, -38, -26, 2.4, 'low'],
  // Site B : couverts
  [30, -22, 34, -18, 1.3, 'crate'], [40, -14, 43, -11, 2.4, 'crate'], [24, -28, 27, -25, 1.1, 'crate'],
  [44, -30, 46, -24, 2.4, 'low'],
  // Couloirs
  [-45, 12, -42, 15, 1.2, 'crate'], [-30, 20, -27, 23, 1.6, 'crate'],
  [40, 16, 43, 19, 1.3, 'crate'], [24, 10, 27, 13, 1.2, 'crate'],
  [-2, 8, 2, 11, 1.2, 'crate'], [-4, -13, -1, -11, 1.1, 'crate'], [3, 20, 5, 23, 2.2, 'crate'],
  // Zones d'apparition
  [-6, 38, -2, 41, 1.2, 'crate'], [10, -42, 13, -39, 1.2, 'crate'],
  // Cuves (décor, bloquent comme des boîtes)
  [-47, 33, -41, 39, 6, 'tank'], [41, 33, 47, 39, 6, 'tank'], [-47, -44, -41, -38, 6, 'tank'], [41, -44, 47, -38, 6, 'tank'],
];
export const BOXES = RAW.map(([x1, z1, x2, z2, h, kind], i) => ({ id: i, x1, z1, x2, z2, y1: 0, y2: h, kind }));
export const MAP_NAME = 'Raffinerie';
export const MAP_BOUNDS = { x1: -50, z1: -46, x2: 50, z2: 46 };

// Sites de pose
export const SITES = {
  A: { x1: -48, z1: -31, x2: -21, z2: -9, label: [-33, -17] },
  B: { x1: 22, z1: -31, x2: 48, z2: -7, label: [36, -15] },
};
export function siteAt(x, z) {
  for (const [k, s] of Object.entries(SITES)) if (x > s.x1 && x < s.x2 && z > s.z1 && z < s.z2) return k;
  return null;
}
// Zones d'apparition (pendant la phase d'achat, on ne peut pas en sortir)
export const SPAWNS = {
  attack: { x1: -20, z1: 32, x2: 20, z2: 45, yaw: 0 },        // regarde vers le nord (-z)
  defense: { x1: -24, z1: -45.5, x2: 24, z2: -35, yaw: Math.PI },
};
export const SPAWN_POINTS = {
  attack: [[0, 42], [-6, 43], [6, 43], [-12, 41], [12, 41], [-3, 36], [3, 36]],
  defense: [[0, -40], [-6, -41], [6, -41], [-14, -39], [16, -40], [-3, -36], [3, -36]],
};

// Points de passage pour les bots (reliés automatiquement quand ils se voient)
export const NAV_POINTS = [
  [0, 40], [-12, 40], [12, 40], [-30, 38], [30, 38], [-35, 31], [35, 31], [0, 32],
  [-35, 24], [-42, 20], [-35, 12], [-25, 11], [-35, 5], [-33, -2], [-33, -7],
  [-14, 11], [0, 24], [0, 16], [5, 6], [0, 0], [0, -5], [0, -11],
  [-10, -11], [-17, -11], [10, -11], [17, -11],
  [4, 17], [14, 17], [24, 17], [35, 25], [31, 18], [35, 10], [35, 4], [35, -2],
  [-33, -12], [-40, -18], [-30, -18], [-22, -21], [-44, -26], [-34, -28], [-17, -20], [-17, -28], [-20, -31],
  [0, -40], [-12, -40], [16, -36], [-20, -36], [20, -36],
  [35, -6], [28, -12], [38, -20], [28, -22], [40, -28], [23, -18], [17, -20], [17, -28], [20, -31],
];
// Positions de garde des défenseurs : [x, z, regard x, regard z]
export const HOLD_SPOTS = {
  A: [[-40, -18, -33, -2], [-22, -21, -33, -4], [-44, -26, -33, -4]],
  B: [[28, -12, 35, 4], [40, -28, 35, 4], [23, -18, 34, 3]],
  mid: [[0, -11, 0, 12], [-17, -11, -14, 11]],
};

// ---------------------------------------------------------------------
// Outils mathématiques
// ---------------------------------------------------------------------
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const forwardOf = (yaw, pitch = 0) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];

// Repousse un cercle (le joueur) hors des boîtes trop hautes pour être enjambées
export function collide(x, z, y, boxes, r = PLAYER_RADIUS, h = STAND_H) {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      if (b.y2 <= y + STEP || b.y1 >= y + h) continue;
      const cx = clamp(x, b.x1, b.x2), cz = clamp(z, b.z1, b.z2);
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r; z = cz + (dz / d) * r;
      } else {
        const pl = x - b.x1, pr = b.x2 - x, pd = z - b.z1, pu = b.z2 - z, m = Math.min(pl, pr, pd, pu);
        if (m === pl) x = b.x1 - r; else if (m === pr) x = b.x2 + r; else if (m === pd) z = b.z1 - r; else z = b.z2 + r;
      }
    }
  }
  return [clamp(x, MAP_BOUNDS.x1 + r, MAP_BOUNDS.x2 - r), clamp(z, MAP_BOUNDS.z1 + r, MAP_BOUNDS.z2 - r)];
}
// Hauteur du sol sous le joueur (0, ou le dessus d'une caisse sur laquelle il se tient)
export function groundAt(x, z, y, boxes, r = PLAYER_RADIUS * 0.7) {
  let g = 0;
  for (const b of boxes) {
    if (b.y2 > y + STEP + 0.01 || b.y2 <= g) continue;
    if (x > b.x1 - r && x < b.x2 + r && z > b.z1 - r && z < b.z2 + r) g = b.y2;
  }
  return g;
}
// Rayon contre boîte (méthode des "dalles") : renvoie la distance t, ou Infinity
export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const axes = [[ox, dx, b.x1, b.x2], [oy, dy, b.y1, b.y2], [oz, dz, b.z1, b.z2]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tc = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
  if (d2 > r * r) return Infinity;
  const th = Math.sqrt(r * r - d2);
  const t = tc - th;
  return t >= 0 ? t : tc + th >= 0 ? 0 : Infinity;
}
// Premier mur touché par un rayon (dans la limite maxT)
export function rayWalls(ox, oy, oz, dx, dy, dz, boxes, maxT = 200) {
  let best = maxT, hit = null;
  for (const b of boxes) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, b);
    if (t < best) { best = t; hit = b; }
  }
  if (oy + dy * best < 0 && dy < 0) { const tg = -oy / dy; if (tg < best) { best = tg; hit = 'ground'; } }
  return { t: best, box: hit };
}
// Un segment traverse-t-il une fumée ?
export function segmentInSmoke(ax, ay, az, bx, by, bz, smokes) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len2 = dx * dx + dy * dy + dz * dz || 1;
  for (const s of smokes) {
    let t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2;
    t = clamp(t, 0, 1);
    const px = ax + dx * t - s.x, py = ay + dy * t - s.y, pz = az + dz * t - s.z;
    if (px * px + py * py + pz * pz < (s.r * 0.92) ** 2) return true;
  }
  return false;
}
// Ligne de vue entre deux points (murs + fumées)
export function lineOfSight(ax, ay, az, bx, by, bz, boxes, smokes = []) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const { t } = rayWalls(ax, ay, az, dx / len, dy / len, dz / len, boxes, len);
  if (t < len - 0.05) return false;
  return !segmentInSmoke(ax, ay, az, bx, by, bz, smokes);
}

// Zones touchables d'un joueur : tête (sphère), torse et jambes (boîtes)
export function hitZones(p) {
  const h = p.crouch ? CROUCH_H : STAND_H;
  return {
    head: { cx: p.x, cy: p.y + h - 0.2, cz: p.z, r: 0.2 },
    body: { x1: p.x - 0.3, x2: p.x + 0.3, z1: p.z - 0.3, z2: p.z + 0.3, y1: p.y + h * 0.47, y2: p.y + h - 0.38 },
    legs: { x1: p.x - 0.25, x2: p.x + 0.25, z1: p.z - 0.25, z2: p.z + 0.25, y1: p.y, y2: p.y + h * 0.47 },
  };
}
export function rayPlayer(ox, oy, oz, dx, dy, dz, p) {
  const z = hitZones(p);
  const th = raySphere(ox, oy, oz, dx, dy, dz, z.head.cx, z.head.cy, z.head.cz, z.head.r);
  const tb = rayBox(ox, oy, oz, dx, dy, dz, z.body);
  const tl = rayBox(ox, oy, oz, dx, dy, dz, z.legs);
  const t = Math.min(th, tb, tl);
  if (t === Infinity) return null;
  return { t, zone: t === th ? 'head' : t === tb ? 'body' : 'legs' };
}

// ---------------------------------------------------------------------
// Précision : dispersion (en radians) d'une balle selon la situation.
// À l'arrêt, la première balle part quasiment au centre du viseur.
// En courant, en sautant ou en rafale, la dispersion augmente fortement.
// s = { speed, air, crouch, shots (n° de la balle dans la rafale), scoped }
// ---------------------------------------------------------------------
export function spreadOf(w, s) {
  let base = w.scopedBase !== undefined ? (s.scoped ? w.scopedBase : w.base) : w.base;
  const move = clamp((s.speed - 0.6) / (RUN_SPEED - 0.6), 0, 1);
  let sp = base + w.run * move * move;
  if (s.air) sp += w.air;
  sp += Math.min(w.maxBloom, Math.max(0, s.shots) * w.bloom);
  if (s.crouch && !s.air) sp *= 0.8;
  return sp;
}
export function damageFor(w, zone, dist) {
  let d = w.dmg * (zone === 'head' ? w.head : zone === 'legs' ? w.leg : 1);
  if (dist > w.falloff[0]) d *= w.falloff[1];
  return Math.round(d);
}
