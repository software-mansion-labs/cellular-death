import nwbuild from 'nw-builder';

await nwbuild({
  mode: 'build',
  flavor: 'sdk',
  platform: 'win',
  srcDir: './dist',
  cacheDir: './node_modules/nw',
  outDir: './out/win',
  glob: false,
  logLevel: 'debug',
  app: {
    name: 'CellularDeath',
    /* File path of icon from where it is copied. */
    icon: './icon.ico',
    version: '0.0.0',
    comments: 'Diagnostic information',
    company: 'Software Mansion S.A.',
    fileDescription: 'A game made for the Jamsepticeye Game Jam',
    fileVersion: '0.0.0',
    internalName: 'CellularDeath',
    legalCopyright: 'Copyright (c) 2025 Software Mansion S.A.',
    originalFilename: 'CellularDeath',
    productName: 'CellularDeath',
    productVersion: '0.0.0',
  },
});

console.log('\nDone!');
