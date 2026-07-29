WhatNow sound files

Jiggly's random sounds are configured at the top of:
  public/dashboard.js

Low-latency engine:
- Files are fetched and decoded into Web Audio AudioBuffers at page load.
- Controls play on pointerdown rather than click.
- If a real file has not decoded yet, an immediate synthesized fallback plays.
- The first user interaction is still required by browser autoplay rules.

Class drag lifecycle:
- class_pickup.wav  — when a class is picked up
- class_shuffle.wav — while class cards swap positions
- class_drop.wav    — immediately when a class is dropped

You may replace any of these files while keeping the same filenames, or edit
UI_SOUNDS in public/dashboard.js to point to different files.


v2.4 class reorder behaviour:
- ui_drag.mp3: once when drag starts
- no sound while hovering over cards
- ui_drop.mp3: once when released in the same position
- ui_shuffle.mp3: once when released in a different position
