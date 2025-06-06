# Deploying to Vercel

This project uses a static deployment approach for Vercel to avoid build issues.

## Deployment Steps

1. Build the project locally:

    ```bash
    pnpm run build
    ```

2. Create a `vercel.json` file in the `dist` directory with the following content:

    ```json
    {
    "version": 2,
    "buildCommand": null,
    "outputDirectory": ".",
    "framework": null,
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
    }
    ```

3. Navigate to the `dist` directory and deploy using the Vercel CLI:

    ```bash
    cd dist
    vercel --prod
    ```

## Why This Approach?

After numerous attempts to configure Vercel to build the project automatically, we've found that a pre-built static deployment is the most reliable approach. This approach:

1. Avoids memory issues during the build process on Vercel
2. Ensures all assets are properly loaded
3. Provides consistent results across deployments

## Important Notes

- Always build locally before deploying
- Any environment variables needed for the build must be set in your local environment
- Large assets like textures are included in the static build, which might make the deployment slower
- If you make code changes, you'll need to rebuild and redeploy

## Troubleshooting

If you encounter issues with the deployed site:

1. Check browser console for any missing assets or CORS issues
2. Verify that all required environment variables are correctly set
3. For large texture loading issues, consider using CDN-hosted versions

## Alternative Approaches

If you want to use Vercel's automatic builds, you may try:

1. Simplifying the configuration in `vercel.json`
2. Reducing the project's dependencies
3. Optimizing large assets before deployment
4. Using a different deployment platform that offers more resources
