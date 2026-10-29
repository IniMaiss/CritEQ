#!/bin/bash
# ==============================================================================
# CritEQ macOS Automated One-Click Installer
# Builds CritEQ from source and installs CritEQ.app directly to /Applications
# ==============================================================================

set -e

# Colors for terminal output
BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${BOLD}${BLUE}🎚️ CritEQ — Automated macOS Installer${RESET}"
echo -e "================================================"

# 1. Verify macOS environment
if [[ "$(uname)" != "Darwin" ]]; then
  echo -e "${RED}❌ Error: CritEQ native CoreAudio engine currently supports macOS only.${RESET}"
  exit 1
fi

# 2. Check Prerequisites
echo -e "\n${BOLD}[1/4] Checking prerequisites...${RESET}"

if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}❌ Node.js is not installed.${RESET}"
  echo -e "Please install Node.js (v18+) from https://nodejs.org or run: brew install node"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo -e "${RED}❌ npm is not installed.${RESET}"
  exit 1
fi

if ! command -v swiftc >/dev/null 2>&1; then
  echo -e "${RED}❌ swiftc compiler not found.${RESET}"
  echo -e "Please install Xcode Command Line Tools by running:"
  echo -e "  xcode-select --install"
  exit 1
fi

NODE_VER=$(node -v)
echo -e "${GREEN}✓ Node.js ($NODE_VER), npm, and swiftc detected.${RESET}"

# 3. Install Dependencies
echo -e "\n${BOLD}[2/4] Installing project dependencies...${RESET}"
npm install --silent

# 4. Build Engine & Package Standalone Application
echo -e "\n${BOLD}[3/4] Compiling native CoreAudio engine and packaging CritEQ.app...${RESET}"
npm run package

if [[ ! -d "CritEQ.app" ]]; then
  echo -e "${RED}❌ Build failed: CritEQ.app bundle not found.${RESET}"
  exit 1
fi

# 5. Install to /Applications
echo -e "\n${BOLD}[4/4] Installing CritEQ to /Applications...${RESET}"

TARGET_DIR="/Applications"
TARGET_APP="$TARGET_DIR/CritEQ.app"

# If an older version is running, close it
pkill -f "CritEQ" 2>/dev/null || true

# Remove existing installation in /Applications if present
if [[ -d "$TARGET_APP" ]]; then
  echo -e "${YELLOW}Notice: Replacing previous version at $TARGET_APP...${RESET}"
  rm -rf "$TARGET_APP"
fi

# Copy CritEQ.app into /Applications
cp -R "CritEQ.app" "$TARGET_APP"

# Strip quarantine attribute to avoid Gatekeeper issues for locally built app
xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true

# Touch the app directory so macOS Launchpad & Finder refresh the icon
touch "$TARGET_APP"

echo -e "\n${BOLD}${GREEN}================================================"
echo -e "🎉 CritEQ has been successfully installed to /Applications!"
echo -e "================================================${RESET}"
echo -e "\n${BOLD}You can now launch CritEQ via:${RESET}"
echo -e "  1. Spotlight Search (Cmd + Space, then type 'CritEQ')"
echo -e "  2. Launchpad"
echo -e "  3. Running: ${BLUE}open /Applications/CritEQ.app${RESET}\n"
