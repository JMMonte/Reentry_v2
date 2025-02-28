import fs from 'fs-extra';
import path from 'path';

// Check if we're in Vercel environment
const isVercel = process.env.VERCEL === '1';

console.log('🔧 Asset Preparation Script');
console.log(`Running in Vercel environment: ${isVercel ? 'YES' : 'NO'}`);

const ASSET_DIRS = [
    'src/assets/textures',
    'src/assets/cubemaps',
    'src/assets/models'
];

async function ensureDirectoryExists(dir) {
    try {
        if (!fs.existsSync(dir)) {
            console.log(`Creating directory: ${dir}`);
            await fs.mkdirp(dir);
        }
    } catch (err) {
        console.error(`Error creating directory ${dir}:`, err.message);
    }
}

async function main() {
    console.log('🔄 Starting asset preparation...');
    
    // Create asset directories
    for (const dir of ASSET_DIRS) {
        await ensureDirectoryExists(dir);
    }
    
    // When in Vercel, skip any heavy optimization
    if (isVercel) {
        console.log('⏩ Running in Vercel environment, skipping optimization');
        console.log('✅ Asset preparation complete!');
        return;
    }

    console.log('✅ Asset preparation complete!');
}

main().then(() => {
    console.log('Script completed successfully');
}).catch(err => {
    console.error('Error during script execution:', err.message);
    // Don't exit with error in Vercel to prevent build failure
    if (!isVercel) {
        process.exit(1);
    } else {
        console.log('Error occurred but continuing build in Vercel environment');
    }
}); 