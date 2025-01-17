import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    glsl()
  ],
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: 'src/index.html',
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'three'],
          'physics': ['./src/workers/physicsWorker.js'],
          'los': ['./src/workers/lineOfSightWorker.js'],
          'satellite': [
            './src/components/Satellite/Satellite.js',
            './src/components/Satellite/GroundTrack.js',
            './src/components/Satellite/ManeuverPlanner.js',
            './src/components/Satellite/ManeuverCalculator.js'
          ],
          'managers': [
            './src/managers/GUIManager.js',
            './src/managers/CameraControls.js',
            './src/managers/textureManager.js'
          ]
        }
      }
    }
  },
  server: {
    port: 1234, // Same as Parcel's default port
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
})
