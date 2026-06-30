const appJson = require('./app.json');

const PRODUCTION_API_URL = 'https://api.carekosh.com';
const PREVIEW_API_URL = 'https://staging-api.carekosh.com';

function isCleartextDevelopmentBuild() {
  const profile = process.env.EAS_BUILD_PROFILE;
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';
  const explicitOverride = process.env.CAREKOSH_ALLOW_ANDROID_CLEARTEXT === 'true';

  return profile === 'development' || explicitOverride || apiUrl.startsWith('http://localhost');
}

module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE;
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';
  const usesCleartextTraffic = isCleartextDevelopmentBuild();

  if (profile === 'preview' && apiUrl && apiUrl !== PREVIEW_API_URL) {
    throw new Error('Preview Android builds must use the HTTPS staging API URL.');
  }

  if (profile === 'production' && apiUrl && apiUrl !== PRODUCTION_API_URL) {
    throw new Error('Production Android builds must use the HTTPS production API URL.');
  }

  return {
    ...config,
    ...appJson.expo,
    plugins: [
      ...(appJson.expo.plugins || []),
      ['expo-build-properties', { android: { usesCleartextTraffic } }],
    ],
    extra: {
      ...appJson.expo.extra,
      androidCleartextTrafficMode: usesCleartextTraffic ? 'development-only' : 'disabled',
    },
  };
};
