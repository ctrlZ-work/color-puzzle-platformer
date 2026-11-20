# Color Puzzle Platformer (working title)

A side-scrolling puzzle platformer for [playadinfinitum.com](https://playadinfinitum.com). You wake up as the only color in a black-and-white world and restore color while finding out why it left.

## Project records

- Implementation Plan (active plan, milestones and numbered issues): https://docs.google.com/document/d/16a5xHnKBo6BKIwtAnVJzswlJR3Em9TPJmZZIBsjcnzo/edit
- Design Specification (approved): https://docs.google.com/document/d/1UY8eNpPs_zBgQbGKyk2B0hoghZnzkWEBN96D_W8CHco/edit
- Linear project: https://linear.app/open-art-media/project/color-puzzle-platformer-working-title-f23cb5b098e3

## Requirements

- Node.js 22.12 or newer (or 20.19 or newer), and npm. Vite 8 requires one of those; Netlify builds with Node 22, so use Node 22 to match it.

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

## Controls

- Move: arrow keys or WASD; gamepad d-pad or left stick
- Jump: Space, Up or W; gamepad A
- Switch color: Q or Tab; gamepad Y or a shoulder button
- Dive (Blue, in water): Down or S; gamepad down
- Restart the room: R; gamepad Back/Select

## Tests

```
npm test
```

Runs the small automated tests in `tests/` (currently the first-touch color rule).

## Tech

- [Phaser 4](https://phaser.io) game framework with Arcade physics.
- [Vite](https://vite.dev) for the dev server and build.
- Internal resolution 480x270, scaled to fit the window.
- Rooms are [Tiled](https://www.mapeditor.org) JSON maps in `public/rooms/`; the format is in [docs/room-format.md](docs/room-format.md).

## Publishing a test build

Test builds go to a separate Netlify site, never to the live portal:

- Playtest URL: https://color-puzzle-platformer-playtest.netlify.app
- Netlify project: `color-puzzle-platformer-playtest` (Open Art Media team), site ID `e8708c2c-e263-4c2e-addf-9ce9991af54f`
- `netlify.toml` tells Netlify to run `npm run build` and publish `dist/`.

The site is not connected to GitHub, so pushing does not deploy by itself. To publish the current checkout, use either:

1. **Netlify connector (agents with the Netlify MCP connector):** call the deploy operation (`deploy-site`) with the site ID above. It returns a one-time `npx -y @netlify/mcp@latest --site-id ... --proxy-path ...` command; run that from the repo root. It uploads the source and Netlify builds it.
2. **Netlify CLI (anyone with access to the Open Art Media Netlify team):**
   ```
   npx -y netlify-cli deploy --build --prod --site e8708c2c-e263-4c2e-addf-9ce9991af54f
   ```
   Sign in first with `npx -y netlify-cli login`, or set `NETLIFY_AUTH_TOKEN`.

Publish from a clean checkout of the exact commit you mean to test: after `npm install`, `git status` should show no changes. `node_modules/` and `dist/` can stay; they are ignored.

After publishing:

- Open the deploy's own permanent link (`https://<deploy-id>--color-puzzle-platformer-playtest.netlify.app`) as well as the playtest URL, and check the game loads with no errors in the browser console. A correct load currently shows the test room: two lines of controls at the top, a high ledge on the left, a gray water pool with a gray platform sunk at the bottom, a gray platform next to a stack of two ice blocks, a pit, and spikes on the far right; a blue circle and a red square stand on the left ground with a small white marker above the blue circle.
- Netlify does not record which commit an upload came from, so write the commit and the deploy ID in the plan issue's Evidence line. With the CLI you can also add `--message "<commit>"` so the Netlify deploy list shows it.

Only publish from `main` or from the branch of the issue being tested.

The playtest site is public but unlisted. Don't link to it from anywhere public.
