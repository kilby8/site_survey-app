const { spawnSync, spawn } = require("child_process");
const path = require("path");

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

function runSync(command, args, options = {}) {
  console.log(`> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: isWindows,
    ...options,
  });
  return result.status === 0;
}

function runSyncCapture(command, args) {
  const result = spawnSync(command, args, {
    shell: isWindows,
    encoding: "utf8",
  });
  return result.stdout ? result.stdout.trim() : "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevice(maxWaitSeconds = 60) {
  console.log(`\nWaiting for device to be ready (max ${maxWaitSeconds}s)...`);
  const startTime = Date.now();

  while ((Date.now() - startTime) / 1000 < maxWaitSeconds) {
    const devices = runSyncCapture(adbPath, ["devices"]);
    const lines = devices.split("\n").filter((line) => line.trim() && !line.includes("List of devices"));
    
    for (const line of lines) {
      if (line.includes("\tdevice")) {
        const deviceId = line.split("\t")[0];
        console.log(`✓ Device ready: ${deviceId}`);
        
        // Additional check: wait for boot to complete
        console.log("Checking boot status...");
        const bootComplete = runSyncCapture(adbPath, ["-s", deviceId, "shell", "getprop", "sys.boot_completed"]);
        if (bootComplete === "1") {
          console.log("✓ Boot completed");
          return deviceId;
        }
      }
    }
    
    process.stdout.write(".");
    await sleep(2000);
  }

  console.log("\n✗ Timeout waiting for device");
  return null;
}

async function main() {
  console.log("=== Android Emulator Setup & Run ===\n");

  // Step 1: Kill and restart ADB server
  console.log("Step 1: Restarting ADB server...");
  runSync(adbPath, ["kill-server"]);
  await sleep(1000);
  runSync(adbPath, ["start-server"]);
  await sleep(2000);

  // Step 2: Check for existing devices
  console.log("\nStep 2: Checking for connected devices...");
  const devicesOutput = runSyncCapture(adbPath, ["devices"]);
  console.log(devicesOutput);

  const deviceLines = devicesOutput
    .split("\n")
    .filter((line) => line.trim() && !line.includes("List of devices"));

  let deviceId = null;

  if (deviceLines.length > 0) {
    for (const line of deviceLines) {
      if (line.includes("\tdevice")) {
        deviceId = line.split("\t")[0];
        console.log(`✓ Found existing device: ${deviceId}`);
        break;
      }
    }
  }

  // Step 3: If no device, try to start emulator
  if (!deviceId) {
    console.log("\nStep 3: No device found, listing available emulators...");
    const avds = runSyncCapture(emulatorPath, ["-list-avds"]);
    console.log(avds || "(none)");

    const avdList = avds.split("\n").filter((line) => line.trim());
    if (avdList.length === 0) {
      console.error("\n✗ No AVDs found. Create one in Android Studio (Tools > Device Manager).");
      process.exit(1);
    }

    const targetAvd = avdList[0];
    console.log(`\nStarting emulator: ${targetAvd}...`);
    console.log("(This will run in the background. Keep this window open.)\n");

    // Start emulator in background
    const emulatorProcess = spawn(emulatorPath, ["-avd", targetAvd, "-no-snapshot-load"], {
      detached: true,
      stdio: "ignore",
      shell: isWindows,
    });
    emulatorProcess.unref();

    // Wait for it to appear in adb devices
    deviceId = await waitForDevice(120);
    if (!deviceId) {
      console.error("\n✗ Emulator failed to start or connect within timeout.");
      process.exit(1);
    }
  } else {
    // Device exists, verify it's fully booted
    console.log("\nVerifying device is fully booted...");
    const bootComplete = runSyncCapture(adbPath, ["-s", deviceId, "shell", "getprop", "sys.boot_completed"]);
    if (bootComplete !== "1") {
      console.log("Device not fully booted, waiting...");
      deviceId = await waitForDevice(60);
      if (!deviceId) {
        console.error("\n✗ Device failed to boot completely.");
        process.exit(1);
      }
    } else {
      console.log("✓ Device is ready");
    }
  }

  // Step 4: Run expo with explicit device (or fallback)
  console.log(`\n=== Running Expo on ${deviceId} ===\n`);
  const expoArgs = deviceId ? ["expo", "run:android", "--device", deviceId] : ["expo", "run:android"];
  const expoResult = spawnSync("npx", expoArgs, {
    stdio: "inherit",
    shell: isWindows,
    env: process.env,
  });

  if (expoResult.status !== 0 && deviceId) {
    console.log("\n⚠️  Device flag failed, retrying without it...");
    const expoRetry = spawnSync("npx", ["expo", "run:android"], {
      stdio: "inherit",
      shell: isWindows,
      env: process.env,
    });
    process.exit(expoRetry.status || 0);
  }

  process.exit(expoResult.status || 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
