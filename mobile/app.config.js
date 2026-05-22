const appJson = require('./app.json');

module.exports = ({ config }) => {
  const baseExpo = appJson.expo || {};
  const mapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

  const expo = {
    ...baseExpo,
    ios: {
      ...(baseExpo.ios || {}),
      config: {
        ...((baseExpo.ios && baseExpo.ios.config) || {}),
        ...(mapsApiKey ? { googleMapsApiKey: mapsApiKey } : {}),
      },
    },
    android: {
      ...(baseExpo.android || {}),
      config: {
        ...((baseExpo.android && baseExpo.android.config) || {}),
        ...(mapsApiKey ? { googleMaps: { apiKey: mapsApiKey } } : {}),
      },
    },
    // Always override runtimeVersion with a plain string to prevent
    // EAS from injecting a policy object from the dashboard.
    runtimeVersion: '1.0.0',
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