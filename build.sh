#!/bin/bash

# Exit on error
set -e

# Make vercel.sh executable (for permission issues)
echo "Making vercel.sh executable..."
chmod +x vercel.sh

echo "🔍 Environment info:"
node -v
npm -v

echo "🧹 Cleaning npm cache..."
npm cache clean --force

echo "📦 Installing dependencies with optimized settings..."
export NODE_OPTIONS="--max-old-space-size=4096"
npm ci --prefer-offline --no-audit --progress=false --loglevel=error

echo "🔍 Checking for asset directories..."
mkdir -p src/assets/textures
mkdir -p src/assets/cubemaps
mkdir -p src/assets/models

echo "🔧 Optimizing assets..."
node optimize-assets.js || echo "Asset optimization failed, continuing with build..."

echo "🏗️ Building application..."
npm run build

echo "✅ Build completed successfully!" 