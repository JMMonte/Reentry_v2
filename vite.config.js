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
            './src/components/Satellite/GroundTrack.js'
          ],
          'managers': [
            './src/managers/CameraControls.js',
            './src/managers/TextureManager.js',
            './src/managers/SceneManager.js',
            './src/managers/SatelliteManager.js',
            './src/managers/PhysicsManager.js',
            './src/managers/ConnectionManager.js'
          ]
        }
      }
    }
  },
  server: {
    port: 1234,
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
