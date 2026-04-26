#!/usr/bin/env node
/**
 * postinstall.js
 * Patches @react-native-voice/voice build.gradle for React Native 0.73+ / AGP 8
 * Runs after npm ci via "postinstall" in package.json
 */
const fs = require('fs');
const path = require('path');

const buildGradle = path.join(
  __dirname,
  'node_modules/@react-native-voice/voice/android/build.gradle'
);

if (!fs.existsSync(buildGradle)) {
  console.log('[postinstall] voice build.gradle not found, skipping patch');
  process.exit(0);
}

let src = fs.readFileSync(buildGradle, 'utf8');
let changed = false;

const replacements = [
  ['jcenter()', 'mavenCentral()'],
  ['def DEFAULT_COMPILE_SDK_VERSION = 28', 'def DEFAULT_COMPILE_SDK_VERSION = 34'],
  ['def DEFAULT_BUILD_TOOLS_VERSION = "28.0.3"', 'def DEFAULT_BUILD_TOOLS_VERSION = "34.0.0"'],
  ['def DEFAULT_TARGET_SDK_VERSION = 28', 'def DEFAULT_TARGET_SDK_VERSION = 34'],
  ['def DEFAULT_SUPPORT_LIB_VERSION = "28.0.0"', 'def DEFAULT_SUPPORT_LIB_VERSION = "34.0.0"'],
  ['minSdkVersion 15', 'minSdkVersion 24'],
];

for (const [from, to] of replacements) {
  if (src.includes(from)) { src = src.split(from).join(to); changed = true; }
}

// Add namespace if missing (required for AGP 8+)
if (!src.includes('namespace') && src.includes('android {')) {
  src = src.replace('android {', "android {\n    namespace 'com.wenkesj.voice'");
  changed = true;
}

if (changed) {
  fs.writeFileSync(buildGradle, src);
  console.log('[postinstall] Patched @react-native-voice/voice build.gradle');
} else {
  console.log('[postinstall] voice build.gradle already patched, nothing to do');
}