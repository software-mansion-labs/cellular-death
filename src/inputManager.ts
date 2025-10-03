import { trait, type World } from 'koota';
import * as wf from 'wayfare';

export const InputData = trait(() => ({
  /**
   * The change in X position of the mouse or touch since the last frame.
   * It's in units fraction of the canvas width. (1 = canvas width)
   */
  dragDeltaX: 0,
  /**
   * The change in Y position of the mouse or touch since the last frame.
   * It's in units fraction of the canvas height. (1 = canvas height)
   */
  dragDeltaY: 0,
  /**
   * The X position of the mouse on hover. (0=left, 1=right)
   */
  mouseX: 0,
  /**
   * The Y position of the mouse on hover. (0=top, 1=bottom)
   */
  mouseY: 0,
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
    input.mouseX = e.clientX / canvas.clientWidth;
    input.mouseY = e.clientY / canvas.clientHeight;

    if (!input.dragging) return;

    input.dragDeltaX = (e.clientX - lastMouseX) / canvas.clientWidth;
    input.dragDeltaY = (e.clientY - lastMouseY) / canvas.clientHeight;

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

      input.dragDeltaX =
        (e.touches[0].clientX - lastMouseX) / canvas.clientWidth;
      input.dragDeltaY =
        (e.touches[0].clientY - lastMouseY) / canvas.clientHeight;

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
