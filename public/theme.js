document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const saved = localStorage.getItem('whatnow-theme');
  root.dataset.theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  let button = document.getElementById('themeToggle');
  if (!button) {
    button = document.createElement('button');
    button.id = 'themeToggle';
    button.type = 'button';
    button.className = 'pixel-button floating-theme-toggle';
    button.setAttribute('aria-label', 'Toggle light and dark mode');
    document.body.appendChild(button);
  }
  const update = () => { button.textContent = root.dataset.theme === 'dark' ? '☀' : '☾'; };
  update();
  button.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('whatnow-theme', root.dataset.theme);
    update();
  });
});
