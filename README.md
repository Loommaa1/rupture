# Rupture

Jeu de tir tactique **5 contre 5** en 3D, multijoueur, qui se joue dans le navigateur.
Deux équipes, **Braise** (orange) et **Givre** (bleu), s'affrontent sur la carte **Raffinerie** :
l'attaque doit poser le **Noyau** sur un des deux sites (A ou B), la défense doit l'en empêcher ou le désamorcer.
Les places libres sont prises par des **bots** : tu peux jouer seul.

Tout est original : nom, personnages, capacités, armes, carte et interface.

---

## Lancer le jeu

Il faut avoir **Node.js** installé (version 18 ou plus récente).

1. Ouvre un terminal (PowerShell) dans ce dossier :

   ```powershell
   cd $HOME\Desktop\rupture
   ```

2. La première fois seulement, installe les dépendances :

   ```powershell
   npm install
   ```

3. Lance le serveur :

   ```powershell
   npm start
   ```

4. Ouvre **http://localhost:3200** dans ton navigateur (Chrome, Edge ou Firefox).
5. Choisis ton pseudo et ton personnage, puis clique sur **Entrer en jeu**. Clique dans la fenêtre pour capturer la souris.

Pour arrêter le serveur : `Ctrl + C` dans le terminal.

### Jouer à plusieurs

