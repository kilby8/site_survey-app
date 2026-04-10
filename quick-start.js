#!/usr/bin/env node
/**
 * quick-start.js
 * 
 * Start backend + emulator + app in sequence
 */

const { spawnSync, spawn } = require("child_process");
const path = require("path");

const rootDir = path.join(__dirname);

console.log("=== Site Survey Quick Start ===\n");

// Step 1: Ensure Docker DB is running
console.log("Step 1: Starting Docker database...");
const dockerResult = spawnSync("docker", ["compose", "up", "-d", "db"], {
  cwd: rootDir,
  stdio: "inherit",
});

if (dockerResult.status !== 0) {
  console.error("Docker failed. Ensure Docker Desktop is running.");
  process.exit(1);
}

// Step 2: Start backend (don't wait)
console.log("\nStep 2: Starting backend in background...");
const backendProcess = spawn("npm", ["run", "dev"], {
  cwd: path.join(rootDir, "backend"),
  stdio: "pipe",
  shell: true,
});

// Log backend output
backendProcess.stdout?.on("data", (data) => {
  const output = data.toString();
  if (output.includes("running on") || output.includes("error") || output.includes("Error")) {
    console.log("[Backend]", output.trim());
  }
});

backendProcess.stderr?.on("data", (data) => {
  console.error("[Backend Error]", data.toString());
});

// Wait a bit for backend to start
console.log("Waiting for backend to start (10s)...");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  await sleep(10000);

  // Step 3: Run mobile app
  console.log("\nStep 3: Launching Android emulator + app...");
  console.log("Press Ctrl+C in the emulator/Expo window to stop.\n");

  const mobileProcess = spawn("npm", ["run", "android:emulator"], {
    cwd: path.join(rootDir, "mobile"),
    stdio: "inherit",
    shell: true,
  });

  mobileProcess.on("exit", (code) => {
    console.log(`\nMobile process exited with code ${code}`);
    backendProcess.kill();
    process.exit(code || 0);
  });

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    mobileProcess.kill();
    backendProcess.kill();
    process.exit(0);
  });
})();
