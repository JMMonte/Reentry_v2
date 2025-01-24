import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import glsl from 'vite-plugin-glsl';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react({
            babel: {
                plugins: [
                    ['@babel/plugin-transform-typescript', { isTSX: true }]
                ]
            }
        }),
        glsl()
    ],
    root: 'src',
    publicDir: '../public',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        sourcemap: true,
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            input: 'src/index.html',
            output: {
                manualChunks: {
                    'vendor': ['react', 'react-dom', 'three'],
                    'cannon-es': ['cannon-es'],
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
    optimizeDeps: {
        include: ['react', 'react-dom'],
        exclude: ['js-big-decimal']
    },
    server: {
        host: true,
        port: 1234,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
                ws: true
            }
        }
    }
}); 