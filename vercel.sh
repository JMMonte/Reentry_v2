#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting Vercel deployment build process"
echo ""

echo "🔍 Environment info:"
node -v
npm -v
env | grep VERCEL

echo "📦 Installing dependencies with minimal settings..."
export NODE_OPTIONS="--max-old-space-size=3072"
export VERCEL=1

# Skip build cache to avoid issues
export VERCEL_CACHE_SKIP=1

# Use clean install with minimal output
npm ci --prefer-offline --no-audit --progress=false --loglevel=error --no-fund

echo "🔍 Setting up asset directories..."
mkdir -p src/assets/textures
mkdir -p src/assets/cubemaps
mkdir -p src/assets/models

echo "🔧 Checking assets..."
node optimize-assets.js

echo "🏗️ Building application..."
npm run build --silent

echo "✅ Build completed successfully!" 