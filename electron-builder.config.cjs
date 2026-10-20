// #44 installers. The app is staged into build/app first (scripts/stage-app.mjs).
// Unsigned unless the signing secrets are set in CI (CSC_LINK / WIN_CSC_LINK …); nothing secret
// lives in the repository.
const electronVersion = require('./app/main/package.json').dependencies.electron.replace(
  /^[^\d]*/,
  '',
);

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.jackela.clarityokr',
  productName: 'ClarityOKR',
  electronVersion,
  directories: { app: 'build/app', output: 'dist', buildResources: 'build/resources' },
  // Versioned names: ClarityOKR-0.3.0-mac-arm64.dmg, ClarityOKR-0.3.0-win-x64.exe, …
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  asar: true,
  // better-sqlite3 is native: rebuilt for Electron and kept outside the asar archive.
  npmRebuild: true,
  asarUnpack: ['node_modules/better-sqlite3/**'],
  files: ['package.json', 'app/**', 'node_modules/**', '!*.tgz'],
  publish: null,
  mac: {
    category: 'public.app-category.productivity',
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }],
  },
  win: { target: [{ target: 'nsis', arch: ['x64'] }] },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true },
  linux: {
    category: 'Office',
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
    ],
    maintainer: 'Jackela',
  },
};
