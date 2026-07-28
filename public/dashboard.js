/*
  JIGGLY SOUND ARRAY
  ------------------
  Put your own audio files in public/sounds/ and add their public paths below.
  Add as many entries as you like; one random entry plays whenever Jiggly is clicked.

  The included jiggly-test.wav is only there so the sound system works immediately.
  Replace or remove it once you add Jiggly's real collection of deeply un-horse noises.
*/
const JIGGLY_SOUNDS = [
  '/sounds/jiggly_sfx1.mp3',
  '/sounds/meow_2Tmjbru.mp3',
  '/sounds/HOO HOO.mp3',
  '/sounds/dogtrill.mp3'
];

/* Ordinary UI sounds. These included files can also be replaced with your own. */
const UI_SOUNDS = {
  click: ['/sounds/ui-click.mp3'],
  success: ['/sounds/ui-success.mp3'],
  delete: ['/sounds/undertale_death.m4a'],
  drag: ['/sounds/ui_drag.m4a']
};

const SOUND_SETTINGS = {
  enabled: true,
  volume: 0.72
};

const audioTemplates = new Map();
const activeAudio = new Set();
let audioContext = null;

document.addEventListener('DOMContentLoaded', () => {
  initSoundSystem();
  initTheme();
  initToggleTargets();
  initAddTaskZones();
  initJigglyDrawer();
  initCalendar();
  initClassReordering();
  initImmediateDeleteAnimation();
  protectFormControlsFromDrag();
});

function allConfiguredSounds() {
  return [...new Set([
    ...JIGGLY_SOUNDS,
    ...Object.values(UI_SOUNDS).flat()
  ].filter(Boolean))];
}

function initSoundSystem() {
  allConfiguredSounds().forEach((path) => {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.load();
    audioTemplates.set(path, audio);
  });

  // A user gesture unlocks Web Audio on browsers that restrict autoplay.
  const unlock = () => {
    ensureAudioContext();
    if (audioContext?.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
  };

  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock, { passive: true });

  // Start normal button/link sounds on pointerdown so form navigation cannot cut
  // the sound off before it begins. Jiggly, delete, and drag have their own sounds.
  document.addEventListener('pointerdown', (event) => {
    const control = event.target.closest('button, a, [role="button"]');
    if (!control || control.dataset.sound === 'off') return;
    if (control.id === 'jigglyButton') return;
    if (control.classList.contains('delete-cross')) {
      playRandomSound(UI_SOUNDS.delete, 'delete');
      return;
    }
    if (control.classList.contains('drag-handle')) return;
    playRandomSound(UI_SOUNDS.click, 'click');
  }, { passive: true });
}

function ensureAudioContext() {
  if (audioContext) return audioContext;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  audioContext = new Context();
  return audioContext;
}

function playRandomSound(paths, fallbackType = 'click') {
  if (!SOUND_SETTINGS.enabled) return;
  if (!Array.isArray(paths) || paths.length === 0) {
    playSynthFallback(fallbackType);
    return;
  }

  const path = paths[Math.floor(Math.random() * paths.length)];
  const template = audioTemplates.get(path) || new Audio(path);
  const audio = template.cloneNode(true);
  audio.volume = SOUND_SETTINGS.volume;
  activeAudio.add(audio);

  const cleanUp = () => activeAudio.delete(audio);
  audio.addEventListener('ended', cleanUp, { once: true });
  audio.addEventListener('error', cleanUp, { once: true });

  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch((error) => {
      console.warn(`[WhatNow audio] Could not play ${path}. Using synthesized fallback.`, error);
      cleanUp();
      playSynthFallback(fallbackType);
    });
  }
}

function playSynthFallback(type = 'click') {
  const context = ensureAudioContext();
  if (!context) return;
  if (context.state === 'suspended') context.resume().catch(() => {});

  const patterns = {
    click: [[880, 0.045], [1180, 0.045]],
    success: [[660, 0.07], [880, 0.07], [1100, 0.09]],
    delete: [[520, 0.07], [360, 0.07], [220, 0.07]],
    drag: [[330, 0.06], [440, 0.06]],
    jiggly: [[1220, 0.08], [470, 0.08], [1600, 0.08], [720, 0.08], [1040, 0.1]]
  };

  const pattern = patterns[type] || patterns.click;
  let start = context.currentTime;

  pattern.forEach(([frequency, duration]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
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

  button.addEventListener('click', () => {
    const open = drawer.classList.toggle('is-open');

    // Animate the artwork rather than the whole button. This prevents the
    // button's hover transform from cancelling the spin while the mouse rests
    // over Jiggly.
    if (artwork) {
      artwork.classList.remove('jiggly-spin');
      void artwork.offsetWidth;
      artwork.classList.add('jiggly-spin');
    }

    button.setAttribute('aria-expanded', String(open));
    drawer.setAttribute('aria-hidden', String(!open));
    playRandomSound(JIGGLY_SOUNDS, 'jiggly');
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
  document.querySelectorAll('.delete-task-form').forEach((form) => {
    form.addEventListener('submit', () => {
      form.closest('.task-row')?.classList.add('is-deleting');
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
      playRandomSound(UI_SOUNDS.drag, 'drag');
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
    },
    onEnd() {
      document.body.classList.remove('is-sorting-classes');
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
