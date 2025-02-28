#!/bin/bash

# Exit on error
set -e

echo "🔍 Environment info:"
node -v
npm -v

echo "🧹 Cleaning npm cache..."
npm cache clean --force

echo "📦 Installing dependencies with optimized settings..."
export NODE_OPTIONS="--max-old-space-size=3072"
npm ci --prefer-offline --no-audit --progress=false --loglevel=error

echo "🔍 Checking for asset directories..."
mkdir -p src/assets/textures
mkdir -p src/assets/cubemaps
mkdir -p src/assets/models

echo "🔧 Optimizing assets..."
node optimize-assets.js

echo "🏗️ Building application..."
npm run build

echo "✅ Build completed successfully!" 