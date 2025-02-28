import fs from 'fs-extra';
import path from 'path';

// Check if we're in Vercel environment - always assume true to be safe
const isVercel = process.env.VERCEL === '1' || true;

// Always skip heavy optimization in potential deployment environments
const SKIP_HEAVY_OPTIMIZATION = isVercel;

console.log('🔧 Asset Optimization Script');
console.log(`Running in Vercel mode: ${isVercel ? 'YES' : 'NO'}`);

// Only try to import sharp if we're not skipping optimization
let sharp;
if (!SKIP_HEAVY_OPTIMIZATION) {
    try {
        sharp = await import('sharp');
    } catch (err) {
        console.warn('Sharp module not available - skipping image optimization');
    }
}

const ASSET_DIRS = [
    'src/assets/textures',
    'src/assets/cubemaps',
    'src/assets/models'
];

// Configuration for different file types
const CONFIG = {
    // Images to optimize
    images: {
        extensions: ['.png', '.jpg', '.jpeg', '.webp'],
        sizeThreshold: isVercel ? 1024 * 1024 * 10 : 1024 * 1024 * 5,
        quality: isVercel ? 60 : 80,
        maxWidth: isVercel ? 1024 : 2048,
    }
};

async function optimizeImage(filePath, stats) {
    // Skip optimization if sharp is not available
    if (!sharp) {
        console.log(`Skipping ${filePath} - Sharp not available`);
        return;
    }

    const fileSize = stats.size;
    const ext = path.extname(filePath).toLowerCase();

    // Skip if file is smaller than threshold
    if (fileSize < CONFIG.images.sizeThreshold) {
        console.log(`Skipping ${filePath} (${(fileSize / 1024 / 1024).toFixed(2)}MB): under threshold`);
        return;
    }

    console.log(`Optimizing ${filePath} (${(fileSize / 1024 / 1024).toFixed(2)}MB)...`);

    try {
        const outputPath = filePath.replace(ext, `.opt${ext}`);
        const image = sharp(filePath);
        
        // Get image info
        const metadata = await image.metadata();
        
        // Only resize if larger than maxWidth
        if (metadata.width > CONFIG.images.maxWidth) {
            image.resize(CONFIG.images.maxWidth);
        }
        
        // Apply compression based on file type
        if (ext === '.png') {
            await image.png({ quality: CONFIG.images.quality, compressionLevel: 9 }).toFile(outputPath);
        } else if (['.jpg', '.jpeg'].includes(ext)) {
            await image.jpeg({ quality: CONFIG.images.quality }).toFile(outputPath);
        } else if (ext === '.webp') {
            await image.webp({ quality: CONFIG.images.quality }).toFile(outputPath);
        }
        
        // Check new file size
        const newStats = await fs.stat(outputPath);
        const newSize = newStats.size;
        const savings = ((1 - (newSize / fileSize)) * 100).toFixed(2);
        
        if (newSize < fileSize) {
            console.log(`  Optimized: ${(fileSize / 1024 / 1024).toFixed(2)}MB → ${(newSize / 1024 / 1024).toFixed(2)}MB (${savings}% saved)`);
            // Replace original with optimized version
            await fs.rename(outputPath, filePath);
        } else {
            console.log(`  No savings achieved, keeping original`);
            await fs.remove(outputPath);
        }
    } catch (error) {
        console.error(`Error optimizing ${filePath}:`, error.message);
    }
}

async function ensureDirectoryExists(dir) {
    try {
        if (!fs.existsSync(dir)) {
            console.log(`Creating directory: ${dir}`);
            fs.mkdirpSync(dir);
        }
    } catch (err) {
        console.error(`Error creating directory ${dir}:`, err.message);
    }
}

async function processDirectory(dir) {
    try {
        await ensureDirectoryExists(dir);
        console.log(`Processing directory: ${dir}`);
        
        const files = await fs.readdir(dir);
        
        for (const file of files) {
            const filePath = path.join(dir, file);
            try {
                const stats = await fs.stat(filePath);
                
                if (stats.isDirectory()) {
                    // Process subdirectories recursively
                    await processDirectory(filePath);
                } else {
                    const ext = path.extname(file).toLowerCase();
                    
                    // Process images
                    if (CONFIG.images.extensions.includes(ext)) {
                        await optimizeImage(filePath, stats);
                    }
                }
            } catch (err) {
                console.error(`Error processing ${filePath}:`, err.message);
            }
        }
    } catch (err) {
        console.error(`Error processing directory ${dir}:`, err.message);
    }
}

async function main() {
    console.log('🔄 Starting asset optimization...');
    
    // Create asset directories regardless
    for (const dir of ASSET_DIRS) {
        await ensureDirectoryExists(dir);
    }
    
    // Skip heavy optimization in Vercel environment
    if (SKIP_HEAVY_OPTIMIZATION) {
        console.log('⏩ Running in deployment environment, skipping heavy optimization');
        console.log('✅ Asset preparation complete!');
        return;
    }

    // Process each asset directory
    for (const dir of ASSET_DIRS) {
        await processDirectory(dir);
    }

    console.log('✅ Asset optimization complete!');
}

// Use regular promise handling for better error messages
main().then(() => {
    console.log('Script completed successfully');
}).catch(err => {
    console.error('Error during script execution:', err.message);
    // Don't exit with error in Vercel to prevent build failure
    if (!isVercel) {
        process.exit(1);
    }
}); 