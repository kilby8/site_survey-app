const appJson = require('./app.json');

module.exports = ({ config }) => {
  const baseExpo = appJson.expo || {};

  const expo = {
    ...baseExpo,
    scheme: 'sitesurvey',
    // Always override runtimeVersion with a plain string to prevent
    // EAS from injecting a policy object from the dashboard.
    // 2.0.0: v2 survey (adds native modules: svg, secure-store, crypto,
    // haptics). 1.0.0 binaries must never receive this JS over the air.
    runtimeVersion: '2.0.0',
    updates: {
      ...(baseExpo.updates || {}),
      url: 'https://u.expo.dev/aed7aae8-7d55-47e1-8850-c6b0040c99b5',
    },
  };

  return {
    ...config,
    ...appJson,
    expo,
  };
};