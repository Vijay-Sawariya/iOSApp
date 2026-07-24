#!/bin/sh

set -eu

REPOSITORY_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../.." && pwd)}"
FRONTEND_ROOT="$REPOSITORY_ROOT/frontend"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export HOMEBREW_NO_AUTO_UPDATE=1

if ! command -v brew >/dev/null 2>&1; then
  echo "error: Homebrew is unavailable in the Xcode Cloud environment."
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Installing Node.js..."
  brew install node
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "Installing CocoaPods..."
  brew install cocoapods
fi

echo "Installing JavaScript dependencies..."
cd "$FRONTEND_ROOT"
npm ci

echo "Installing CocoaPods dependencies..."
cd "$FRONTEND_ROOT/ios"
pod install

echo "Xcode Cloud dependencies installed."
