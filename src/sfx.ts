import * as Tone from 'tone';

export const beginSfx = new Tone.Player(
  'assets/sfx/ambient-snare.mp3',
).toDestination();

export const backgroudMusic = new Tone.Player(
  'assets/sfx/background-music.mp3',
).toDestination();
backgroudMusic.loop = true;

export const siren = new Tone.Player('assets/sfx/siren.mp3').toDestination();
siren.loop = true;
export const constantSizzling = new Tone.Player(
  'assets/sfx/constant-sizzling.mp3',
).toDestination();
constantSizzling.loop = true;
constantSizzling.volume.value = -10;
export const splash = new Tone.Player('assets/sfx/splash.mp3').toDestination();
splash.volume.value = -3;
export const sizzleSwoosh = new Tone.Player(
  'assets/sfx/sizzle-swoosh.mp3',
).toDestination();
sizzleSwoosh.volume.value = -3;
export const explosion = new Tone.Player(
  'assets/sfx/explosion.mp3',
).toDestination();
explosion.volume.value = -3;

export const cellEatenSfx = new Tone.Player(
  'assets/sfx/cell-eaten.mp3',
).toDestination();
cellEatenSfx.volume.value = -5;

export const resetSfx = new Tone.Player('assets/sfx/reset.mp3').toDestination();
resetSfx.volume.value = -15;

export const winSfx = new Tone.Player('assets/sfx/win.mp3').toDestination();
winSfx.volume.value = -6;

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
