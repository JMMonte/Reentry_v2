#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting Vercel deployment build process"

# Print environment info
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Create asset directories
echo "Creating asset directories..."
mkdir -p src/assets/textures
mkdir -p src/assets/cubemaps
mkdir -p src/assets/models

# Prepare assets (but doesn't do heavy optimization in Vercel)
node optimize-assets.js

# Build the application
echo "Building application..."
npm run build

echo "✅ Build completed successfully!" 