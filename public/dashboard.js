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

// Drag-and-drop reordering for class cards
document.addEventListener('DOMContentLoaded', function () {
  const grid = document.querySelector('.classes-grid');
  if (!grid) return;

  let dragSrcEl = null;

  function handleDragStart(e) {
    dragSrcEl = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', this.dataset.classId); } catch (err) {}
  }

  function handleDragEnd() {
    this.classList.remove('dragging');
  }

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.class-card:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  function attachDnD(card) {
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
  }

  // initialize existing cards
  grid.querySelectorAll('.class-card').forEach(attachDnD);

  grid.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(grid, e.clientY);
    const dragging = grid.querySelector('.dragging');
    if (!dragging) return;
    if (!afterElement) {
      grid.appendChild(dragging);
    } else {
      grid.insertBefore(dragging, afterElement);
    }
  });

  grid.addEventListener('drop', async (e) => {
    e.preventDefault();
    // collect new order
    const order = [...grid.querySelectorAll('.class-card')].map(c => c.dataset.classId).filter(Boolean);
    const main = document.querySelector('main');
    const user = main ? main.dataset.user : null;
    if (!user) return;

    const body = new URLSearchParams();
    body.append('user', user);
    body.append('action', 'reorderClasses');
    body.append('classOrder', JSON.stringify(order));

    try {
      await fetch('/dashboard/action', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    } catch (err) {
      console.error('Failed to save class order', err);
    }
  });

  // Observe for newly added cards (e.g., after creating a class)
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1 && node.classList.contains('class-card')) attachDnD(node);
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
