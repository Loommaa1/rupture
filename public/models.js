// Modèles 3D faits avec des formes simples : armes, personnages, Noyau, textures de la carte.
import * as THREE from 'three';
import { WEAPONS, AGENTS, TEAMS } from './shared.js';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...o });
const dark = mat(0x22252a, { metalness: 0.6, roughness: 0.4 });
const grey = mat(0x4b5058, { metalness: 0.6, roughness: 0.35 });
const grip = mat(0x1a1b1d, { roughness: 0.9 });

function box(g, m, w, h, d, x, y, z, rx = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
function tube(g, m, r, len, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

// Chaque arme pointe vers -z ; userData.muzzle = position du bout du canon
const BUILD = {
  dard(g, a) {
    box(g, dark, 0.06, 0.08, 0.26, 0, 0.04, -0.08); box(g, a, 0.062, 0.02, 0.16, 0, 0.0, -0.06);
    box(g, grip, 0.05, 0.15, 0.07, 0, -0.06, 0.03, 0.2); return -0.22;
  },
  brise(g, a) {
    box(g, dark, 0.07, 0.1, 0.32, 0, 0.05, -0.1); box(g, a, 0.072, 0.03, 0.2, 0, 0.0, -0.08);
    box(g, grip, 0.06, 0.17, 0.08, 0, -0.07, 0.04, 0.25); tube(g, grey, 0.018, 0.06, 0, 0.06, -0.29); return -0.32;
  },
  frelon(g, a) {
    box(g, dark, 0.08, 0.12, 0.42, 0, 0, -0.1); box(g, a, 0.082, 0.04, 0.2, 0, 0.04, -0.12);
    box(g, grip, 0.06, 0.16, 0.07, 0, -0.12, 0.04, 0.2); box(g, grey, 0.05, 0.2, 0.06, 0, -0.14, -0.14, -0.1);
    tube(g, grey, 0.02, 0.14, 0, 0.02, -0.38); box(g, dark, 0.05, 0.06, 0.18, 0, 0, 0.18); return -0.45;
  },
  vigie(g, a) {
    box(g, dark, 0.08, 0.12, 0.6, 0, 0, -0.15); box(g, a, 0.082, 0.04, 0.3, 0, 0.03, -0.2);
    box(g, grip, 0.06, 0.16, 0.07, 0, -0.12, 0.05, 0.2); box(g, grey, 0.05, 0.16, 0.07, 0, -0.12, -0.14);
    tube(g, grey, 0.022, 0.3, 0, 0.02, -0.58); box(g, dark, 0.07, 0.1, 0.22, 0, -0.02, 0.24);
    tube(g, grey, 0.03, 0.18, 0, 0.1, -0.12); return -0.73;
  },
  tempete(g, a) {
    box(g, dark, 0.085, 0.13, 0.56, 0, 0, -0.14); box(g, a, 0.087, 0.05, 0.24, 0, 0.03, -0.3);
    box(g, grip, 0.06, 0.17, 0.07, 0, -0.12, 0.05, 0.2); box(g, grey, 0.05, 0.22, 0.08, 0, -0.15, -0.12, -0.25);
    tube(g, grey, 0.022, 0.26, 0, 0.02, -0.53); box(g, dark, 0.07, 0.12, 0.24, 0, -0.02, 0.24);
    box(g, grey, 0.03, 0.04, 0.16, 0, 0.09, -0.1); return -0.66;
  },
  faucon(g, a) {
    box(g, dark, 0.08, 0.12, 0.7, 0, 0, -0.15); box(g, a, 0.082, 0.05, 0.3, 0, -0.03, 0.12);
    box(g, grip, 0.06, 0.16, 0.07, 0, -0.12, 0.05, 0.2); tube(g, grey, 0.02, 0.5, 0, 0.02, -0.72);
    tube(g, dark, 0.04, 0.32, 0, 0.12, -0.1); box(g, a, 0.08, 0.14, 0.26, 0, -0.03, 0.32); return -0.97;
  },
};
Object.assign(BUILD, {
  guepe(g, a) {
    box(g, dark, 0.06, 0.09, 0.24, 0, 0.04, -0.08); box(g, a, 0.062, 0.025, 0.14, 0, 0.09, -0.08);
    box(g, grip, 0.05, 0.15, 0.07, 0, -0.06, 0.03, 0.2); box(g, grey, 0.04, 0.16, 0.05, 0, -0.14, 0.03, 0.2);
    tube(g, grey, 0.02, 0.08, 0, 0.04, -0.24); return -0.28;
  },
  grenaille(g, a) {
    tube(g, dark, 0.03, 0.3, -0.02, 0.04, -0.12); tube(g, dark, 0.03, 0.3, 0.02, 0.04, -0.12);
    box(g, a, 0.08, 0.08, 0.1, 0, 0.02, 0.05); box(g, a, 0.06, 0.17, 0.08, 0, -0.08, 0.1, 0.45); return -0.28;
  },
  cran(g, a) {
    tube(g, dark, 0.022, 0.22, 0, 0.05, -0.17); tube(g, grey, 0.045, 0.08, 0, 0.03, -0.02);
    box(g, dark, 0.05, 0.08, 0.1, 0, 0.04, 0.05); box(g, a, 0.055, 0.17, 0.08, 0, -0.07, 0.09, 0.35); return -0.29;
  },
  moustique(g, a) {
    box(g, dark, 0.07, 0.11, 0.34, 0, 0, -0.08); box(g, a, 0.072, 0.03, 0.22, 0, 0.065, -0.08);
    box(g, grip, 0.05, 0.15, 0.07, 0, -0.11, 0.03, 0.2); box(g, grey, 0.045, 0.24, 0.05, 0, -0.15, -0.12);
    tube(g, grey, 0.018, 0.1, 0, 0.02, -0.3); box(g, grey, 0.02, 0.02, 0.22, 0, 0.0, 0.2); return -0.35;
  },
  belier(g, a) {
    tube(g, dark, 0.03, 0.7, 0, 0.04, -0.3); tube(g, a, 0.035, 0.24, 0, -0.03, -0.3);
    box(g, dark, 0.07, 0.11, 0.22, 0, 0.0, 0.02); box(g, grip, 0.06, 0.15, 0.07, 0, -0.1, 0.1, 0.3);
    box(g, a, 0.06, 0.1, 0.26, 0, -0.03, 0.26); return -0.65;
  },
  cyclone(g, a) {
    box(g, dark, 0.09, 0.13, 0.5, 0, 0, -0.12); tube(g, grey, 0.03, 0.22, 0, 0.03, -0.46);
    tube(g, a, 0.09, 0.07, 0, -0.12, -0.12); box(g, grip, 0.06, 0.16, 0.07, 0, -0.12, 0.08, 0.2);
    box(g, dark, 0.07, 0.11, 0.2, 0, 0, 0.24); return -0.57;
  },
  ronce(g, a) {
    box(g, dark, 0.08, 0.12, 0.5, 0, 0, -0.12); box(g, a, 0.082, 0.05, 0.18, 0, 0.0, -0.3);
    box(g, grip, 0.06, 0.16, 0.07, 0, -0.12, 0.04, 0.2); box(g, grey, 0.05, 0.17, 0.08, 0, -0.13, -0.1, -0.15);
    tube(g, grey, 0.02, 0.2, 0, 0.02, -0.46); box(g, a, 0.06, 0.1, 0.2, 0, -0.01, 0.22);
    box(g, grey, 0.03, 0.05, 0.08, 0, 0.09, -0.05); return -0.56;
  },
  ressac(g, a) {
    box(g, dark, 0.08, 0.12, 0.52, 0, 0, -0.12); box(g, a, 0.082, 0.03, 0.4, 0, 0.065, -0.12);
    box(g, grip, 0.06, 0.16, 0.07, 0, -0.12, 0.05, 0.2); box(g, grey, 0.05, 0.2, 0.07, 0, -0.14, -0.12, -0.12);
    tube(g, dark, 0.035, 0.3, 0, 0.02, -0.52); box(g, dark, 0.05, 0.1, 0.24, 0, -0.01, 0.24); return -0.67;
  },
  pic(g, a) {
    box(g, a, 0.07, 0.1, 0.7, 0, -0.02, -0.05); tube(g, dark, 0.018, 0.42, 0, 0.03, -0.6);
    tube(g, dark, 0.03, 0.22, 0, 0.1, -0.1); box(g, grey, 0.02, 0.06, 0.03, 0.05, 0.05, 0.05);
    box(g, grip, 0.05, 0.12, 0.06, 0, -0.1, 0.05, 0.3); return -0.81;
  },
  jumelle(g, a) {
    tube(g, dark, 0.024, 0.6, -0.022, 0.03, -0.38); tube(g, dark, 0.024, 0.6, 0.022, 0.03, -0.38);
    box(g, a, 0.08, 0.1, 0.4, 0, -0.03, 0.1); tube(g, grey, 0.032, 0.2, 0, 0.11, -0.08);
    box(g, grip, 0.06, 0.14, 0.07, 0, -0.11, 0.05, 0.3); return -0.68;
  },
  enclume(g, a) {
    box(g, dark, 0.1, 0.14, 0.6, 0, 0, -0.12); box(g, a, 0.102, 0.05, 0.3, 0, 0.06, -0.2);
    tube(g, grey, 0.025, 0.3, 0, 0.02, -0.56); box(g, a, 0.12, 0.14, 0.14, 0.02, -0.14, -0.1);
    box(g, grip, 0.06, 0.16, 0.07, 0, -0.12, 0.08, 0.2); box(g, dark, 0.07, 0.12, 0.24, 0, -0.01, 0.28); return -0.71;
  },
  titan(g, a) {
    box(g, dark, 0.12, 0.16, 0.66, 0, 0, -0.12); tube(g, grey, 0.045, 0.34, 0, 0.02, -0.6);
    for (let i = 0; i < 4; i++) tube(g, dark, 0.055, 0.03, 0, 0.02, -0.5 + i * 0.06);
    box(g, a, 0.18, 0.18, 0.18, 0.03, -0.17, -0.08); box(g, grip, 0.06, 0.16, 0.07, 0, -0.13, 0.1, 0.2);
    box(g, a, 0.08, 0.14, 0.24, 0, -0.01, 0.3); return -0.78;
  },
  lame(g, a) {
    const blade = mat(0xc9ced6, { metalness: 0.9, roughness: 0.2 });
    box(g, blade, 0.012, 0.05, 0.26, 0, 0.02, -0.17); box(g, blade, 0.012, 0.03, 0.06, 0, 0.0, -0.32);
    box(g, grey, 0.05, 0.02, 0.03, 0, 0.0, -0.03); box(g, grip, 0.035, 0.05, 0.13, 0, 0.0, 0.05); return -0.34;
  },
});
export function makeWeapon(type) {
  const g = new THREE.Group();
  const a = mat(WEAPONS[type].color, { roughness: 0.5 });
  const mz = BUILD[type](g, a);
  g.userData.muzzle = new THREE.Vector3(0, 0.02, mz);
  return g;
}

// Personnage : corps couleur de l'équipe, casque et épaulettes couleur du personnage
export function makeCharacter(team, agent) {
  const g = new THREE.Group();
  const tc = mat(TEAMS[team].color, { roughness: 0.7 });
  const ac = mat(AGENTS[agent].color, { roughness: 0.4, metalness: 0.3 });
  const suit = mat(0x2b2f35, { roughness: 0.85 });
  const skin = mat(0xc9a184, { roughness: 0.8 });
  const visor = mat(0x111111, { emissive: AGENTS[agent].color, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.2 });
  const legs = new THREE.Group(); g.add(legs);
  const legL = box(legs, suit, 0.18, 0.82, 0.2, -0.12, 0.41, 0);
  const legR = box(legs, suit, 0.18, 0.82, 0.2, 0.12, 0.41, 0);
  const upper = new THREE.Group(); upper.position.y = 0.84; g.add(upper);
  box(upper, tc, 0.5, 0.62, 0.3, 0, 0.31, 0);                // torse
  box(upper, suit, 0.52, 0.12, 0.32, 0, 0.0, 0);              // ceinture
  box(upper, ac, 0.16, 0.12, 0.3, -0.31, 0.56, 0);            // épaulettes
  box(upper, ac, 0.16, 0.12, 0.3, 0.31, 0.56, 0);
  const head = new THREE.Group(); head.position.y = 0.76; upper.add(head);
  box(head, skin, 0.24, 0.26, 0.24, 0, 0.0, 0);
  box(head, ac, 0.28, 0.12, 0.28, 0, 0.12, 0);                // casque
  box(head, visor, 0.25, 0.07, 0.04, 0, 0.03, -0.13);         // visière
  const arms = new THREE.Group(); arms.position.set(0, 0.52, -0.05); upper.add(arms);
  box(arms, suit, 0.12, 0.12, 0.45, -0.24, -0.08, -0.18);
  box(arms, suit, 0.12, 0.12, 0.45, 0.2, -0.08, -0.2);
  const gunHolder = new THREE.Group(); gunHolder.position.set(0.08, -0.05, -0.38); arms.add(gunHolder);
  g.userData = { legL, legR, upper, head, arms, gunHolder, gunType: null };
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
  return g;
}
export function setCharacterWeapon(ch, type) {
  const u = ch.userData;
  if (u.gunType === type) return;
  u.gunHolder.clear();
  const w = makeWeapon(type);
  w.scale.setScalar(1.25);
  u.gunHolder.add(w);
  u.gunType = type;
}

// Le Noyau : cylindre avec un anneau lumineux
export function makeBomb() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.34, 8), mat(0x30343a, { metalness: 0.7 }));
  body.position.y = 0.17; g.add(body);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xff5a36, emissive: 0xff5a36, emissiveIntensity: 1.5 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 8, 20), ringMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.22; g.add(ring);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), ringMat);
  core.position.y = 0.38; g.add(core);
  const light = new THREE.PointLight(0xff5a36, 2, 6);
  light.position.y = 0.6; g.add(light);
  g.userData = { ringMat, light };
  return g;
}

