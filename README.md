# Dev Defender 3D

[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg)](https://www.javascript.com/) [![GitHub stars](https://img.shields.io/github/stars/yksanjo/Dev_defender_3D?style=social)](https://github.com/yksanjo/Dev_defender_3D/stargazers) [![GitHub forks](https://img.shields.io/github/forks/yksanjo/Dev_defender_3D.svg)](https://github.com/yksanjo/Dev_defender_3D/network/members) [![GitHub issues](https://img.shields.io/github/issues/yksanjo/Dev_defender_3D.svg)](https://github.com/yksanjo/Dev_defender_3D/issues)
[![Last commit](https://img.shields.io/github/last-commit/yksanjo/Dev_defender_3D.svg)](https://github.com/yksanjo/Dev_defender_3D/commits/main)


Reimagined sci-fi office defense game built with React, Vite, and raw Three.js. Survive waves of PMs, Marketing execs, and QA testers in an endless arena, collect power-ups, and unleash the Dev Shockwave when your focus meter maxes out.

## Gameplay Features

- **Dynamic Arena** – Neon holo-office with fog, procedural tiles, props, and evolving lighting.
- **Three Enemy Archetypes** – PM bruisers, Marketing heavies, and agile QA scouts with unique stats.
- **Combo & Wave Scaling** – Difficulty, health, and spawn cadence scale with waves and combos.
- **Power-Ups** – Ammo caches, med kits, and shield boosts spawn off kill streaks and RNG drops.
- **Ultimate Ability** – Landing shots fills the Dev Shockwave meter; hit `Q` to vaporize nearby threats.
- **Immersive HUD** – Pointer lock crosshair, animated HUD, muzzle flash, sprint indicator, and toasts.

## Quick Start

```bash
# install dependencies
npm install

# run locally (http://localhost:5173)
npm run dev

# build for production
npm run build
```

## Controls

- `WASD` – Move
- `Shift` – Sprint
- `Mouse / Space / Left Click` – Fire
- `R` – Reload
- `Q` – Dev Shockwave (when meter is full)

## Project Structure

```
src/
  main.jsx        # Vite entry point
  App.jsx         # Game logic & HUD
  App.css         # HUD + overlay styling
  index.css       # global typography + base resets
```

## Deployment

1. Build: `npm run build`
2. Serve `dist/` via any static host (Vercel, Netlify, GitHub Pages, etc.)
3. For GitHub Pages, run `npm run build` and push `dist/` via your preferred workflow.

## Credits

- Built with [React](https://react.dev), [Vite](https://vitejs.dev), and [Three.js](https://threejs.org/)
- Icons by [Lucide](https://lucide.dev)
