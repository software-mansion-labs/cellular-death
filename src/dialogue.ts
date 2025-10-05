import type { DialogMessage } from './dialogBox';
import { gameStateManager } from './saveGame';
import { VO } from './sfx';

const sp = '_'.repeat(5);
const mp = '_'.repeat(15);
const lp = '_'.repeat(40);

export const introMonologue: DialogMessage[] = [
  {
    message: `Welcome.${mp}`,
    characterStagger: 0.1,
    onAppear: () => {
      setTimeout(() => VO['welcome'].start(), 700);
    },
  },
  {
    message: `${sp}Press the button in front of you to begin.${mp}`,
    characterStagger: 0.05,
    onAppear: () => {
      VO['press_the_button'].start();
      gameStateManager.state.introMonologueStep = 1;
      gameStateManager.save();
    },
  },
];

export const level1dialogue: DialogMessage[] = [
  {
    message: `Your cooperation is ${sp}appreciated.${mp}`,
    characterStagger: 0.07,
    onAppear: () => VO['your_cooperation_is'].start(),
  },
  {
    message: `${sp}Your task is simple.${mp}`,
    characterStagger: 0.05,
    onAppear: () => {
      gameStateManager.state.introMonologueStep = 1;
      gameStateManager.save();
    },
  },
  {
    message: `${sp}Rotate the hexahedron. ${sp}Guide the Entity to the target. ${sp}Make any sacrifices necessary.${lp}`,
    characterStagger: 0.05,
  },
];

export const level1EndDialogue: DialogMessage[] = [
  { message: `Thank you.${mp}`, characterStagger: 0.1 },
  { message: `Proceed to the next task.${lp}`, characterStagger: 0.05 },
];

export const firstSlopesDialogue: DialogMessage[] = [
  {
    message: `The local fauna is conducive to the entity's growth.${mp}`,
    characterStagger: 0.05,
  },
  {
    message: `${sp}Use any opportunity to feed.${lp}`,
    characterStagger: 0.1,
  },
];
