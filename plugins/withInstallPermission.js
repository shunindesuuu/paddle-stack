/**
 * Adds REQUEST_INSTALL_PACKAGES so the in-app update checker can hand a
 * downloaded APK to the system installer.
 *
 * This is app-specific (per-app install-source permission) so, unlike
 * expo-file-system's own FileProvider, nothing installs it for us - it has
 * to be a config plugin rather than a hand edit, since `prebuild --clean`
 * regenerates android/app/src/main/AndroidManifest.xml from scratch.
 */

const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withInstallPermission(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'] || [];
    const already = manifest.manifest['uses-permission'].some(
      (p) => p.$['android:name'] === 'android.permission.REQUEST_INSTALL_PACKAGES'
    );
    if (!already) {
      manifest.manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.REQUEST_INSTALL_PACKAGES' },
      });
    }
    return cfg;
  });
};
