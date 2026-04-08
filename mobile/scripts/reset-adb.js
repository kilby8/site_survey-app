const { spawnSync } = require("child_process");
const path = require("path");

const isWindows = process.platform === "win32";
const homeDir = process.env.HOME || process.env.USERPROFILE || "";
const defaultAndroidHome = isWindows
  ? path.join(homeDir, "AppData", "Local", "Android", "Sdk")
  : path.join(homeDir, "android-sdk");

const androidHome = process.env.ANDROID_HOME || defaultAndroidHome;
const adbPath = path.join(androidHome, "platform-tools", isWindows ? "adb.exe" : "adb");

function run(command, args) {
  console.log(`> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: isWindows,
  });
  return result.status === 0;
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    shell: isWindows,
    encoding: "utf8",
  });
  return result.stdout ? result.stdout.trim() : "";
}

console.log("=== ADB Reset & Device Check ===\n");

console.log("Step 1: Killing ADB server...");
run(adbPath, ["kill-server"]);

console.log("\nStep 2: Starting ADB server...");
run(adbPath, ["start-server"]);

console.log("\nStep 3: Listing connected devices...");
const devices = runCapture(adbPath, ["devices", "-l"]);
console.log(devices);

const deviceLines = devices.split("\n").filter((line) => line.includes("\t"));
if (deviceLines.length === 0) {
  console.log("\n⚠ No devices found!");
  console.log("\nNext steps:");
  console.log("  1. Open Android Studio");
  console.log("  2. Go to Tools > Device Manager");
  console.log("  3. Start an emulator");
  console.log("  4. Wait for it to fully boot");
  console.log("  5. Run this script again");
  process.exit(1);
} else {
  console.log(`\n✓ Found ${deviceLines.length} device(s)`);
  
  deviceLines.forEach((line) => {
    const parts = line.trim().split(/\s+/);
    const deviceId = parts[0];
    const status = parts[1];
    
    if (status === "device") {
      console.log(`\n✓ ${deviceId} is ready`);
      
      // Check boot status
      const bootComplete = runCapture(adbPath, ["-s", deviceId, "shell", "getprop", "sys.boot_completed"]);
      if (bootComplete === "1") {
        console.log("  Boot: ✓ Complete");
      } else {
        console.log("  Boot: ⚠ Still booting...");
      }
      
      // Check API level
      const apiLevel = runCapture(adbPath, ["-s", deviceId, "shell", "getprop", "ro.build.version.sdk"]);
      if (apiLevel) {
        console.log(`  Android API: ${apiLevel}`);
      }
    } else {
      console.log(`\n⚠ ${deviceId} status: ${status} (not ready)`);
    }
  });
  
  console.log("\n=== Ready to run Expo ===");
  console.log("Run: npx expo run:android");
}
