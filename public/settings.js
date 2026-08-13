document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initVolume();
  initResilientForms();
});

function initTheme() {
  const root = document.documentElement;
  const saved = localStorage.getItem('whatnow-theme');
  const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.dataset.theme = saved || preferred;
}

function initVolume() {
  const slider = document.getElementById('sfxVolume');
  const output = document.getElementById('sfxVolumeValue');
  const test = document.getElementById('testSfxButton');
  if (!slider || !output) return;

  const raw = localStorage.getItem('whatnow-sfx-volume');
  const stored = raw === null || raw === '' ? NaN : Number(raw);
  const initial = Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.72;
  slider.value = String(Math.round(initial * 100));
  output.value = `${slider.value}%`;
  output.textContent = `${slider.value}%`;

  slider.addEventListener('input', () => {
    const volume = Number(slider.value) / 100;
    localStorage.setItem('whatnow-sfx-volume', String(volume));
    output.value = `${slider.value}%`;
    output.textContent = `${slider.value}%`;
  });

  test?.addEventListener('click', () => {
    const audio = new Audio('/sounds/ui_click.mp3');
    audio.volume = Number(slider.value) / 100;
    audio.play().catch(() => {});
  });
}

function ensureWakeOverlay() {
  return document.getElementById('wakeOverlay');
}
function setWakeOverlay(open, text = 'Connecting…', allowRetry = false) {
  const overlay = ensureWakeOverlay();
  if (!overlay) return;
  overlay.hidden = !open;
  const status = document.getElementById('wakeStatus');
  if (status) status.textContent = text;
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function submitFormResilient(form) {
  const button = form.querySelector('[type="submit"]');
  if (button) button.disabled = true;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      if (attempt > 1) setWakeOverlay(true, `Render is waking up… retry ${attempt} of 4.`);
      const targetUrl = form.getAttribute('action') || window.location.pathname;
      const method = (form.getAttribute('method') || 'POST').toUpperCase();

      const response = await fetch(targetUrl, {
        method,
        body: new URLSearchParams(new FormData(form)),
        credentials: 'same-origin',
        redirect: 'follow',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'X-WhatNow-Resilient': '1'
        }
      });

      if (response.ok) {
        window.location.assign(response.url || '/settings');
        return;
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        window.location.assign(response.url || '/settings');
        return;
      }
    } catch {}

    if (attempt < 4) {
      setWakeOverlay(true, 'Render appears to be asleep. Your form has not been cleared.');
      try { await fetch('/health', { cache: 'no-store' }); } catch {}
      await wait(2500);
    }
  }

  setWakeOverlay(true, 'WhatNow is still unavailable. Your form remains on this page; try again in a moment.');
  if (button) button.disabled = false;
}

function initResilientForms() {
  document.querySelectorAll('form[data-resilient-submit]').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      submitFormResilient(form);
    });
  });
}
