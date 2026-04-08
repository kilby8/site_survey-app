# Android Development Troubleshooting

## Quick Start Scripts

### Run Everything (Recommended)
From the **root** directory:
```bash
npm run dev:android
```
This will:
1. Start Docker/Database
2. Start the Backend API
3. Launch the Android emulator and deploy the app

### Mobile-Only Commands
From the **mobile** directory:

```bash
# Diagnose your Android setup
npm run android:diagnose

# Auto-start emulator and run (handles ADB restart)
npm run android:emulator

# Safe Android run with tooling checks
npm run android

# Direct Expo run (no safety checks)
npm run android:unsafe

# Just check Android tooling
npm run android:check-tooling
```

## Common Issues & Solutions

### Issue: "No Android connected device found"

**Cause**: ADB server is out of sync with the emulator, or emulator isn't fully booted.

**Solution 1** - Use the automated script:
```bash
cd mobile
npm run android:emulator
```

**Solution 2** - Manual fix:
```bash
# Kill and restart ADB
adb kill-server
adb start-server

# Check devices
adb devices

# If no devices, start emulator from Android Studio:
# Tools > Device Manager > Play button on an AVD

# Wait for "device" status (not "offline")
adb devices

# Then run
npx expo run:android
```

### Issue: "No AVDs found"

**Solution**: Create an emulator in Android Studio:
1. Open Android Studio
2. Tools > Device Manager
3. Create Device
4. Choose a device definition (e.g., Pixel 5)
5. Download a system image (e.g., Android 13)
6. Finish setup

### Issue: Backend not reachable from emulator

**Check 1** - Backend is running:
```bash
curl http://localhost:3001/api/health
```

**Check 2** - Use host IP (not localhost) in mobile config:
```bash
# Find your machine's IP
ipconfig  # Windows
ifconfig  # Mac/Linux

# Update mobile/.env or mobile/services/client.ts
# Use: http://192.168.x.x:3001 (your actual IP)
```

**Check 3** - Docker is running:
```bash
docker ps
# Should show postgres container
```

### Issue: Emulator starts but then disconnects

This can happen on Windows with Hyper-V conflicts or antivirus interference.

**Solution**:
```bash
# Try starting with -no-snapshot-load
cd %ANDROID_HOME%\emulator
emulator -avd Pixel_5_API_33 -no-snapshot-load
```

Or use Android Studio to cold boot the device:
- Device Manager > dropdown next to Play > Cold Boot Now

## Environment Variables

Make sure these are set (usually automatic with Android Studio):

```bash
# Windows
ANDROID_HOME=C:\Users\<YourUser>\AppData\Local\Android\Sdk

# Mac/Linux
ANDROID_HOME=~/Library/Android/sdk  # or ~/android-sdk
```

Add to PATH:
- `%ANDROID_HOME%\platform-tools` (for adb)
- `%ANDROID_HOME%\emulator` (for emulator)

## Diagnostic Output

Run this anytime to check your Android setup:
```bash
cd mobile
npm run android:diagnose
```

It will check:
- ✓ Android SDK paths
- ✓ ADB availability and connected devices
- ✓ Emulator binary and available AVDs
- ✓ Java version
- ✓ Gradle wrapper

## Architecture

**Scripts in mobile/scripts:**
- `diagnose-android.js` - Full environment diagnostic
- `check-android-tooling.js` - Pre-flight checks for SDK/ADB/sdkmanager
- `run-android-safe.js` - Runs tooling checks, then `expo run:android`
- `start-emulator-and-run.js` - **New**: Restarts ADB, waits for emulator, runs Expo

**Root script:**
- `scripts/start-full-stack.js` - Starts Docker → Backend → Android in sequence

## Tips

1. **Always check `adb devices` first** before running Expo
2. **Wait for boot_completed**: Emulator shows as "device" not "offline"
3. **Use the LAN IP** (192.168.x.x) for API calls from emulator, not localhost
4. **Keep emulator running** between builds to save time
5. **Cold boot** if emulator is flaky (Android Studio > Device Manager)

## Need Help?

If you're still stuck:
1. Run `npm run android:diagnose` and share the output
2. Check `adb devices` output
3. Verify Docker is running: `docker ps`
4. Test backend from host: `curl http://localhost:3001/api/health`
