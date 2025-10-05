import type { DialogMessage } from './dialogBox';

const sp = '_'.repeat(5);
const mp = '_'.repeat(15);
const lp = '_'.repeat(40);

export const level1dialogue: DialogMessage[] = [
  { message: `Welcome.${mp}`, characterStagger: 0.1 },
  { message: `${sp}Your task is simple.${mp}`, characterStagger: 0.05 },
  {
    message: `${sp}Rotate the hexahedron. ${sp}Guide the Entity to the target. ${sp}Make any sacrifices necessary.${lp}`,
    characterStagger: 0.05,
  },
];
