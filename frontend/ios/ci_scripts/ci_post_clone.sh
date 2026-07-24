#!/bin/sh

set -eu

REPOSITORY_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../.." && pwd)}"
FRONTEND_ROOT="$REPOSITORY_ROOT/frontend"

echo "Installing JavaScript dependencies..."
cd "$FRONTEND_ROOT"
npm ci

echo "Installing CocoaPods dependencies..."
cd "$FRONTEND_ROOT/ios"
pod install

echo "Xcode Cloud dependencies installed."
