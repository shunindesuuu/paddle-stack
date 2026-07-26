/**
 * Repo that hosts release APKs. The update checker reads GitHub's "latest
 * release" API - the release tag becomes the version and the attached .apk
 * is the download, so there's no separate manifest file to hand-maintain.
 * Ship an update by publishing a new release here with an incremented tag
 * (e.g. v1.1.0) and the built APK attached.
 */
export const GITHUB_OWNER = 'shunindesuuu';
export const GITHUB_REPO = 'paddle-stack';
