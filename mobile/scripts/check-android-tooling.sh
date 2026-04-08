#!/bin/sh
set -eu

ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

export ANDROID_HOME ANDROID_SDK_ROOT PATH

echo "ANDROID_HOME=$ANDROID_HOME"
echo "ANDROID_SDK_ROOT=$ANDROID_SDK_ROOT"

if [ -f /etc/alpine-release ]; then
  echo "Detected Alpine Linux (musl)."
  echo "Note: Android adb binaries are typically glibc-linked and may fail here."
fi

if [ ! -x "$ANDROID_HOME/platform-tools/adb" ]; then
  echo "adb binary not found at $ANDROID_HOME/platform-tools/adb"
  echo "Install platform-tools under ANDROID_HOME or use a host machine with Android Studio SDK."
  exit 1
fi

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "sdkmanager not found at $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
  echo "Install Android command-line tools under ANDROID_HOME/cmdline-tools/latest."
  exit 1
fi

echo "Checking adb..."
if "$ANDROID_HOME/platform-tools/adb" version; then
  echo "adb OK"
else
  echo "adb failed. This is commonly a libc mismatch in Alpine containers (glibc binary on musl)."
  echo "Use one of these alternatives:"
  echo "  1) Run npm run android on a glibc host with Android SDK"
  echo "  2) Run npm run android:eas for cloud build"
  exit 2
fi

echo "Checking sdkmanager..."
if "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --version; then
  echo "sdkmanager OK"
else
  echo "sdkmanager failed. Java runtime may be missing or incompatible."
  echo "Install Java on your build host and retry."
  exit 3
fi

echo "Android tooling looks good."
