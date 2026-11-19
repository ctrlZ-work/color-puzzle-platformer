# Color Puzzle Platformer (working title)

A side-scrolling puzzle platformer for [playadinfinitum.com](https://playadinfinitum.com). You wake up as the only color in a black-and-white world and restore color while finding out why it left.

## Project records

- Implementation Plan (active plan, milestones and numbered issues): https://docs.google.com/document/d/16a5xHnKBo6BKIwtAnVJzswlJR3Em9TPJmZZIBsjcnzo/edit
- Design Specification (approved): https://docs.google.com/document/d/1UY8eNpPs_zBgQbGKyk2B0hoghZnzkWEBN96D_W8CHco/edit
- Linear project: https://linear.app/open-art-media/project/color-puzzle-platformer-working-title-f23cb5b098e3

## Requirements

- Node.js 20 or newer (developed on Node 22) and npm.

## Run

```
npm install
npm run dev
```

Then open the local address Vite prints (usually http://localhost:5173).

## Build

```
npm run build
```

This writes a self-contained static game to `dist/`. The build uses relative paths, so `dist/` works from any static web server and from any subfolder, including a folder inside the portal site. To check a build locally:

```
npm run preview
```

## Tech

- [Phaser 4](https://phaser.io) game framework with Arcade physics.
- [Vite](https://vite.dev) for the dev server and build.
- Internal resolution 480x270, scaled to fit the window.
- Levels will be authored in the [Tiled](https://www.mapeditor.org) JSON format (from issue 2.3).

## Publishing a test build

Added in issue 1.2.
