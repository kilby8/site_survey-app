const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const isWindows = process.platform === "win32";
const homeDir = process.env.HOME || process.env.USERPROFILE || "";
const defaultAndroidHome = isWindows
  ? path.join(homeDir, "AppData", "Local", "Android", "Sdk")
  : path.join(homeDir, "android-sdk");

const androidHome = process.env.ANDROID_HOME || defaultAndroidHome;
const adbExe = isWindows ? "adb.exe" : "adb";
const emulatorExe = isWindows ? "emulator.exe" : "emulator";
const adbPath = path.join(androidHome, "platform-tools", adbExe);
const emulatorPath = path.join(androidHome, "emulator", emulatorExe);

function runSyncCapture(command, args) {
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

console.log("=== Android Development Environment Diagnostic ===\n");

console.log("Environment:");
console.log(`  Platform: ${process.platform}`);
console.log(`  ANDROID_HOME: ${androidHome}`);
console.log(`  ANDROID_SDK_ROOT: ${process.env.ANDROID_SDK_ROOT || "(not set)"}`);
console.log();

console.log("SDK Structure:");
console.log(`  platform-tools: ${fs.existsSync(path.join(androidHome, "platform-tools")) ? "✓" : "✗"}`);
console.log(`  emulator: ${fs.existsSync(path.join(androidHome, "emulator")) ? "✓" : "✗"}`);
console.log(`  build-tools: ${fs.existsSync(path.join(androidHome, "build-tools")) ? "✓" : "✗"}`);
console.log();

console.log("ADB:");
console.log(`  Path: ${adbPath}`);
console.log(`  Exists: ${fs.existsSync(adbPath) ? "✓" : "✗"}`);
if (fs.existsSync(adbPath)) {
  const version = runSyncCapture(adbPath, ["version"]);
  if (version.success) {
    console.log(`  Version: ${version.stdout.split("\n")[0]}`);
  } else {
    console.log(`  Version check failed: ${version.stderr}`);
  }
  
  const devices = runSyncCapture(adbPath, ["devices", "-l"]);
  console.log(`  Devices:\n${devices.stdout || "(none)"}`);
}
console.log();

console.log("Emulator:");
console.log(`  Path: ${emulatorPath}`);
console.log(`  Exists: ${fs.existsSync(emulatorPath) ? "✓" : "✗"}`);
if (fs.existsSync(emulatorPath)) {
  const version = runSyncCapture(emulatorPath, ["-version"]);
  if (version.success) {
    console.log(`  Version: ${version.stdout.split("\n")[0]}`);
  }
  
  const avds = runSyncCapture(emulatorPath, ["-list-avds"]);
  if (avds.success && avds.stdout) {
    console.log(`  Available AVDs:`);
    avds.stdout.split("\n").forEach((avd) => {
      if (avd.trim()) console.log(`    - ${avd.trim()}`);
    });
  } else {
    console.log(`  Available AVDs: (none)`);
  }
}
console.log();

console.log("Java:");
const java = runSyncCapture("java", ["-version"]);
if (java.success || java.stderr.includes("version")) {
  const javaVersion = java.stderr.split("\n")[0] || java.stdout.split("\n")[0];
  console.log(`  ✓ ${javaVersion}`);
} else {
  console.log(`  ✗ Java not found in PATH`);
}
console.log();

console.log("Gradle (from project):");
const gradlewPath = path.join(__dirname, "..", "android", isWindows ? "gradlew.bat" : "gradlew");
if (fs.existsSync(gradlewPath)) {
  console.log(`  ✓ Gradle wrapper found`);
  const gradleVersion = runSyncCapture(gradlewPath, ["-v"]);
  if (gradleVersion.success) {
    const versionLine = gradleVersion.stdout.split("\n").find((line) => line.includes("Gradle"));
    if (versionLine) console.log(`  ${versionLine.trim()}`);
  }
} else {
  console.log(`  ✗ Gradle wrapper not found (run: npx expo prebuild --platform android)`);
}
console.log();

console.log("=== Diagnostic Complete ===");
console.log("\nQuick fixes:");
console.log("  • If no devices: Start Android Studio > Device Manager > Start an emulator");
console.log("  • If ADB issues: adb kill-server && adb start-server");
console.log("  • If no AVDs: Create one in Android Studio > Device Manager > Create Device");
console.log("  • Run mobile build: cd mobile && npm run android:emulator");
