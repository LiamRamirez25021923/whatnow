WHATNOW SOUND FILES
===================

Included test sounds:
- jiggly-test.wav  : temporary electronic placeholder for Jiggly
- ui-click.wav     : normal button/link click
- ui-success.wav   : available for successful actions
- ui-delete.wav    : delete cross
- ui-drag.wav      : class drag-and-drop completion

Jiggly's custom sound list is at the very top of:
  public/dashboard.js

Edit this array:
  const JIGGLY_SOUNDS = [
    '/sounds/jiggly-test.wav'
  ];

To add your own sounds:
1. Put .wav, .mp3, or .ogg files in public/sounds/.
2. Add each public path to JIGGLY_SOUNDS.
3. Remove jiggly-test.wav from the array when you no longer need it.

Example:
  const JIGGLY_SOUNDS = [
    '/sounds/microwave-ding.mp3',
    '/sounds/cartoon-boing.wav',
    '/sounds/computer-error.ogg'
  ];

One random sound is selected every time Jiggly is clicked.
If an audio file cannot load, WhatNow now uses a synthesized 8-bit fallback
and prints a warning in the browser console instead of failing silently.
