// Metro also bundles the desktop app's shared, platform-free modules (pairing link check, i18n).
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../src/shared')];

module.exports = config;
