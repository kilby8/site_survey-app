const appJson = require('./app.json');

module.exports = ({ config }) => {
  const baseExpo = appJson.expo || {};

  const isEasContext = Boolean(
    process.env.EAS_BUILD ||
    process.env.EAS_UPDATE ||
    process.env.EAS_BUILD_PROFILE ||
    process.env.EXPO_TOKEN ||
    process.env.CI
  );

  const expo = {
    ...baseExpo,
    // Always override runtimeVersion with a plain string to prevent
    // EAS from injecting a policy object from the dashboard.
    runtimeVersion: '1.0.0',
    updates: {
      ...(baseExpo.updates || {}),
      url: 'https://u.expo.dev/aed7aae8-7d55-47e1-8850-c6b0040c99b5',
    },
  };

  if (!isEasContext) {
    delete expo.updates;
  }

  return {
    ...config,
    ...appJson,
    expo,
  };
};