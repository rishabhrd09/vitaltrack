const assert = require('node:assert/strict');
const test = require('node:test');
const { pinKotlinCompiler, KOTLIN_VERSION } = require('../plugins/withKotlinCompiler');

const template = `buildscript {
  repositories { google(); mavenCentral() }
  dependencies {
    classpath('com.android.tools.build:gradle')
    classpath('com.facebook.react:react-native-gradle-plugin')
    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')
  }
}
apply plugin: "expo-root-project"
apply plugin: "com.facebook.react.rootproject"
`;

test('compiler pin changes only Kotlin and survives repeated Expo prebuilds', () => {
  const expected = template.replace("classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')", `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:${KOTLIN_VERSION}')`);
  assert.equal(pinKotlinCompiler(template), expected);
  assert.equal(pinKotlinCompiler(expected), expected);
  assert.equal(pinKotlinCompiler(template.replace('kotlin-gradle-plugin\'', 'kotlin-gradle-plugin:2.1.20\'')), expected);
});

test('compiler pin refuses changed or ambiguous Gradle templates', () => {
  assert.throws(() => pinKotlinCompiler(template.replace('org.jetbrains.kotlin:kotlin-gradle-plugin', 'other-plugin')), /Expected one/);
  assert.throws(() => pinKotlinCompiler(template + "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')"), /Expected one/);
});

test('compiler pin accepts the Gradle double-quoted classpath form', () => {
  const alternate = template.replace("classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')", 'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin")');
  assert.equal(pinKotlinCompiler(alternate), pinKotlinCompiler(template));
});
