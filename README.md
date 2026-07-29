# WhatNow 2.1 — Jiggly Integration

Pixel-themed academic task planner with light/dark mode, Jiggly's expandable drawer, task calendar, persistent Add Task controls, immediate task deletion, draggable class ordering, Patch Notes, and admin-editable Contact Us content.

## Changes in this package

- Liam's supplied Jiggly artwork is used directly as the drawer button.
- Circular Jiggly favicon, browser icons, Apple touch icon, and installable web-app icons are included.
- No AI-generated artwork is included.
- Working 8-bit WAV files are included so UI audio is audible immediately.
- Browser audio restrictions are handled by unlocking audio on the first user interaction.
- Failed or missing audio files now use a synthesized fallback and log a browser-console warning instead of failing silently.
- Jiggly's sound array remains editable and accepts any number of custom audio files.

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env`.
3. Enter your PostgreSQL `DATABASE_URL` and a strong `SESSION_SECRET` in `.env`.
4. Run `npm start`.
5. Open `http://localhost:3002`.

PowerShell:

```powershell
npm install
Copy-Item .env.example .env
node app.js
```

## Add Jiggly sounds

Put your personal sound files in `public/sounds/`, then edit `JIGGLY_SOUNDS` at the very top of `public/dashboard.js`.

```js
const JIGGLY_SOUNDS = [
  '/sounds/microwave-ding.mp3',
  '/sounds/cartoon-boing.wav',
  '/sounds/computer-error.ogg'
];
```

The included `/sounds/jiggly-test.wav` is only a test placeholder. Remove it from the array after adding your own sounds.

## Database note

The Contact Us page creates a small `site_content` table automatically the first time it is opened or edited. The connected database user therefore needs permission to create tables. Existing application tables remain unchanged.

## Before pushing

The ZIP intentionally excludes `.env` and `node_modules`. Your real database credentials remain local and must not be pushed to GitHub. Configure the same environment variables in Render's Environment settings.


## v2.3 sound and Jiggly revisions

- Audio is preloaded and decoded with the Web Audio API for the lowest practical browser latency.
- Button feedback starts on `pointerdown`.
- Class dragging now has separate pickup, shuffle, and drop sounds.
- Jiggly is approximately 3–4× larger, horizontally centred, and opens a vertical drawer beneath him.
- `.env` is deliberately not included. Continue using your own local/Render environment variables.


## v2.4 drag sound correction

Class reordering now follows this exact sound sequence:

- Pick up a class: `ui_drag.mp3` plays once.
- Hover or swap over other classes while holding: no sound plays.
- Release in the original position: `ui_drop.mp3` plays once.
- Release in a different position: `ui_shuffle.mp3` plays once.

The real `.env` file and `node_modules` are intentionally excluded from the push-ready ZIP.
