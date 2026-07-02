document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('[data-toggle-target]').forEach(function (toggle) {
    toggle.addEventListener('click', function () {
      const target = document.querySelector(this.dataset.toggleTarget);
      if (!target) return;
      target.classList.toggle('hidden');
      if (!target.classList.contains('hidden')) {
        const firstInput = target.querySelector('input:not([type=hidden])');
        if (firstInput) firstInput.focus();
      }
    });
  });
});

// Optimized Drag-and-drop reordering for class cards
document.addEventListener('DOMContentLoaded', function () {
  const grid = document.querySelector('.classes-grid');
  if (!grid) return;

  let dragSrcEl = null;
  let isSaving = false;
  let dragoverTimeout = null;
  const dragoverDebounceMs = 16; // ~60fps

  // Cache for card positions to optimize getDragAfterElement
  let positionCache = [];

  function updatePositionCache() {
    const dragging = grid.querySelector('.dragging');
    positionCache = [...grid.querySelectorAll('.class-card:not(.dragging)')].map(card => ({
      element: card,
      top: card.getBoundingClientRect().top,
      bottom: card.getBoundingClientRect().bottom,
      midpoint: card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2
    }));
  }

  function getDragAfterElement(y) {
    // Find the card whose midpoint is closest to the mouse Y position
    for (let i = 0; i < positionCache.length; i++) {
      const cached = positionCache[i];
      if (y < cached.midpoint) {
        return cached.element;
      }
    }
    return null;
  }

  function handleDragStart(e) {
    dragSrcEl = this;
    this.classList.add('dragging');
    this.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    updatePositionCache();
  }

  function handleDragEnd(e) {
    this.classList.remove('dragging');
    this.style.opacity = '1';
    grid.classList.remove('drag-active');
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    grid.classList.add('drag-active');

    // Debounce position recalculation
    if (dragoverTimeout) clearTimeout(dragoverTimeout);
    dragoverTimeout = setTimeout(() => {
      updatePositionCache();
      const afterElement = getDragAfterElement(e.clientY);
      const dragging = grid.querySelector('.dragging');
      if (!dragging) return;

      if (!afterElement) {
        grid.appendChild(dragging);
      } else {
        grid.insertBefore(dragging, afterElement);
      }
    }, dragoverDebounceMs);
  }

  function handleDragLeave(e) {
    // Only remove drag-active if we're leaving the grid entirely
    if (e.target === grid && !grid.querySelector('.dragging')) {
      grid.classList.remove('drag-active');
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    grid.classList.remove('drag-active');

    if (isSaving) return; // Prevent multiple concurrent saves

    // Collect new order
    const order = [...grid.querySelectorAll('.class-card')].map(c => c.dataset.classId).filter(Boolean);
    const main = document.querySelector('main');
    const user = main ? main.dataset.user : null;
    if (!user) return;

    isSaving = true;
    grid.classList.add('saving');

    const body = new URLSearchParams();
    body.append('user', user);
    body.append('action', 'reorderClasses');
    body.append('classOrder', JSON.stringify(order));

    try {
      const response = await fetch('/dashboard/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      if (!response.ok) {
        console.error('Failed to save class order:', response.status);
        showNotification('Failed to save class order. Try again.', 'error');
      }
    } catch (err) {
      console.error('Failed to save class order', err);
      showNotification('Error saving class order.', 'error');
    } finally {
      isSaving = false;
      grid.classList.remove('saving');
    }
  }

  function showNotification(message, type = 'success') {
    const banner = document.createElement('div');
    banner.className = `message-banner ${type === 'error' ? 'error-banner' : 'success-banner'}`;
    banner.textContent = message;
    const dashboardCard = document.querySelector('.dashboard-card');
    if (dashboardCard) {
      dashboardCard.appendChild(banner);
      setTimeout(() => banner.remove(), 3000);
    }
  }

  function attachDnD(card) {
    card.setAttribute('draggable', 'true');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-grabbed', 'false');
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
  }

  // Initialize existing cards
  grid.querySelectorAll('.class-card').forEach(attachDnD);

  // Event listeners on grid
  grid.addEventListener('dragover', handleDragOver);
  grid.addEventListener('dragleave', handleDragLeave);
  grid.addEventListener('drop', handleDrop);

  // Observe for newly added cards
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1 && node.classList.contains('class-card')) {
          attachDnD(node);
        }
      });
    }
  });
  mo.observe(grid, { childList: true, subtree: false });

  // toggle collapsed add form on click for accessibility (mobile)
  grid.addEventListener('click', (e) => {
    const zone = e.target.closest('.add-task-zone');
    const collapsed = e.target.closest('.task-add-form.collapsed');
    const target = zone || collapsed;
    if (target) {
      const form = target.closest('.class-card')?.querySelector('.task-add-form.collapsed');
      if (form) {
        form.classList.remove('collapsed');
        form.style.visibility = 'visible';
        const firstInput = form.querySelector('.text-input');
        if (firstInput) firstInput.focus();
      }
    }
  });
});
