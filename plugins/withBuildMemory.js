/**
 * Raises the Gradle JVM's heap and metaspace.
 *
 * The template default (-Xmx2048m -XX:MaxMetaspaceSize=512m) is not enough for
 * the Kotlin lint analyzer that release builds run over the native modules:
 * `:react-native-screens:lintVitalAnalyzeRelease` dies with
 * `OutOfMemoryError: Metaspace` partway through the build.
 *
 * This lives as a config plugin rather than a hand edit to
 * android/gradle.properties because that directory is generated - a
 * `prebuild --clean` would silently discard the fix and the build would start
 * failing again.
 */

const { withGradleProperties } = require('expo/config-plugins');

const DEFAULT_JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=2048m';

module.exports = function withBuildMemory(config, { jvmArgs = DEFAULT_JVM_ARGS } = {}) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs')
    );
    cfg.modResults.push({
      type: 'property',
      key: 'org.gradle.jvmargs',
      value: jvmArgs,
    });
    return cfg;
  });
};
