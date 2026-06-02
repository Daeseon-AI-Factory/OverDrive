// Minimal Expo babel config.
// babel-preset-expo auto-injects the worklets/reanimated plugin for the New Architecture —
// do NOT add 'react-native-reanimated/plugin' or 'react-native-worklets/plugin' manually
// (double-registration breaks the build). Kept explicit because jest's babel-jest needs a config file.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
