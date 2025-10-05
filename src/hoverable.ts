import { trait } from 'koota';
import * as d from 'typegpu/data';

/**
 * Registers an entity as hoverable, meaning it will react
 * to the player moving the mouse over it.
 *
 * Does nothing by itself, just toggles the hover state on or off.
 */
export const Hoverable = trait({
  hover: false,
  boundsSize: () => d.vec3f(0.2),
});
