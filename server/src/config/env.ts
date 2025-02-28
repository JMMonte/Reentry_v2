import dotenv from 'dotenv';
import { EnvConfig } from '../types/index.js';

// Load environment variables
dotenv.config();

// Validation function to ensure required environment variables are present
function validateEnv(): void {
    const requiredEnvVars = ['PORT', 'CLIENT_URL', 'OPENAI_API_KEY'];

    const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
}

// Initialize and validate environment configuration
function initializeConfig(): EnvConfig {
    try {
        validateEnv();

        return {
            port: parseInt(process.env.PORT || '3000', 10),
            clientUrl: process.env.CLIENT_URL || 'http://localhost:1234',
            openaiApiKey: process.env.OPENAI_API_KEY || '',
            environment: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development'
        };
    } catch (error) {
        console.error('Error initializing configuration:', error);
        // Provide default values for development but log the error
        return {
            port: 3000,
            clientUrl: 'http://localhost:1234',
            openaiApiKey: '',
            environment: 'development'
        };
    }
}

// Export the configuration
const config = initializeConfig();
export default config; 