#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

echo "Running Android tooling checks..."
if ! sh "$SCRIPT_DIR/check-android-tooling.sh"; then
  echo
  echo "Android tooling checks failed."
  echo "Fallback options:"
  echo "  - Run this on a host machine with Android Studio SDK: npm run android"
  echo "  - Build in cloud: npm run android:eas"
  exit 1
fi

echo "Tooling checks passed. Starting Expo Android run..."
exec npx expo run:android
