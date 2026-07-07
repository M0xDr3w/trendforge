import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  buildCommand: 'npm run build',
  framework: 'vite',
  outputDirectory: 'dist',
  rewrites: [
    routes.rewrite('/callback', '/callback.html'),
  ],
  // Note: X_BEARER_TOKEN must be set in Vercel Dashboard (Production + Preview)
  // or via `vercel env add X_BEARER_TOKEN`
};