// ---------------------------------------------------------------------
// Textures dessinées dans un canvas (pas d'images à télécharger)
// ---------------------------------------------------------------------
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function noise(ctx, s, n, a) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() * 255 | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${a})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
}
export const TEX = {
  floor: () => canvasTex(512, (c, s) => {
    c.fillStyle = '#5d5a55'; c.fillRect(0, 0, s, s); noise(c, s, 6000, 0.06);
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * s / 4, 0); c.lineTo(i * s / 4, s); c.stroke(); c.beginPath(); c.moveTo(0, i * s / 4); c.lineTo(s, i * s / 4); c.stroke(); }
  }),
  concrete: () => canvasTex(512, (c, s) => {
    c.fillStyle = '#b9aa92'; c.fillRect(0, 0, s, s); noise(c, s, 9000, 0.05);
    c.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 2; i++) c.fillRect(0, (i + 1) * s / 3, s, 3);
    c.fillStyle = 'rgba(0,0,0,.1)'; c.fillRect(s / 2, 0, 3, s);
    // bande de sécurité en bas
    for (let x = -s; x < s * 2; x += 48) { c.fillStyle = '#d9a43b'; c.beginPath(); c.moveTo(x, s); c.lineTo(x + 24, s); c.lineTo(x + 54, s - 30); c.lineTo(x + 30, s - 30); c.fill(); }
    c.fillStyle = 'rgba(30,30,30,.85)'; c.fillRect(0, s - 30, s, 2);
  }),
  crate: () => canvasTex(256, (c, s) => {
    c.fillStyle = '#3f6a78'; c.fillRect(0, 0, s, s); noise(c, s, 2500, 0.06);
    c.strokeStyle = '#2b4a54'; c.lineWidth = 14; c.strokeRect(7, 7, s - 14, s - 14);
    c.lineWidth = 8; c.beginPath(); c.moveTo(0, 0); c.lineTo(s, s); c.stroke();
  }),
  metal: () => canvasTex(256, (c, s) => {
    c.fillStyle = '#7b7f84'; c.fillRect(0, 0, s, s); noise(c, s, 3000, 0.05);
    c.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 8; i++) c.fillRect(0, i * s / 8, s, 3);
  }),
  stone: () => canvasTex(256, (c, s) => {
    c.fillStyle = '#8a6f52'; c.fillRect(0, 0, s, s); noise(c, s, 4000, 0.1);
    c.strokeStyle = 'rgba(40,25,10,.5)'; c.lineWidth = 3;
    for (let y = 0; y < s; y += 42) { c.beginPath(); c.moveTo(0, y); c.lineTo(s, y + 6); c.stroke(); }
  }),
};
export function labelTexture(text, color, size = 256) {
  return canvasTex(size, (c, s) => {
    c.clearRect(0, 0, s, s);
    c.font = `900 ${s * 0.7}px Segoe UI, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = color; c.globalAlpha = 0.75; c.fillText(text, s / 2, s / 2 + s * 0.04);
  });
}
export function nameSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const ctx = c.getContext('2d');
  ctx.font = '700 26px Segoe UI, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(text, 128, 24);
  ctx.fillStyle = color; ctx.fillText(text, 128, 24);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.3, 1);
  s.renderOrder = 10;
  return s;
}
