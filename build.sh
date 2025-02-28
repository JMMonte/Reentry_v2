#!/bin/bash

# Exit on error
set -e

# Make vercel.sh executable
chmod +x vercel.sh

echo "🔍 Environment info:"
node -v
npm -v

echo "📦 Installing dependencies..."
npm install --legacy-peer-deps

echo "🔍 Checking for asset directories..."
mkdir -p src/assets/textures
mkdir -p src/assets/cubemaps
mkdir -p src/assets/models

echo "🏗️ Building application..."
npm run build

echo "✅ Build completed successfully!" 