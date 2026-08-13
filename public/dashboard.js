/*
  JIGGLY SOUND ARRAY
  ------------------
  Put your own audio files in public/sounds/ and add their public paths below.
  Add as many entries as you like; one random entry plays whenever Jiggly is clicked.

  The included jiggly-test.wav is only there so the sound system works immediately.
  Replace or remove it once you add Jiggly's real collection of deeply un-horse noises.
*/
const JIGGLY_SOUNDS = [
  '/sounds/bark_fart.mp3',
  '/sounds/meow_2Tmjbru.mp3',
  '/sounds/HOO HOO.mp3',
  '/sounds/dogtrill.mp3',
  '/sounds/ui_cackle.mp3',
  '/sounds/slide_whistle.mp3',
  '/sounds/oooo.mp3'
];

/* Ordinary UI sounds. These included files can also be replaced with your own. */
const UI_SOUNDS = {
  click: ['/sounds/ui_click.mp3'],
  success: ['/sounds/ui_success.mp3'],
  delete: ['/sounds/ui_delete.mp3'],

  // Class drag lifecycle sounds:
  pickup: ['/sounds/ui_drag.mp3'],
  shuffle: ['/sounds/ui_shuffle.mp3'],
  drop: ['/sounds/ui_drop.mp3']
};

const SOUND_SETTINGS = {
  enabled: true,
  volume: getStoredSfxVolume()
};

function getStoredSfxVolume() {
  const raw = localStorage.getItem('whatnow-sfx-volume');

  // A missing value must use the normal default. Number(null) === 0, which
  // previously caused first-time users to get completely muted sound.
  if (raw === null || raw === '') {
    return 0.72;
  }

  const stored = Number(raw);
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.72;
}

/*
  LOW-LATENCY SOUND ENGINE
  ------------------------
  Audio files are fetched and decoded into AudioBuffers during page load.
  Playing an already-decoded buffer avoids creating a new <audio> element
  every time a button is pressed.

  Browsers still require one user gesture before audio can be unlocked.
  The first pointer/keyboard interaction unlocks the AudioContext.
*/
const decodedSoundBuffers = new Map();
const soundLoadPromises = new Map();
let audioContext = null;
let audioUnlocked = false;

document.addEventListener('DOMContentLoaded', () => {
  initSoundSystem();
  initTheme();
  initToggleTargets();
  initAddTaskZones();
  initJigglyDrawer();
  initCalendar();
  initClassReordering();
  initImmediateDeleteAnimation();
  initResilientForms();
  protectFormControlsFromDrag();
});

function allConfiguredSounds() {
  return [...new Set([
    ...JIGGLY_SOUNDS,
    ...Object.values(UI_SOUNDS).flat()
  ].filter(Boolean))];
}

function ensureAudioContext() {
  if (audioContext) return audioContext;

  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;

  // "interactive" asks supported browsers to prioritise low output latency.
  try {
    audioContext = new Context({ latencyHint: 'interactive' });
  } catch {
    audioContext = new Context();
  }

  return audioContext;
}

async function loadSoundBuffer(path) {
  if (decodedSoundBuffers.has(path)) return decodedSoundBuffers.get(path);
  if (soundLoadPromises.has(path)) return soundLoadPromises.get(path);

  const context = ensureAudioContext();
  if (!context) return null;

  const promise = fetch(path, { cache: 'force-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      decodedSoundBuffers.set(path, buffer);
      return buffer;
    })
    .catch((error) => {
      console.warn(`[WhatNow audio] Could not preload ${path}:`, error);
      return null;
    })
    .finally(() => {
      soundLoadPromises.delete(path);
    });

  soundLoadPromises.set(path, promise);
  return promise;
}

function initSoundSystem() {
  ensureAudioContext();

  // Begin downloading/decoding every configured effect immediately.
  allConfiguredSounds().forEach((path) => {
    loadSoundBuffer(path);
  });

  const unlock = () => {
    const context = ensureAudioContext();
    if (!context) return;

    const resume = context.state === 'suspended'
      ? context.resume()
      : Promise.resolve();

    resume.then(() => {
      audioUnlocked = true;
    }).catch(() => {});
  };

  // Capture phase runs before ordinary click handlers.
  document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  document.addEventListener('keydown', unlock, { capture: true, passive: true });

  // Play ordinary UI feedback on pointerdown rather than click. This makes
  // the sound begin at the start of the physical press instead of after release.
  document.addEventListener('pointerdown', (event) => {
    const control = event.target.closest('button, a, [role="button"]');
    if (!control || control.dataset.sound === 'off') return;
    if (control.id === 'jigglyButton') return;
    if (control.classList.contains('drag-handle')) return;

    if (control.classList.contains('complete-check')) {
      playRandomSound(UI_SOUNDS.success, 'success');
      return;
    }

    if (control.classList.contains('delete-cross')) {
      playRandomSound(UI_SOUNDS.delete, 'delete');
      return;
    }

    playRandomSound(UI_SOUNDS.click, 'click');
  }, { capture: true, passive: true });
}

