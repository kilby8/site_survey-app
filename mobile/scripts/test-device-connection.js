const { spawnSync } = require("child_process");
const path = require("path");

const isWindows = process.platform === "win32";
const homeDir = process.env.HOME || process.env.USERPROFILE || "";
const defaultAndroidHome = isWindows
  ? path.join(homeDir, "AppData", "Local", "Android", "Sdk")
  : path.join(homeDir, "android-sdk");

const androidHome = process.env.ANDROID_HOME || defaultAndroidHome;
const adbPath = path.join(androidHome, "platform-tools", isWindows ? "adb.exe" : "adb");

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    shell: isWindows,
    encoding: "utf8",
  });
  return {
    success: result.status === 0,
    stdout: result.stdout ? result.stdout.trim() : "",
    stderr: result.stderr ? result.stderr.trim() : "",
  };
}

console.log("=== Quick Device Connectivity Test ===\n");

const devices = runCapture(adbPath, ["devices", "-l"]);

if (!devices.success) {
  console.error("✗ ADB failed to run");
  console.error(devices.stderr);
  process.exit(1);
}

console.log(devices.stdout);
console.log();

const deviceLines = devices.stdout
  .split("\n")
  .filter((line) => line.trim() && !line.includes("List of devices"));

if (deviceLines.length === 0) {
  console.log("❌ No devices connected\n");
  console.log("Next steps:");
  console.log("  1. Start an emulator from Android Studio (Tools > Device Manager)");
  console.log("  2. Or run: npm run android:emulator (auto-starts emulator)");
  console.log("  3. Or run: npm run android:reset-adb (reset ADB connection)");
  process.exit(1);
}

let allReady = true;

deviceLines.forEach((line) => {
  const parts = line.trim().split(/\s+/);
  const deviceId = parts[0];
  const status = parts[1];

  console.log(`Device: ${deviceId}`);
  console.log(`  Status: ${status}`);

  if (status !== "device") {
    console.log(`  ❌ Not ready (status: ${status})`);
    allReady = false;
    return;
  }

  // Check boot status
  const bootComplete = runCapture(adbPath, ["-s", deviceId, "shell", "getprop", "sys.boot_completed"]);
  if (bootComplete.stdout === "1") {
    console.log("  ✅ Boot: Complete");
  } else {
    console.log("  ⚠️  Boot: Still booting...");
    allReady = false;
  }

  // Check API level
  const apiLevel = runCapture(adbPath, ["-s", deviceId, "shell", "getprop", "ro.build.version.sdk"]);
  if (apiLevel.success && apiLevel.stdout) {
    console.log(`  Android API: ${apiLevel.stdout}`);
  }

  // Check model
  const model = runCapture(adbPath, ["-s", deviceId, "shell", "getprop", "ro.product.model"]);
  if (model.success && model.stdout) {
    console.log(`  Model: ${model.stdout}`);
  }

  console.log();
});

if (allReady) {
  console.log("✅ All devices are ready for development!");
  console.log("\nRun: npx expo run:android");
  process.exit(0);
} else {
  console.log("⚠️  Some devices are not fully ready");
  console.log("\nWait a moment and run this test again, or try:");
  console.log("  npm run android:reset-adb");
  process.exit(1);
}
