import type { DialogMessage } from './dialogBox';
import { gameStateManager } from './saveGame';

const sp = '_'.repeat(5);
const mp = '_'.repeat(15);
const lp = '_'.repeat(40);

export const introMonologue: DialogMessage[] = [
  { message: `Welcome.${mp}`, characterStagger: 0.1 },
  {
    message: `${sp}Press the button in front of you to begin.${mp}`,
    characterStagger: 0.05,
    onAppear: () => {
      console.log('onAppear called');
      gameStateManager.state.introMonologueStep = 1;
      gameStateManager.save();
    },
  },
];

export const level1dialogue: DialogMessage[] = [
  { message: `Welcome.${mp}`, characterStagger: 0.1 },
  {
    message: `${sp}Your task is simple.${mp}`,
    characterStagger: 0.05,
    onAppear: () => {
      console.log('onAppear called');
      gameStateManager.state.introMonologueStep = 1;
      gameStateManager.save();
    },
  },
  {
    message: `${sp}Rotate the hexahedron. ${sp}Guide the Entity to the target. ${sp}Make any sacrifices necessary.${lp}`,
    characterStagger: 0.05,
  },
];
