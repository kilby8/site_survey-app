# Android Emulator Quick Start
# PowerShell script for Windows users

Write-Host "=== Android Emulator Quick Start ===" -ForegroundColor Cyan
Write-Host ""

# Check if ANDROID_HOME is set
if (-not $env:ANDROID_HOME) {
    $defaultPath = "$env:USERPROFILE\AppData\Local\Android\Sdk"
    if (Test-Path $defaultPath) {
        $env:ANDROID_HOME = $defaultPath
        Write-Host "✓ Using ANDROID_HOME: $defaultPath" -ForegroundColor Green
    } else {
        Write-Host "✗ ANDROID_HOME not set and default path not found" -ForegroundColor Red
        Write-Host "  Install Android Studio or set ANDROID_HOME manually" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "✓ ANDROID_HOME: $env:ANDROID_HOME" -ForegroundColor Green
}

$adb = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
$emulator = Join-Path $env:ANDROID_HOME "emulator\emulator.exe"

# Step 1: Reset ADB
Write-Host ""
Write-Host "Step 1: Resetting ADB..." -ForegroundColor Cyan
& $adb kill-server
Start-Sleep -Seconds 1
& $adb start-server
Start-Sleep -Seconds 2

# Step 2: Check devices
Write-Host ""
Write-Host "Step 2: Checking devices..." -ForegroundColor Cyan
$devicesOutput = & $adb devices
Write-Host $devicesOutput

$deviceLines = $devicesOutput -split "`n" | Where-Object { $_ -match "\tdevice" }

if ($deviceLines.Count -eq 0) {
    Write-Host ""
    Write-Host "⚠ No devices found. Starting emulator..." -ForegroundColor Yellow
    
    # List AVDs
    $avds = & $emulator -list-avds
    $avdArray = $avds -split "`n" | Where-Object { $_.Trim() -ne "" }
    
    if ($avdArray.Count -eq 0) {
        Write-Host "✗ No AVDs found!" -ForegroundColor Red
        Write-Host "  Create one in Android Studio: Tools > Device Manager > Create Device" -ForegroundColor Yellow
        exit 1
    }
    
    $targetAvd = $avdArray[0]
    Write-Host "Starting AVD: $targetAvd" -ForegroundColor Cyan
    
    # Start emulator in background
    Start-Process -FilePath $emulator -ArgumentList @("-avd", $targetAvd, "-no-snapshot-load") -WindowStyle Minimized
    
    Write-Host "Waiting for emulator to boot (this may take 60-120 seconds)..." -ForegroundColor Yellow
    
    # Wait for device
    $maxWait = 120
    $waited = 0
    $found = $false
    
    while ($waited -lt $maxWait) {
        Start-Sleep -Seconds 5
        $waited += 5
        
        $currentDevices = & $adb devices
        $deviceLines = $currentDevices -split "`n" | Where-Object { $_ -match "\tdevice" }
        
        if ($deviceLines.Count -gt 0) {
            $deviceId = ($deviceLines[0] -split "\t")[0]
            
            # Check boot completed
            $bootComplete = & $adb -s $deviceId shell getprop sys.boot_completed
            if ($bootComplete -eq "1") {
                Write-Host ""
                Write-Host "✓ Emulator ready: $deviceId" -ForegroundColor Green
                $found = $true
                break
            }
        }
        
        Write-Host "." -NoNewline
    }
    
    if (-not $found) {
        Write-Host ""
        Write-Host "✗ Timeout waiting for emulator" -ForegroundColor Red
        exit 1
    }
} else {
    $deviceId = ($deviceLines[0] -split "\t")[0]
    Write-Host "✓ Device ready: $deviceId" -ForegroundColor Green
}

# Step 3: Run Expo
Write-Host ""
Write-Host "Step 3: Running Expo..." -ForegroundColor Cyan
Write-Host ""

Set-Location (Join-Path $PSScriptRoot "..")
npx expo run:android --device $deviceId
