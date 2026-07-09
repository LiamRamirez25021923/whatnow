document.addEventListener('DOMContentLoaded', () => {
  initToggleTargets();
  initAddTaskZones();
  initClassReordering();
  protectFormControlsFromDrag();
});

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

      if (!form || !form.classList.contains('task-add-form')) {
        return;
      }

      form.classList.toggle('collapsed');

      const firstInput = form.querySelector('input[name="taskTitle"]');
      if (!form.classList.contains('collapsed') && firstInput) {
        setTimeout(() => firstInput.focus(), 50);
      }
    });
  });
}

function initClassReordering() {
  const classesGrid = document.getElementById('classesGrid');

  if (!classesGrid) {
    return;
  }

  if (typeof Sortable === 'undefined') {
    console.warn('SortableJS is not loaded. Class reordering is disabled.');
    return;
  }

  let savingOrder = false;

  async function saveClassOrder() {
    if (savingOrder) return;

    savingOrder = true;

    const order = [...classesGrid.querySelectorAll('.class-card')]
      .map((card) => card.dataset.classId)
      .filter(Boolean);

    console.log('Saving class order:', order);

    try {
      const response = await fetch('/classes/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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

      console.log('Class order saved.');
    } catch (err) {
      console.error('Could not save class order:', err);
      alert('Could not save class order. The page will reload.');
      location.reload();
    } finally {
      savingOrder = false;
    }
  }

  new Sortable(classesGrid, {
    animation: 150,

    // Only the grabby icon can start dragging.
    handle: '.drag-handle',

    // Only class cards are sortable.
    draggable: '.class-card',

    // Swap card positions instead of making the whole grid slide around.
    swap: true,
    swapClass: 'class-card-swap-target',

    direction: 'horizontal',
    swapThreshold: 0.65,
    invertedSwapThreshold: 0.35,

    ghostClass: 'class-card-ghost',
    chosenClass: 'class-card-chosen',
    dragClass: 'class-card-drag',

    // Do not start dragging from normal controls.
    filter: [
      'button:not(.drag-handle)',
      'input',
      'input[type="color"]',
      'textarea',
      'select',
      'a',
      'form',
      'label',
      '.task-row',
      '.task-list',
      '.task-add-form',
      '.task-edit-form',
      '.class-form',
      '.class-card-actions',
      '.color-row'
    ].join(', '),

    preventOnFilter: false,

    onStart(event) {
      const originalTarget = event.originalEvent && event.originalEvent.target;
      const startedFromHandle = originalTarget && originalTarget.closest('.drag-handle');

      if (!startedFromHandle) {
        return false;
      }

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
  const protectedSelectors = [
    'input',
    'input[type="color"]',
    'textarea',
    'select',
    'label',
    '.class-form',
    '.task-add-form',
    '.task-edit-form',
    '.color-row'
  ].join(', ');

  document.querySelectorAll(protectedSelectors).forEach((element) => {
    element.addEventListener('pointerdown', stopDragBubble);
    element.addEventListener('mousedown', stopDragBubble);
    element.addEventListener('touchstart', stopDragBubble, { passive: true });
  });
}

function stopDragBubble(event) {
  const isDragHandle = event.target.closest('.drag-handle');

  if (!isDragHandle) {
    event.stopPropagation();
  }
}