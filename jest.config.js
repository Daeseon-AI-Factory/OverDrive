/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Colocated *.test.ts(x) next to source. Pure-logic tests (combat power, JUICE tier
  // classification, PR detection) are the core unit-test targets per spec §10.
  // RTL v13 auto-extends expect with its matchers — no extend-expect setup needed.
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  // ui/primitives now imports the skin chrome (ui/skins/HudPanel), which imports Skia — jest
  // needs (a) the package babel-transformed (jest-expo's default list + skia) and (b) the
  // official Skia jest mock (Canvas→View, useFont→null → GradientDigits falls back to plain
  // Text), appended to the preset's own setupFiles.
  setupFiles: [
    ...require('jest-expo/jest-preset.js').setupFiles,
    '@shopify/react-native-skia/jestSetup.js',
  ],
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|@shopify/react-native-skia))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
