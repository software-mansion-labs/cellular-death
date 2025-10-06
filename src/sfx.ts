import * as Tone from 'tone';

export const beginSfx = new Tone.Player(
  'assets/sfx/ambient-snare.mp3',
).toDestination();

export const backgroudMusic = new Tone.Player(
  'assets/sfx/background-music.mp3',
).toDestination();
backgroudMusic.loop = true;

export const cellEatenSfx = new Tone.Player(
  'assets/sfx/cell-eaten.mp3',
).toDestination();
cellEatenSfx.volume.value = -15;

export const resetSfx = new Tone.Player('assets/sfx/reset.mp3').toDestination();
resetSfx.volume.value = -15;

export const winSfx = new Tone.Player('assets/sfx/win.mp3').toDestination();
winSfx.volume.value = -15;

export const VO = Object.fromEntries(
  [
    'welcome',
    'press_the_button',
    'your_cooperation_is',
    'your_task_is_simple',
    'thank_you',
    'the_local_fauna',
    'the_entity_has_grown',
    'dont_be_scared',
  ].map((key) => {
    const player = new Tone.Player(`assets/vo/${key}.mp3`).toDestination();
    player.volume.value = -5;

    return [key, player] as const;
  }),
);