- Sur le même ordinateur : ouvre un deuxième onglet.
- Sur le même réseau Wi-Fi : les autres ouvrent `http://<adresse-IP-de-ton-PC>:3200`
  (ton adresse s'affiche avec la commande `ipconfig`, ligne « Adresse IPv4 »). Windows peut demander d'autoriser Node.js dans le pare-feu.
- Chaque nouveau joueur rejoint l'équipe qui a le moins d'humains et prend la place d'un bot.

### Changer le port

```powershell
$env:PORT=4000; npm start
```

### Mode test (manches très courtes)

Pratique pour vérifier rapidement la mi-temps et la fin de match (achat 4 s, manche 30 s, victoire en 3 manches) :

```powershell
$env:RAPIDE=1; npm start
```

(Ferme ensuite le terminal, ou tape `Remove-Item Env:RAPIDE`, pour revenir au mode normal.)

---

## Règles

| | |
|---|---|
| Manche | 20 s d'achat, puis 1 min 40 de combat. **Une seule vie** par manche. |
| Attaque | Gagne si le Noyau explose (40 s après la pose) ou si tous les défenseurs sont éliminés. |
| Défense | Gagne si le temps s'écoule sans pose, si le Noyau est désamorcé, ou si tous les attaquants sont éliminés avant la pose. |
| Pose | Maintenir **F** sur un site, immobile, pendant 4 s. |
| Désamorçage | Maintenir **F** à côté du Noyau, immobile, pendant 7 s. |
| Match | La première équipe à **13 manches** gagne. **Changement de côté** après 12 manches. |

### Argent

| Événement | Gain |
|---|---|
| Départ (et après la mi-temps) | 800 ¤ |
| Manche gagnée | +3000 ¤ |
| Manche perdue | +1900 ¤, puis +500 par défaite d'affilée (max 2900 ¤) |
| Élimination | +200 ¤ |
| Pose du Noyau | +300 ¤ pour toute l'équipe d'attaque |

L'argent est plafonné à 9000 ¤. Si tu survis, tu **gardes tes armes et ton gilet** pour la manche suivante. Si tu meurs, tu les perds.

### Magasin (touche B, pendant la phase d'achat)

| Arme | Type | Prix | Dégâts (corps / tête) |
|---|---|---|---|
| Dard | Pistolet (gratuit) | 0 | 26 / 78 |
| Brise | Pistolet lourd | 500 | 42 / 168 |
| Frelon | Mitraillette automatique | 1600 | 24 / 60 |
| Vigie | Fusil semi-automatique | 2200 | 45 / 158 |
| Tempête | Fusil d'assaut automatique | 2900 | 39 / 156 |
| Faucon | Fusil de précision (lunette) | 4700 | 150 / 255 |
| Gilet léger | +25 de protection | 400 | |
| Gilet lourd | +50 de protection | 1000 | |

Le gilet absorbe les dégâts avant tes points de vie. Clique une 2ᵉ fois sur un objet acheté pendant la phase d'achat pour le revendre (remboursé).

### Tirer juste

- **À l'arrêt**, la première balle part au centre du viseur.
- **En courant** ou **en sautant**, les balles partent dans tous les sens. Arrête-toi avant de tirer (ou marche avec **Maj**).
- **En rafale**, l'arme monte (recul) et la dispersion grandit. Tire par petites rafales, ou contrôle le recul en tirant la souris vers le bas.
- **Accroupi**, tu es un peu plus précis.
- **La tête est très mortelle** : un tir à la tête de Tempête ou de Vigie élimine même avec un gilet lourd.
- Le viseur s'écarte pour te montrer la précision actuelle.

---

## Personnages

| Personnage | Rôle | Capacité (touche E) |
|---|---|---|
| **Brume** | Contrôle | *Voile* (×2) : capsule de fumée opaque pendant 15 s, là où tu vises. |
| **Lueur** | Ouverture | *Éclair* (×2) : sphère qui éclate et aveugle ceux qui la regardent (jusqu'à 2,5 s). |
| **Rocaille** | Défense | *Rempart* (×1) : mur de pierre de 6 m qui bloque passages et balles pendant 18 s. |
| **Aloé** | Soutien | *Onde de soin* (×2) : +60 PV en 3 s pour toi et les alliés à moins de 7 m. |

Les charges se rechargent à chaque manche. Les capacités ne s'utilisent qu'une fois le combat commencé.

---

## Touches

Les touches correspondent à la **position** sur le clavier : sur un clavier AZERTY, on se déplace avec **Z Q S D**.

| Touche | Action |
|---|---|
| Z Q S D | Se déplacer |
| Maj | Marcher (plus précis, pas de bruit de pas) |
| Ctrl ou C | S'accroupir |
| Espace | Sauter |
| Clic gauche | Tirer (clic quand tu es mort : changer de coéquipier regardé) |
| Clic droit | Viser / lunette du Faucon |
| R | Recharger |
| 1 / 2 (ou molette) | Arme principale / pistolet |
| E | Capacité du personnage |
| F (maintenir) | Poser / désamorcer le Noyau |
| G | Lâcher le Noyau (un coéquipier peut le ramasser en passant dessus) |
| B | Magasin |
| Tab (maintenir) | Tableau des scores |
| Échap | Pause (libère la souris, réglage de la sensibilité) |

---

## La carte « Raffinerie »

- **Sud** : zone d'apparition de l'attaque. **Nord** : zone d'apparition de la défense.
- Trois couloirs : **A** à l'ouest, **milieu**, **B** à l'est.
- Deux passages relient le milieu aux couloirs (« Liaison A » et « Liaison B »).
- Chaque site a une entrée étroite (goulot) et des caisses pour se couvrir.
- La mini-carte (en haut à gauche) montre les murs, les sites, tes coéquipiers et les ennemis que **tu vois**.

---

## Comment c'est fait (pour bidouiller)

| Fichier | Rôle |
|---|---|
| `server.js` | Le serveur (Node.js + Express + Socket.IO). Il **décide de tout** : tirs touchés ou non, dégâts, argent, manches, Noyau, capacités. Il fait aussi jouer les **bots**. |
| `public/shared.js` | Code commun au serveur et au navigateur : **règles** (`RULES`), **armes** (`WEAPONS`), **personnages** (`AGENTS`), **carte** (`RAW`), collisions et calcul de précision. |
| `public/main.js` | Le jeu dans le navigateur : affichage 3D (Three.js), déplacements, recul, interface, magasin, sons. |
| `public/models.js` | Les modèles 3D (armes, personnages, Noyau) faits avec des formes simples, et les textures dessinées dans un canvas. |
| `public/index.html`, `public/style.css` | Page d'accueil et interface. |

Quelques idées faciles à modifier :

- **Règles et argent** : l'objet `RULES` au début de `public/shared.js` (durées, 13 manches, gains…).
- **Armes** : l'objet `WEAPONS` dans `public/shared.js` (dégâts, cadence, recul `kick`, dispersion en courant `run`…).
- **Carte** : la liste `RAW` dans `public/shared.js`. Chaque ligne est une boîte `[x1, z1, x2, z2, hauteur, type]`.
  Si tu déplaces des murs, pense aussi aux points de passage des bots (`NAV_POINTS`) et aux positions de garde (`HOLD_SPOTS`).
- **Niveau des bots** : dans `server.js`, fonction `botThink` — `ai.react` (temps de réaction), `err` (erreur de visée), `aimHead` (chance de viser la tête).

Outil de test : dans la console du navigateur (F12), `rupture.state` affiche l'état reçu du serveur.
