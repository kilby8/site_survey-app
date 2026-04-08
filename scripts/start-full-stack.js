const { spawnSync, spawn } = require("child_process");
const path = require("path");

const isWindows = process.platform === "win32";

function runCommand(command, args, cwd, label) {
  console.log(`\n[${label}] Running: ${command} ${args.join(" ")}`);
  console.log(`[${label}] Working directory: ${cwd}`);
  
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: isWindows,
  });
  
  if (result.status !== 0) {
    console.error(`[${label}] Failed with exit code ${result.status}`);
    return false;
  }
  
  console.log(`[${label}] ✓ Success`);
  return true;
}

function startBackground(command, args, cwd, label) {
  console.log(`\n[${label}] Starting in background: ${command} ${args.join(" ")}`);
  console.log(`[${label}] Working directory: ${cwd}`);
  
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    shell: isWindows,
    detached: false,
  });
  
  child.on("error", (err) => {
    console.error(`[${label}] Error:`, err);
  });
  
  return child;
}

async function main() {
  console.log("=== Site Survey Full Stack Startup ===\n");
  
  const rootDir = path.join(__dirname, "..");
  const backendDir = path.join(rootDir, "backend");
  const mobileDir = path.join(rootDir, "mobile");
  
  // Step 1: Start Docker (DB)
  console.log("\n=== STEP 1: Starting Docker/Database ===");
  if (!runCommand("docker", ["compose", "up", "-d"], rootDir, "Docker")) {
    console.error("\n✗ Docker failed. Ensure Docker Desktop is running.");
    process.exit(1);
  }
  
  // Wait for DB to be ready
  console.log("\nWaiting for database to be ready...");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  
  // Step 2: Start Backend
  console.log("\n=== STEP 2: Starting Backend ===");
  console.log("Backend will run in the background. Check http://localhost:3001/api/health\n");
  
  const backendProcess = startBackground("npm", ["run", "dev"], backendDir, "Backend");
  
  // Wait for backend to start
  console.log("\nWaiting for backend to start...");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  
  // Step 3: Run Android
  console.log("\n=== STEP 3: Starting Android Emulator & App ===");
  const androidProcess = spawn("npm", ["run", "android:emulator"], {
    cwd: mobileDir,
    stdio: "inherit",
    shell: isWindows,
  });
  
  // Handle cleanup on exit
  const cleanup = () => {
    console.log("\n\nShutting down...");
    if (backendProcess && !backendProcess.killed) {
      console.log("Stopping backend...");
      backendProcess.kill();
    }
    if (androidProcess && !androidProcess.killed) {
      console.log("Stopping Android...");
      androidProcess.kill();
    }
    console.log("Note: Docker containers are still running. Stop with: docker compose down");
    process.exit(0);
  };
  
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  
  androidProcess.on("exit", (code) => {
    console.log(`\nAndroid process exited with code ${code}`);
    cleanup();
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
