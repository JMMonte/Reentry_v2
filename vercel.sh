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
export NODE_OPTIONS="--max-old-space-size=3072"
export VERCEL=1

# Create asset directories
echo "Creating asset directories..."
mkdir -p src/assets/textures
mkdir -p src/assets/cubemaps
mkdir -p src/assets/models

# Skip optimization in Vercel environment
echo "Checking assets..."
node optimize-assets.js

# Build the application with minimal output
echo "Building application..."
npm run build --silent

echo "✅ Build completed successfully!" 