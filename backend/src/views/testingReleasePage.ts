function escapeHtml(value: string): string {
  return String(value)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#39;");
}

export function buildTestingReleasePage(params?: {
  apkUrl?: string;
  releasePageUrl?: string;
  versionLabel?: string;
  updatedAt?: string;
  directLinkConfigured?: boolean;
}): string {
  const apkUrl = params?.apkUrl?.trim() || "https://github.com/kilby8/site_survey-app/releases/latest";
  const releasePageUrl = params?.releasePageUrl?.trim() || "https://github.com/kilby8/site_survey-app/releases/latest";
  const versionLabel = params?.versionLabel?.trim() || "Latest testing build";
  const updatedAt = params?.updatedAt?.trim() || new Date().toISOString();
  const directLinkConfigured = Boolean(params?.directLinkConfigured);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Site Survey App • Testing Release</title>
    <style>
      :root{--bg:#070b14;--card:#101a2e;--line:rgba(148,163,184,.22);--text:#e2e8f0;--muted:#94a3b8;--primary:#f39c12;--secondary:#22d3ee}
      *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 15% -10%, rgba(243,156,18,.22), transparent 44%),radial-gradient(circle at 88% 2%, rgba(34,211,238,.16), transparent 36%),linear-gradient(180deg,#070b14 0%,#0f172a 100%);color:var(--text)}
      .card{width:min(820px,100%);padding:32px 22px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(180deg,rgba(16,26,46,.95),rgba(16,26,46,.82));box-shadow:0 20px 44px rgba(2,6,23,.55),0 0 0 1px rgba(243,156,18,.12)}
      .badge{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;border:1px solid rgba(243,156,18,.4);background:rgba(243,156,18,.15);color:#f8c471;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}.dot{width:8px;height:8px;border-radius:999px;background:var(--secondary);box-shadow:0 0 0 6px rgba(34,211,238,.14)}
      h1{margin:14px 0 10px;font-size:clamp(1.9rem,3.5vw,2.8rem);line-height:1.1}p{margin:0;max-width:60ch;line-height:1.55;color:var(--muted);font-size:1.03rem}
      .btn-row{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:12px 20px;border-radius:10px;font-weight:800;font-size:1rem;text-decoration:none;transition:transform .18s ease,filter .18s ease}.btn:hover{transform:translateY(-1px);filter:brightness(1.05)}.primary{background:linear-gradient(90deg,var(--primary),#d68910);color:#1f2937}.secondary{background:rgba(15,23,42,.62);border:1px solid rgba(34,211,238,.38);color:#bae6fd}
      .note{margin-top:18px;padding:14px 16px;border-radius:14px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.56);color:#cbd5e1;font-size:.95rem;text-align:left}.url{word-break:break-all;color:#93c5fd}.meta{margin-top:18px;font-size:12px;color:#7c8da8}@media (max-width:560px){.card{padding:28px 18px}.btn-row{flex-direction:column}.btn{width:100%}}
    </style>
  </head>
  <body>
    <main class="card">
      <div class="badge"><span class="dot" aria-hidden="true"></span>Testing Release</div>
      <h1>Site Survey App APK Download</h1>
      <p>Use this page to grab the latest Android APK for QA, beta checks, and field testing before the next mobile update ships.</p>
      <div class="btn-row">
        <a class="btn primary" href="${escapeHtml(apkUrl)}" rel="noopener noreferrer">Download Latest APK</a>
        <a class="btn secondary" href="${escapeHtml(releasePageUrl)}" target="_blank" rel="noopener noreferrer">Open GitHub Releases</a>
      </div>
      <div class="note">
        <div><strong>Version:</strong> ${escapeHtml(versionLabel)}</div>
        <div><strong>Updated:</strong> ${escapeHtml(updatedAt)}</div>
        <div style="margin-top:8px;"><strong>Direct APK URL:</strong> <span class="url">${escapeHtml(apkUrl)}</span></div>
        ${directLinkConfigured ? "" : "<div style=\"margin-top:8px;\">No fixed APK URL is set. The backend will auto-resolve the latest GitHub release APK when available, otherwise it falls back to the releases page. Set <code>LATEST_APP_APK_URL</code> for a deterministic direct APK link.</div>"}
      </div>
      <div class="meta">Built for mobile testing · Hosted by the Site Survey app backend</div>
    </main>
  </body>
</html>`;
}
