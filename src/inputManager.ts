import { trait, type World } from 'koota';
import * as wf from 'wayfare';

export const InputData = trait(() => ({
  dragDeltaX: 0,
  dragDeltaY: 0,
  dragging: false,
}));

export function createInputManager(world: World, canvas: HTMLCanvasElement) {
  let lastMouseX = 0;
  let lastMouseY = 0;
  const input = wf.getOrAdd(world, InputData);

  canvas.addEventListener('mousedown', (e) => {
    input.dragging = true;
    input.dragDeltaX = 0;
    input.dragDeltaY = 0;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!input.dragging) return;

    const deltaX = e.clientX - lastMouseX;
    const deltaY = e.clientY - lastMouseY;

    input.dragDeltaX = deltaX;
    input.dragDeltaY = deltaY;

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  canvas.addEventListener('mouseup', () => {
    input.dragging = false;
  });

  canvas.addEventListener('mouseleave', () => {
    input.dragging = false;
  });

  canvas.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        input.dragging = true;
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
      }
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      if (!input.dragging || e.touches.length !== 1) return;

      const deltaX = e.touches[0].clientX - lastMouseX;
      const deltaY = e.touches[0].clientY - lastMouseY;

      input.dragDeltaX = deltaX;
      input.dragDeltaY = deltaY;

      lastMouseX = e.touches[0].clientX;
      lastMouseY = e.touches[0].clientY;
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchend',
    (e) => {
      e.preventDefault();
      input.dragging = false;
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchcancel',
    (e) => {
      e.preventDefault();
      input.dragging = false;
    },
    { passive: false },
  );
}
