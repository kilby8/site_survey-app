const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const isWindows = process.platform === "win32";
const homeDir = process.env.HOME || process.env.USERPROFILE || "";
const defaultAndroidHome = isWindows
  ? path.join(homeDir, "AppData", "Local", "Android", "Sdk")
  : path.join(homeDir, "android-sdk");

const androidHome = process.env.ANDROID_HOME || defaultAndroidHome;
const androidSdkRoot = process.env.ANDROID_SDK_ROOT || androidHome;

function findExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function runCommand(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: isWindows });
  return result.status === 0;
}

function findSdkManager() {
  const executableName = isWindows ? "sdkmanager.bat" : "sdkmanager";
  const directCandidates = [
    path.join(androidHome, "cmdline-tools", "latest", "bin", executableName),
    path.join(androidHome, "tools", "bin", executableName),
  ];

  const cmdlineToolsRoot = path.join(androidHome, "cmdline-tools");
  if (fs.existsSync(cmdlineToolsRoot)) {
    const nestedCandidates = fs
      .readdirSync(cmdlineToolsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(cmdlineToolsRoot, entry.name, "bin", executableName));

    directCandidates.push(...nestedCandidates);
  }

  return findExistingPath(directCandidates);
}

const adbPath =
  findExistingPath([path.join(androidHome, "platform-tools", isWindows ? "adb.exe" : "adb")]) ||
  "adb";
const sdkmanagerPath = findSdkManager() || (isWindows ? "sdkmanager.bat" : "sdkmanager");

process.env.ANDROID_HOME = androidHome;
process.env.ANDROID_SDK_ROOT = androidSdkRoot;

console.log(`ANDROID_HOME=${androidHome}`);
console.log(`ANDROID_SDK_ROOT=${androidSdkRoot}`);

if (!fs.existsSync(path.join(androidHome, "platform-tools")) && adbPath !== "adb") {
  console.error(`adb directory not found under ${path.join(androidHome, "platform-tools")}`);
  process.exit(1);
}

console.log("Checking adb...");
if (!runCommand(adbPath, ["version"])) {
  console.error("adb failed. Install Android platform-tools or ensure adb is on PATH.");
  process.exit(2);
}

console.log("Checking sdkmanager...");
if (!runCommand(sdkmanagerPath, ["--version"])) {
  console.warn(
    "sdkmanager is unavailable. Continuing because local Android builds can still work if the SDK, Gradle, and a device or emulator are already configured."
  );
  console.warn(
    "If the Android build fails later, install Android command-line tools and Java, or ensure sdkmanager is on PATH."
  );
  process.exit(0);
}

console.log("Android tooling looks good.");