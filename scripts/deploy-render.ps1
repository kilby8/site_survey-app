#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Trigger a Render deploy for the site-survey-api service via the Render REST API.

.DESCRIPTION
  Reads RENDER_API_KEY and RENDER_SERVICE_ID from the repo-root .env file (or
  from environment variables already set in the shell).  Then calls:
    POST https://api.render.com/v1/services/{serviceId}/deploys
  and polls the deploy status until it succeeds or fails.

.EXAMPLE
  # From repo root:
  pwsh scripts/deploy-render.ps1

.NOTES
  Required .env entries (repo root):
    RENDER_API_KEY=rnd_xxxxxxxxxxxx
    RENDER_SERVICE_ID=srv-xxxxxxxxxxxx

  To obtain your API key: https://dashboard.render.com/u/settings#api-keys
  To obtain your service ID: open the service on dashboard.render.com and copy
  the ID from the URL (e.g. https://dashboard.render.com/web/srv-xxxx -> srv-xxxx).
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Load .env from repo root
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $repoRoot ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+?)\s*=\s*(.*)$') {
      $name  = $Matches[1].Trim()
      $value = $Matches[2].Trim().Trim('"').Trim("'")
      if (-not [System.Environment]::GetEnvironmentVariable($name)) {
        [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
      }
    }
  }
}

# Validate required vars
$API_KEY    = $env:RENDER_API_KEY
$SERVICE_ID = $env:RENDER_SERVICE_ID

if (-not $API_KEY) {
  Write-Error @"
RENDER_API_KEY is not set.
Add it to your repo-root .env file:
  RENDER_API_KEY=rnd_xxxxxxxxxxxx

Get your key at: https://dashboard.render.com/u/settings#api-keys
"@
  exit 1
}

if (-not $SERVICE_ID) {
  Write-Error @"
RENDER_SERVICE_ID is not set.
Add it to your repo-root .env file:
  RENDER_SERVICE_ID=srv-xxxxxxxxxxxx

Find your service ID in the Render dashboard URL for site-survey-api.
"@
  exit 1
}

$headers = @{
  "Authorization" = "Bearer $API_KEY"
  "Accept"        = "application/json"
  "Content-Type"  = "application/json"
}

# Trigger deploy
Write-Host "`nTriggering Render deploy for service $SERVICE_ID ..." -ForegroundColor Cyan

$deployResp = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api.render.com/v1/services/$SERVICE_ID/deploys" `
  -Headers $headers `
  -Body '{}' `
  -ContentType "application/json"

$deployId  = $deployResp.id
$deployUrl = "https://dashboard.render.com/web/$SERVICE_ID/deploys/$deployId"

Write-Host "Deploy triggered: $deployId" -ForegroundColor Green
Write-Host "    Dashboard: $deployUrl`n"

# Poll status
$terminalStates = @("live", "deactivated", "failed", "canceled", "build_failed", "pre_deploy_failed", "update_failed")
$pollInterval   = 10   # seconds
$maxWait        = 600  # 10 minutes

$elapsed = 0
Write-Host "Polling deploy status (checks every ${pollInterval}s, timeout ${maxWait}s)..." -ForegroundColor Yellow

while ($elapsed -lt $maxWait) {
  Start-Sleep -Seconds $pollInterval
  $elapsed += $pollInterval

  try {
    $statusResp = Invoke-RestMethod `
      -Method Get `
      -Uri "https://api.render.com/v1/services/$SERVICE_ID/deploys/$deployId" `
      -Headers $headers

    $status = $statusResp.status
    Write-Host "   [$($elapsed)s] status: $status"

    if ($terminalStates -contains $status) {
      if ($status -eq "live") {
        Write-Host "`nDeploy succeeded - service is LIVE!" -ForegroundColor Green
        exit 0
      } else {
        Write-Error "`nDeploy ended with status: $status`nCheck logs: $deployUrl"
        exit 1
      }
    }
  } catch {
    Write-Host "   [$($elapsed)s] poll error: $_"
  }
}

Write-Host "`nTimed out after ${maxWait}s - check manually: $deployUrl" -ForegroundColor Yellow
exit 1

