type ReleaseAsset = {
  name?: string;
  browser_download_url?: string;
};

type GitHubLatestRelease = {
  tag_name?: string;
  published_at?: string;
  assets?: ReleaseAsset[];
};

type CachedApk = {
  url: string;
  expiresAt: number;
};

let cachedApk: CachedApk | null = null;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function buildGitHubLatestFallbackUrl(): string {
  const owner = process.env.GITHUB_RELEASE_OWNER?.trim() || "kilby8";
  const repo = process.env.GITHUB_RELEASE_REPO?.trim() || "site_survey-app";
  return `https://github.com/${owner}/${repo}/releases/latest`;
}

function pickApkAssetUrl(release: GitHubLatestRelease): string | null {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const assetRegex = new RegExp(process.env.GITHUB_APK_ASSET_REGEX?.trim() || "\\.apk$", "i");

  for (const asset of assets) {
    const name = String(asset.name || "").trim();
    const downloadUrl = String(asset.browser_download_url || "").trim();
    if (!name || !downloadUrl) continue;
    if (assetRegex.test(name)) {
      return downloadUrl;
    }
  }

  return null;
}

async function fetchLatestApkFromGitHub(): Promise<string | null> {
  const owner = process.env.GITHUB_RELEASE_OWNER?.trim() || "kilby8";
  const repo = process.env.GITHUB_RELEASE_REPO?.trim() || "site_survey-app";
  const token = process.env.GITHUB_RELEASES_TOKEN?.trim();

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "site-survey-app-release-resolver",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    console.warn(`latest-apk: github latest release lookup failed with status ${response.status}`);
    return null;
  }

  const payload = (await response.json()) as GitHubLatestRelease;
  const apkUrl = pickApkAssetUrl(payload);

  if (!apkUrl) {
    console.warn("latest-apk: no APK asset found in latest GitHub release");
    return null;
  }

  return apkUrl;
}

export async function resolveLatestApkUrl(): Promise<string> {
  const configuredUrl = process.env.LATEST_APP_APK_URL?.trim();
  if (configuredUrl) return configuredUrl;

  const now = Date.now();
  if (cachedApk && cachedApk.expiresAt > now) {
    return cachedApk.url;
  }

  const fallbackUrl = buildGitHubLatestFallbackUrl();

  try {
    const gitHubApkUrl = await fetchLatestApkFromGitHub();
    const resolvedUrl = gitHubApkUrl || fallbackUrl;
    const cacheSeconds = parsePositiveInt(process.env.RELEASE_APK_CACHE_SECONDS, 300);

    cachedApk = {
      url: resolvedUrl,
      expiresAt: now + cacheSeconds * 1000,
    };

    return resolvedUrl;
  } catch (error) {
    console.warn("latest-apk: resolver error, using fallback", error);
    return fallbackUrl;
  }
}