function playDecodedBuffer(buffer, volume = SOUND_SETTINGS.volume) {
  const context = ensureAudioContext();
  if (!context || !buffer) return false;

  const source = context.createBufferSource();
  const gain = context.createGain();

  source.buffer = buffer;
  gain.gain.value = Math.max(0, Math.min(1, volume));

  source.connect(gain);
  gain.connect(context.destination);
  source.start(0);
  return true;
}

function playRandomSound(paths, fallbackType = 'click') {
  if (!SOUND_SETTINGS.enabled) return;

  const context = ensureAudioContext();
  if (!context) return;

  // Resume without waiting. During a pointerdown gesture this normally happens
  // immediately; decoded-buffer playback follows in the same event turn.
  if (context.state === 'suspended') {
    context.resume().then(() => {
      audioUnlocked = true;
    }).catch(() => {});
  }

  if (!Array.isArray(paths) || paths.length === 0) {
    playSynthFallback(fallbackType);
    return;
  }

  const path = paths[Math.floor(Math.random() * paths.length)];
  const buffer = decodedSoundBuffers.get(path);

  if (buffer) {
    playDecodedBuffer(buffer);
    return;
  }

  // Do not wait for a network request at interaction time. Give immediate
  // synthesized feedback, while ensuring the real file is ready next time.
  playSynthFallback(fallbackType);
  loadSoundBuffer(path);
}

function playSynthFallback(type = 'click') {
  const context = ensureAudioContext();
  if (!context) return;

  if (context.state === 'suspended') {
    context.resume().catch(() => {});
  }

  const patterns = {
    click: [[880, 0.035], [1180, 0.035]],
    success: [[660, 0.055], [880, 0.055], [1100, 0.075]],
    delete: [[520, 0.05], [350, 0.05], [210, 0.06]],
    pickup: [[260, 0.045], [520, 0.065]],
    shuffle: [[760, 0.025], [980, 0.03]],
    drop: [[520, 0.045], [300, 0.075]],
    jiggly: [[1220, 0.065], [470, 0.065], [1600, 0.065], [720, 0.065], [1040, 0.08]]
  };

  const pattern = patterns[type] || patterns.click;
  let start = context.currentTime;

  pattern.forEach(([frequency, duration]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.10, start + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.005);
    start += duration;
  });
}

function initTheme() {
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  const saved = localStorage.getItem('whatnow-theme');
  const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.dataset.theme = saved || preferred;
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('whatnow-theme', root.dataset.theme);
  });
}

function initToggleTargets() {
  document.querySelectorAll('[data-toggle-target]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      const selector = trigger.dataset.toggleTarget;
      if (!selector) return;
      const target = document.querySelector(selector);
      if (!target) return;
      event.preventDefault();
      target.classList.toggle('hidden');
      const firstInput = target.querySelector('input, textarea, select');
      if (!target.classList.contains('hidden') && firstInput) {
        setTimeout(() => firstInput.focus(), 50);
      }
    });
  });
}

function initAddTaskZones() {
  document.querySelectorAll('.add-task-zone').forEach((zone) => {
    zone.addEventListener('click', () => {
      const form = zone.nextElementSibling;
      if (!form || !form.classList.contains('task-add-form')) return;
      form.classList.toggle('collapsed');
      zone.textContent = form.classList.contains('collapsed') ? '＋ Add Task' : '− Close';
      const firstInput = form.querySelector('input[name="taskTitle"]');
      if (!form.classList.contains('collapsed') && firstInput) {
        setTimeout(() => firstInput.focus(), 50);
      }
    });
  });
}

