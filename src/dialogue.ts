import type { DialogMessage } from './dialogBox';
import { endingState } from './endingState';
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
      setTimeout(() => VO.welcome.start(), 700);
    },
  },
  {
    message: `${sp}Press the button in front of you to begin.${mp}`,
    characterStagger: 0.05,
    onAppear: () => {
      VO.press_the_button.start();
      gameStateManager.state.introMonologueStep = 1;
      gameStateManager.save();
    },
  },
];

export const level1dialogue: DialogMessage[] = [
  {
    message: `Your cooperation is ${sp}appreciated.${mp}`,
    characterStagger: 0.07,
    onAppear: () => VO.your_cooperation_is.start(),
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

export const endingDialogue: DialogMessage[] = [
  {
    message: `The entity has grown so much.${mp}`,
    characterStagger: 0.1,
  },
  {
    message: `It's time.${lp}`,
    characterStagger: 0.1,
    onAppear() {
      // Start flow
      setTimeout(() => {
        endingState.step++;
      }, 2000);

      // Showing the cube only after a delay
      setTimeout(() => {
        endingState.step++;
      }, 5000);
    },
  },
];

export const voidMonologue: DialogMessage[] = [
  {
    message: `Don't be scared, this isn't death${mp}`,
    characterStagger: 0.1,
  },
  {
    message: `${sp}It's an opportunity to start anew... and grow${lp}`,
    characterStagger: 0.1,
  },
];
