/**
 * In-app update checker for sideloaded installs (this app is not on the
 * Play Store, so there is no store-provided update mechanism).
 *
 * Reads the GitHub "latest release" API for GITHUB_OWNER/GITHUB_REPO: the
 * release tag is the version, the attached .apk asset is the download.
 * `downloadAndInstallUpdate` pulls that APK into the cache directory and
 * hands it to the system package installer.
 */

import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { GITHUB_OWNER, GITHUB_REPO } from './config';

export type UpdateManifest = {
  version: string;
  notes?: string;
  apkUrl: string;
};

export type UpdateCheck = { available: false } | { available: true; manifest: UpdateManifest };

type GithubAsset = { name: string; browser_download_url: string };
type GithubRelease = { tag_name: string; body: string | null; assets: GithubAsset[] };

/** Dotted numeric version compare, e.g. "1.9.0" < "1.10.0". */
function isNewer(remote: string, current: string): boolean {
  const a = remote.split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateCheck> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    { headers: { Accept: 'application/vnd.github+json' } }
  );
  if (res.status === 404) throw new Error('No releases have been published yet.');
  if (!res.ok) throw new Error(`Update check failed (HTTP ${res.status}).`);

  const release = (await res.json()) as GithubRelease;
  const version = release.tag_name?.replace(/^v/i, '');
  const apk = release.assets?.find((a) => a.name.toLowerCase().endsWith('.apk'));
  if (!version || !apk) throw new Error('The latest release has no APK attached.');

  if (!isNewer(version, currentVersion)) return { available: false };
  return {
    available: true,
    manifest: { version, notes: release.body ?? undefined, apkUrl: apk.browser_download_url },
  };
}

const APK_FILENAME = 'paddle-stack-update.apk';

export async function downloadAndInstallUpdate(
  apkUrl: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const destination = new File(Paths.cache, APK_FILENAME);
  if (destination.exists) destination.delete();

  const task = File.createDownloadTask(apkUrl, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0) onProgress?.(bytesWritten / totalBytes);
    },
  });

  const file = await task.downloadAsync();
  if (!file) throw new Error('Download did not complete.');

  // FLAG_GRANT_READ_URI_PERMISSION - the installer needs read access to a
  // content:// URI it did not create.
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: file.contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1,
  });
}