function initJigglyDrawer() {
  const button = document.getElementById('jigglyButton');
  const drawer = document.getElementById('jigglyDrawer');
  if (!button || !drawer) return;

  const artwork = button.querySelector('img');

  button.addEventListener('pointerdown', () => {
    // Sound begins on press, before the later click event toggles the drawer.
    playRandomSound(JIGGLY_SOUNDS, 'jiggly');
  }, { passive: true });

  button.addEventListener('click', () => {
    const open = drawer.classList.toggle('is-open');

    if (artwork) {
      artwork.classList.remove('jiggly-spin');
      void artwork.offsetWidth;
      artwork.classList.add('jiggly-spin');
    }

    button.setAttribute('aria-expanded', String(open));
    drawer.setAttribute('aria-hidden', String(!open));
  });

  artwork?.addEventListener('animationend', () => {
    artwork.classList.remove('jiggly-spin');
  });

  document.querySelector('[data-drawer-section="calendar"]')?.addEventListener('click', () => {
    document.getElementById('drawerCalendar')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function initCalendar() {
  const grid = document.getElementById('calendarGrid');
  const label = document.getElementById('calendarMonthLabel');
  if (!grid || !label) return;

  const dueDates = new Set(
    [...document.querySelectorAll('.task-row[data-deadline]')]
      .map((row) => row.dataset.deadline)
      .filter(Boolean)
  );

  const cursor = new Date();
  cursor.setDate(1);

  const render = () => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    label.textContent = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i += 1) {
      grid.appendChild(document.createElement('span'));
    }

    for (let day = 1; day <= days; day += 1) {
      const date = new Date(year, month, day);
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cell = document.createElement('span');
      cell.className = 'calendar-day';
      cell.textContent = String(day);
      if (dueDates.has(key)) cell.classList.add('has-task');
      if (date.toDateString() === new Date().toDateString()) cell.classList.add('is-today');
      grid.appendChild(cell);
    }
  };

  document.querySelectorAll('[data-calendar-direction]').forEach((button) => {
    button.addEventListener('click', () => {
      cursor.setMonth(cursor.getMonth() + Number(button.dataset.calendarDirection));
      render();
    });
  });

  render();
}

function initImmediateDeleteAnimation() {
  document.querySelectorAll('.complete-task-form').forEach((form) => {
    form.addEventListener('submit', () => {
      form.closest('.task-row')?.classList.add('is-completing');
    });
  });
}

function ensureWakeOverlay() {
  let overlay = document.getElementById('wakeOverlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.className = 'wake-overlay';
  overlay.id = 'wakeOverlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="pixel-panel wake-dialog">
      <img src="/images/jiggly.png" alt="" aria-hidden="true">
      <h2 id="wakeTitle">Saving…</h2>
      <p id="wakeMessage">WhatNow is waiting for the server to respond.</p>
      <p class="muted-text" id="wakeStatus">Please keep this page open.</p>
      <button class="pixel-button" type="button" id="wakeRetryButton" hidden>Try Again</button>
      <button class="pixel-button secondary" type="button" id="wakeCloseButton" hidden>Close</button>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function setWakeOverlay({
  open,
  title = 'Saving…',
  message = 'WhatNow is waiting for the server to respond.',
  status = 'Please keep this page open.',
  allowRetry = false,
  allowClose = false
}) {
  const overlay = ensureWakeOverlay();
  overlay.hidden = !open;

  const titleNode = overlay.querySelector('#wakeTitle');
  const messageNode = overlay.querySelector('#wakeMessage');
  const statusNode = overlay.querySelector('#wakeStatus');
  const retry = overlay.querySelector('#wakeRetryButton');
  const close = overlay.querySelector('#wakeCloseButton');

  if (titleNode) titleNode.textContent = title;
  if (messageNode) messageNode.textContent = message;
  if (statusNode) statusNode.textContent = status;
  if (retry) retry.hidden = !allowRetry;
  if (close) close.hidden = !allowClose;
}

function getResponseMessage(response, fallback) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json()
      .then((body) => body && body.message ? body.message : fallback)
      .catch(() => fallback);
  }

  return Promise.resolve(fallback);
}

async function submitFormResilient(form) {
  const submitter = form.querySelector('[type="submit"]');
  const originalText = submitter?.textContent;
  if (submitter) submitter.disabled = true;

  const targetUrl = form.getAttribute('action') || window.location.pathname;
  const method = (form.getAttribute('method') || 'POST').toUpperCase();

  // Only show the waiting dialog when the request is noticeably slow.
  // A healthy local/Render request normally finishes before this appears.
  let slowTimer = setTimeout(() => {
    setWakeOverlay({
      open: true,
      title: 'Still saving…',
      message: 'WhatNow is taking longer than usual to reach the server.',
      status: 'If Render was idle, it may be waking up. Your form is still intact.'
    });
  }, 1200);

  try {
    const response = await fetch(targetUrl, {
      method,
      body: new URLSearchParams(new FormData(form)),
      credentials: 'same-origin',
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-WhatNow-Resilient': '1',
        'Accept': 'application/json, text/html;q=0.9'
      }
    });

    clearTimeout(slowTimer);

    // IMPORTANT:
    // Receiving an HTTP response proves that the server is awake/reachable.
    // A 4xx/5xx is therefore an application/database error, NOT a Render sleep.
    if (!response.ok) {
      const message = await getResponseMessage(
        response,
        `WhatNow could not complete this action (HTTP ${response.status}).`
      );

      console.error('[DASHBOARD ACTION RESPONSE ERROR]', response.status, message);

      setWakeOverlay({
        open: true,
        title: 'Could not save that change',
        message,
        status: 'The server responded, so this is not a Render sleep issue.',
        allowRetry: true,
        allowClose: true
      });

      const retry = document.getElementById('wakeRetryButton');
      const close = document.getElementById('wakeCloseButton');

      if (retry) {
        retry.onclick = () => {
          setWakeOverlay({ open: false });
          submitFormResilient(form);
        };
      }

      if (close) {
        close.onclick = () => {
          setWakeOverlay({ open: false });
        };
      }

      form.closest('.task-row')?.classList.remove('is-completing');

      if (submitter) {
        submitter.disabled = false;
        if (originalText != null) submitter.textContent = originalText;
      }

      return;
    }

    setWakeOverlay({ open: false });

    // POST handlers redirect back to the relevant page. Fetch follows that
    // redirect, so response.url is the final destination.
    window.location.assign(response.url || '/dashboard');
  } catch (error) {
    clearTimeout(slowTimer);

    // fetch() only reaches this catch for an actual network-level failure,
    // aborted connection, DNS issue, browser offline state, etc.
    console.error('[DASHBOARD NETWORK ERROR]', error);

    setWakeOverlay({
      open: true,
      title: 'Can’t reach WhatNow',
      message: 'The browser could not contact the server. Your changes are still on this page.',
      status: 'Check your connection, or wait a moment if the host is starting up.',
      allowRetry: true,
      allowClose: true
    });

    const retry = document.getElementById('wakeRetryButton');
    const close = document.getElementById('wakeCloseButton');

    if (retry) {
      retry.onclick = () => {
        setWakeOverlay({ open: false });
        submitFormResilient(form);
      };
    }

    if (close) {
      close.onclick = () => setWakeOverlay({ open: false });
    }

    form.closest('.task-row')?.classList.remove('is-completing');

    if (submitter) {
      submitter.disabled = false;
      if (originalText != null) submitter.textContent = originalText;
    }
  }
}

