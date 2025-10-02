import nwbuild from 'nw-builder';

await nwbuild({
  mode: 'build',
  flavor: 'sdk',
  platform: 'osx',
  srcDir: './dist',
  cacheDir: './node_modules/nw',
  outDir: './out/mac',
  glob: false,
  logLevel: 'debug',
  app: {
    name: 'CellularDeath',
    /* File path of icon from where it is copied. */
    icon: './icon.icns',
    LSApplicationCategoryType: 'public.app-category.utilities',
    CFBundleIdentifier: 'com.swmansion.cellulardeath',
    CFBundleName: 'CellularDeath',
    CFBundleDisplayName: 'CellularDeath',
    CFBundleSpokenName: 'CellularDeath',
    CFBundleVersion: '0.0.0',
    CFBundleShortVersionString: '0.0.0',
    NSHumanReadableCopyright: 'Copyright (c) 2025 Software Mansion S.A',
    NSLocalNetworkUsageDescription:
      'The game requires access to network to showcase its capabilities',
  },
});

console.log('\nDone!');
