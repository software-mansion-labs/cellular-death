import * as Tone from "tone";

export const beginSfx = new Tone.Player(
  "assets/sfx/ambient-snare.mp3",
).toDestination();

export const backgroudMusic = new Tone.Player(
  "assets/sfx/background-music.mp3",
).toDestination();
backgroudMusic.loop = true;

export const cellEatenSfx = new Tone.Player(
  "assets/sfx/cell-eaten.mp3",
).toDestination();
cellEatenSfx.volume.value = -15;

export const resetSfx = new Tone.Player(
  "assets/sfx/reset.mp3",
).toDestination();
resetSfx.volume.value = -15;

export const winSfx = new Tone.Player(
  "assets/sfx/win.mp3",
).toDestination();
winSfx.volume.value = -15;
