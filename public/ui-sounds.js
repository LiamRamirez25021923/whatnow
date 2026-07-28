/* Shared WhatNow button sounds for pages other than the dashboard. */
(() => {
  const sounds = {
    click: '/sounds/ui-click.wav',
    delete: '/sounds/ui-delete.wav'
  };

  const templates = new Map();
  const active = new Set();
  let context = null;

  Object.values(sounds).forEach((path) => {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.load();
    templates.set(path, audio);
  });

  function ensureContext() {
    if (context) return context;
    const Context = window.AudioContext || window.webkitAudioContext;
    context = Context ? new Context() : null;
    return context;
  }

  function fallback(kind) {
    const audioContext = ensureContext();
    if (!audioContext) return;
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const frequencies = kind === 'delete' ? [520, 340, 220] : [880, 1180];
    let start = audioContext.currentTime;
    frequencies.forEach((frequency) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.1, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.065);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.075);
      start += 0.065;
    });
  }

  function play(kind) {
    const path = sounds[kind] || sounds.click;
    const template = templates.get(path) || new Audio(path);
    const audio = template.cloneNode(true);
    audio.volume = 0.72;
    active.add(audio);
    const clean = () => active.delete(audio);
    audio.addEventListener('ended', clean, { once: true });
    audio.addEventListener('error', clean, { once: true });
    const promise = audio.play();
    promise?.catch(() => {
      clean();
      fallback(kind);
    });
  }

  document.addEventListener('pointerdown', (event) => {
    ensureContext()?.resume().catch(() => {});
    const control = event.target.closest('button, a, [role="button"]');
    if (!control || control.dataset.sound === 'off') return;
    play(control.classList.contains('delete-cross') ? 'delete' : 'click');
  }, { passive: true });
})();
