import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

// Check if we're in Vercel environment
const isVercel = process.env.VERCEL === '1';

// If in Vercel, we might want to skip heavy optimization
const SKIP_HEAVY_OPTIMIZATION = isVercel;

// Check if sharp is installed
try {
    require.resolve('sharp');
} catch (err) {
    console.log('Sharp is not installed. Installing...');
    execSync('npm install sharp --no-save');
}

// Now we can safely import sharp
import sharp from 'sharp';

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
        sizeThreshold: isVercel ? 1024 * 1024 * 10 : 1024 * 1024 * 5, // Higher threshold on Vercel
        quality: isVercel ? 60 : 80, // Lower quality on Vercel for faster processing
        maxWidth: isVercel ? 1024 : 2048, // Smaller dimensions on Vercel
    }
};

async function optimizeImage(filePath, stats) {
    const fileSize = stats.size;
    const ext = path.extname(filePath).toLowerCase();

    // Skip if file is smaller than threshold
    if (fileSize < CONFIG.images.sizeThreshold) {
        console.log(`Skipping ${filePath} (${(fileSize / 1024 / 1024).toFixed(2)}MB): under threshold`);
        return;
    }

    console.log(`Optimizing ${filePath} (${(fileSize / 1024 / 1024).toFixed(2)}MB)...`);

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
}

async function processDirectory(dir) {
    try {
        console.log(`Processing directory: ${dir}`);

        // Create directory if it doesn't exist
        if (!fs.existsSync(dir)) {
            console.log(`Creating directory: ${dir}`);
            fs.mkdirpSync(dir);
            return;
        }

        const files = await fs.readdir(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
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
        }
    } catch (err) {
        console.error(`Error processing directory ${dir}:`, err);
    }
}

async function main() {
    console.log('🔄 Starting asset optimization...');

    // Skip heavy optimization in Vercel environment
    if (SKIP_HEAVY_OPTIMIZATION) {
        console.log('⏩ Running in Vercel environment, skipping heavy optimization');
        console.log('✅ Asset check complete!');
        return;
    }

    // Process each asset directory
    for (const dir of ASSET_DIRS) {
        await processDirectory(dir);
    }

    console.log('✅ Asset optimization complete!');
}

main().catch(err => {
    console.error('Error during optimization:', err);
    process.exit(1);
}); 