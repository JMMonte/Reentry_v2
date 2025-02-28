#!/bin/bash

# Exit on error but print the error command
set -e
set -o pipefail

# Print commands before execution
set -x

echo "🚀 Starting Vercel deployment build process"

# Print environment info
echo "Node version:"
node -v
echo "NPM version:"
npm -v 

# Set environment variables
export NODE_OPTIONS="--max-old-space-size=4096"
export VERCEL=1

# Log directory contents to help with debugging
echo "Current directory structure:"
find . -type d -not -path "*/node_modules/*" -not -path "*/.git/*" | sort

# Create asset directories
echo "Creating asset directories..."
mkdir -p src/assets/textures
mkdir -p src/assets/cubemaps
mkdir -p src/assets/models

# Show available space
echo "Available disk space:"
df -h

# Skip optimization in Vercel environment
echo "Checking assets..."
node optimize-assets.js || echo "Asset optimization failed, continuing build..."

# Check if node_modules is corrupted and clean if necessary
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
  echo "node_modules may be corrupted, reinstalling dependencies..."
  rm -rf node_modules
  npm install --prefer-offline --no-audit --loglevel=error --no-fund
fi

# Build the application with minimal output
echo "Building application..."
npm run build --silent || {
  echo "Build failed, checking for common errors..."
  npm list next three vite
  exit 1
}

echo "✅ Build completed successfully!" 