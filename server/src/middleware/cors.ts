import cors from 'cors';
import { Express } from 'express';
import config from '../config/env.js';

/**
 * Configure CORS middleware for the Express application
 * @param app Express application instance
 */
export const setupCors = (app: Express): void => {
    // CORS configuration for Express
    app.use(cors({
        origin: config.clientUrl,
        methods: ['GET', 'POST'],
        credentials: true
    }));
}; 