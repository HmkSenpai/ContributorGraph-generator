# Contribution Graph Generator

Générateur haute qualité d'images de *contribution graph* (style GitHub) pour designers, portfolios et présentations.

> **Disclaimer :** Ce projet n'est **pas affilié à GitHub, Inc.** GitHub et son Contribution Graph sont des marques déposées de GitHub, Inc. Cet outil génère uniquement des **images décoratives** (PNG / SVG / GIF) — aucune donnée GitHub réelle n'est modifiée.

![vite](https://img.shields.io/badge/vite-8.x-646CFF) ![react](https://img.shields.io/badge/react-19-61DAFB) ![license](https://img.shields.io/badge/license-MIT-green)

## ✨ Fonctionnalités

- **Importer depuis GitHub** — tape un username (`torvalds`, `Hmksenpai`) + année optionnelle → reproduit sa vraie grille, éditable et exportable. Sans token (API publique, cache 24h) ou avec token pour inclure les contributions privées
- **Grille éditable** — dessin à la souris / tactile, pinceau 5 niveaux + *Zone morte* (transparente à l'export)
- **Contrôles complets** — colonnes, lignes, taille des carrés, espacement, rayon des coins
- **Thèmes 1-clic** — GitHub, Halloween, Winter, Dracula, Neon, Forêt, Sunset + 5 couleurs custom
- **Texte → Graphe** — tape `HELLO` → conversion auto en pixel-art 5×7
- **Exports haute qualité**
  - PNG transparent (échelle ×1 à ×8, idéal @4× pour Figma)
  - SVG vectoriel (qualité infinie)
  - **GIF animé** — mode *Draw-on* (semaine par semaine) ou *Wave*, FPS/durée configurables
  - JSON (save/load complet)
- **UX pro** — Undo (`Ctrl+Z`) / Redo (`Ctrl+Shift+Z` / `Ctrl+Y`), `localStorage` auto-save, lien de partage encodé (`#g=...`), responsive
- **Fond transparent** — la *Zone morte* est exclue de l'export, parfait pour intégration sur tout fond

## 🚀 Démarrage rapide

```bash
# 1. Cloner
git clone https://github.com/Hmksenpai/ComtributorGraph-Generator.git
cd ComtributorGraph-Generator/vite-app

# 2. Installer
npm install

# 3. Dev
npm run dev
# → http://localhost:5173

# 4. Build production
npm run build
# → dist/ prêt à déployer (Vercel / Netlify / GitHub Pages)
```

## 🖼️ Exports

| Format | Usage recommandé |
|---|---|
| **PNG** | Dribbble, portfolio, slides — choisis ×4 pour du Retina |
| **SVG** | Figma / Illustrator / intégration web vectorielle |
| **GIF** | Hero animé, README, réseaux sociaux |
| **JSON** | Sauvegarde / partage de la grille |

## 🎨 Thèmes

Les palettes sont dans [`src/lib/themes.ts`](vite-app/src/lib/themes.ts). Ajoute la tienne :

```ts
{ name: "Mon Theme", colors: ["#161b22","#0e4429","#006d32","#26a641","#39d353"] }
```

## 🛠️ Stack

- **Vite 8 + React 19 + TypeScript**
- **Tailwind CSS 3**
- **gifenc** pour l'encodage GIF côté client (pas de serveur)

## 📁 Structure

```
vite-app/
├── src/
│   ├── App.tsx              # App principale + canvas
│   ├── lib/
│   │   ├── themes.ts        # Palettes
│   │   ├── fonts5x7.ts      # Font pixel 5×7 (A-Z 0-9)
│   │   └── gifenc           # GIF
│   └── index.css
├── public/
└── dist/                    # build
```

## 🤝 Crédits

Créé par **[Hmksenpai](https://github.com/Hmksenpai)**.

Inspiré par le Contribution Graph de GitHub. Merci à la communauté open-source.

## 📄 Licence

MIT — libre d'utilisation pour projets perso et commerciaux.

---

<p align="center">
  <sub>Non affilié à GitHub, Inc.</sub>
</p>
