/** Read-only preflight of the published AAR. Does not replace checking the built APK. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const archive = process.argv[2];
assert.ok(archive && path.isAbsolute(archive), 'Provide an absolute path to moonshine-voice-0.1.5.aar');
const entry = name => execFileSync('unzip', ['-p', archive, name], { maxBuffer: 40_000_000 });
const manifest = entry('AndroidManifest.xml').toString();
assert.match(manifest, /minSdkVersion="26"/);
const files = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).split('\n').filter(name => /^jni\/.*\.so$/.test(name));
assert.ok(files.some(name => name.includes('arm64-v8a/')));
for (const name of files) {
  const data = entry(name);
  assert.equal(data.subarray(0, 4).toString('hex'), '7f454c46');
  assert.equal(data[5], 1, 'Expected little-endian ELF');
  const bits64 = data[4] === 2;
  const offset = bits64 ? Number(data.readBigUInt64LE(32)) : data.readUInt32LE(28);
  const size = data.readUInt16LE(bits64 ? 54 : 42), count = data.readUInt16LE(bits64 ? 56 : 44);
  let loads = 0;
  for (let i = 0; i < count; i++) {
    const start = offset + i * size;
    if (data.readUInt32LE(start) !== 1) continue; // PT_LOAD
    const alignment = bits64 ? Number(data.readBigUInt64LE(start + 48)) : data.readUInt32LE(start + 28);
    // Play's 16 KB compatibility requirement is for 64-bit native code.
    if (bits64) assert.ok(alignment >= 16384, `${name}: PT_LOAD alignment ${alignment} is below 16 KB`);
    loads++;
  }
  assert.ok(loads > 0, name);
  console.log(`${name}: ${loads} load segments checked`);
}
console.log('Published AAR: API 26, ARM64 present, 64-bit ELF alignment checked. APK ZIP alignment remains a build-time gate.');
