const { withAndroidManifest } = require('expo/config-plugins');

// expo-audio 1.1.x declares services even when background recording is disabled.
module.exports = function withForegroundOnlyAudio(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const application = manifest.application[0];
    const names = ['expo.modules.audio.service.AudioControlsService', 'expo.modules.audio.service.AudioRecordingService'];
    application.service = (application.service || []).filter(service => !names.includes(service.$['android:name']));
    for (const name of names) application.service.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    return config;
  });
};
