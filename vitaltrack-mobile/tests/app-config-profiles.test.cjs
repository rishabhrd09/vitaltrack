/* eslint-env node */
// Build-profile guards: the voice diagnostics test build is staging-only and can never reach production.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');

const configure = require(path.join(__dirname, '..', 'app.config.js'));
function withEnv(env, fn) {
  const keys = ['EAS_BUILD_PROFILE', 'EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_VOICE_DIAGNOSTICS', 'EXPO_PUBLIC_WHISTLE_LISTENING', 'CAREKOSH_ALLOW_ANDROID_CLEARTEXT'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
    return fn();
  } finally {
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
}
const STAGING = 'https://staging-api.carekosh.com';

test('the diagnostics profile builds only against the HTTPS staging API', () => {
  const config = withEnv({ EAS_BUILD_PROFILE: 'preview-voice-diagnostics', EXPO_PUBLIC_API_URL: STAGING, EXPO_PUBLIC_VOICE_DIAGNOSTICS: '1' }, () => configure({ config: {} }));
  assert.equal(config.android.package, 'com.carekosh.mobile');
  for (const url of [undefined, '', 'http://staging-api.carekosh.com', 'https://api.carekosh.com', `${STAGING}/`]) {
    assert.throws(() => withEnv({ EAS_BUILD_PROFILE: 'preview-voice-diagnostics', EXPO_PUBLIC_API_URL: url, EXPO_PUBLIC_VOICE_DIAGNOSTICS: '1' },
      () => configure({ config: {} })), /staging API URL/, String(url));
  }
});

test('production refuses the voice diagnostics flag; normal profiles are unchanged', () => {
  assert.throws(() => withEnv({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_API_URL: 'https://api.carekosh.com', EXPO_PUBLIC_VOICE_DIAGNOSTICS: '1' },
    () => configure({ config: {} })), /must not enable offline voice diagnostics/);
  assert.equal(withEnv({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_API_URL: 'https://api.carekosh.com' }, () => configure({ config: {} })).android.package, 'com.carekosh.mobile');
  assert.equal(withEnv({ EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_API_URL: STAGING }, () => configure({ config: {} })).android.package, 'com.carekosh.mobile');
  assert.throws(() => withEnv({ EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_API_URL: 'http://example.invalid' }, () => configure({ config: {} })), /staging API URL/);
});

test('Whistle is explicit in both preview profiles while diagnostics stay separate', () => {
  const eas = require(path.join(__dirname, '..', 'eas.json'));
  const profile = eas.build['preview-voice-diagnostics'];
  assert.equal(profile.extends, 'preview');
  assert.deepEqual(profile.env, { EXPO_PUBLIC_API_URL: STAGING, EXPO_PUBLIC_VOICE_DIAGNOSTICS: '1', EXPO_PUBLIC_WHISTLE_LISTENING: '1' });
  for (const name of ['development', 'preview', 'production']) assert.equal(eas.build[name].env.EXPO_PUBLIC_VOICE_DIAGNOSTICS, undefined, name);
});


test('production rejects the Whistle flag and preview Whistle remains staging-only', () => {
  for (const flag of ['1', '0', '']) assert.throws(() => withEnv({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_API_URL: 'https://api.carekosh.com', EXPO_PUBLIC_WHISTLE_LISTENING: flag },
    () => configure({ config: {} })), /Whistle/i, flag);
  assert.equal(withEnv({ EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_API_URL: STAGING, EXPO_PUBLIC_WHISTLE_LISTENING: '1' }, () => configure({ config: {} })).android.package, 'com.carekosh.mobile');
  for (const url of ['https://api.carekosh.com', 'http://staging-api.carekosh.com']) assert.throws(() => withEnv({ EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_API_URL: url, EXPO_PUBLIC_WHISTLE_LISTENING: '1' }, () => configure({ config: {} })), /staging API URL/);
  const eas = require(path.join(__dirname, '..', 'eas.json'));
  for (const name of ['preview', 'preview-voice-diagnostics']) assert.equal(eas.build[name].env.EXPO_PUBLIC_WHISTLE_LISTENING, '1', name);
  for (const name of ['development', 'production']) assert.equal(eas.build[name].env.EXPO_PUBLIC_WHISTLE_LISTENING, undefined, name);
});


test('Whistle flags outside a named EAS profile still require the exact HTTPS staging API', () => {
  for (const flag of [{ EXPO_PUBLIC_WHISTLE_LISTENING: '1' }, { EXPO_PUBLIC_VOICE_DIAGNOSTICS: '1' }]) {
    for (const url of [undefined, '', 'https://api.carekosh.com', 'http://staging-api.carekosh.com', `${STAGING}/`]) {
      assert.throws(() => withEnv({ EXPO_PUBLIC_API_URL: url, ...flag }, () => configure({ config: {} })), /staging API URL/, JSON.stringify({ url, ...flag }));
    }
    assert.equal(withEnv({ EXPO_PUBLIC_API_URL: STAGING, ...flag }, () => configure({ config: {} })).android.package, 'com.carekosh.mobile');
  }
});
