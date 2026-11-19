const { withProjectBuildGradle } = require('expo/config-plugins');

const KOTLIN_VERSION = '2.2.20';

function pinKotlinCompiler(contents) {
  // SDK 54's unversioned classpath otherwise inherits RN's Kotlin 2.1.20,
  // independently of android.kotlinVersion (stdlib/KSP).
  const dependency = /classpath\s*\(\s*(['"])org\.jetbrains\.kotlin:kotlin-gradle-plugin(?::[^'"\s]+)?\1\s*\)/g;
  if ([...contents.matchAll(dependency)].length !== 1) {
    throw new Error('Expected one Kotlin compiler classpath in Android build.gradle. Review the Expo template before building.');
  }
  return contents.replace(dependency, `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:${KOTLIN_VERSION}')`);
}

module.exports = config => withProjectBuildGradle(config, mod => {
  if (mod.modResults.language !== 'groovy') {
    throw new Error('CareKosh Kotlin compiler pin requires the Expo Groovy Android template.');
  }
  mod.modResults.contents = pinKotlinCompiler(mod.modResults.contents);
  return mod;
});
module.exports.KOTLIN_VERSION = KOTLIN_VERSION;
module.exports.pinKotlinCompiler = pinKotlinCompiler;