function initResilientForms() {
  document.querySelectorAll('form[data-resilient-submit]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitFormResilient(form);
    });
  });
}

function initClassReordering() {
  const classesGrid = document.getElementById('classesGrid');
  if (!classesGrid || typeof Sortable === 'undefined') return;
  let savingOrder = false;

  async function saveClassOrder() {
    if (savingOrder) return;
    savingOrder = true;
    const order = [...classesGrid.querySelectorAll('.class-card')]
      .map((card) => card.dataset.classId)
      .filter(Boolean);

    try {
      const response = await fetch('/classes/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ order })
      });
      const contentType = response.headers.get('content-type') || '';
      const result = contentType.includes('application/json')
        ? await response.json()
        : { ok: false, message: await response.text() };
      if (!response.ok || !result.ok) {
        throw new Error(result.message || 'Could not save class order.');
      }
    } catch (error) {
      console.error('Could not save class order:', error);
      alert('Could not save class order. The page will reload.');
      location.reload();
    } finally {
      savingOrder = false;
    }
  }

  new Sortable(classesGrid, {
    animation: 150,
    handle: '.drag-handle',
    draggable: '.class-card',
    swap: true,
    swapClass: 'class-card-swap-target',
    direction: 'horizontal',
    swapThreshold: 0.65,
    invertedSwapThreshold: 0.35,
    ghostClass: 'class-card-ghost',
    chosenClass: 'class-card-chosen',
    dragClass: 'class-card-drag',
    filter: 'button:not(.drag-handle), input, textarea, select, a, form, label, .task-row, .task-list, .task-add-form, .task-edit-form, .class-form, .class-card-actions, .color-row',
    preventOnFilter: false,
    onStart() {
      document.body.classList.add('is-sorting-classes');

      // Play exactly once when the user successfully picks up a class.
      playRandomSound(UI_SOUNDS.pickup, 'pickup');
    },

    onEnd(event) {
      document.body.classList.remove('is-sorting-classes');

      const stayedInSamePosition = event.oldIndex === event.newIndex;

      // Stay completely silent while hovering/reordering. On release, play
      // exactly one result sound based on whether the class actually moved.
      if (stayedInSamePosition) {
        playRandomSound(UI_SOUNDS.drop, 'drop');
      } else {
        playRandomSound(UI_SOUNDS.shuffle, 'shuffle');
      }

      saveClassOrder();
    },

    onCancel() {
      document.body.classList.remove('is-sorting-classes');
    }
  });
}

function protectFormControlsFromDrag() {
  const selectors = 'input, textarea, select, label, .class-form, .task-add-form, .task-edit-form, .color-row';
  document.querySelectorAll(selectors).forEach((element) => {
    element.addEventListener('pointerdown', stopDragBubble);
    element.addEventListener('mousedown', stopDragBubble);
    element.addEventListener('touchstart', stopDragBubble, { passive: true });
  });
}

function stopDragBubble(event) {
  if (!event.target.closest('.drag-handle')) event.stopPropagation();
}
