/** @type {import('next').NextConfig} */

import path from "path";
import { fileURLToPath } from "url";
import { withPostHogConfig } from "@posthog/nextjs-config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
    reactStrictMode: true,
    transpilePackages: ["nnsightful"],
    turbopack: {
        // Expand root so Turbopack can resolve the symlinked nnsightful package
        // which lives at ../../nnsightful (outside the default _web/ root)
        root: path.join(__dirname, "..", "..", ".."),
    },
    images: {
        unoptimized: true,
        remotePatterns: [
            {
                protocol: "https",
                hostname: "**.supabase.co",
            },
            {
                protocol: "https",
                hostname: "**.supabase.in",
            },
        ],
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    serverExternalPackages: ["sharp", "onnxruntime-node"],
    outputFileTracingIncludes: {
        "/workbench/**": [
            "./src/notebook-templates/**/*.ipynb",
            "./node_modules/nnsightful/src/nnsightful/viz/charts.js",
        ],
    },
    webpack: (config) => {
        // Fallbacks for @huggingface/transformers package
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            path: false,
            crypto: false,
            os: false,
        };
        config.resolve.alias = {
            ...config.resolve.alias,
            sharp$: false,
            "onnxruntime-node$": false,
        };

        return config;
    },
};

// Only use PostHog config if API key is provided
export default process.env.POSTHOG_API_KEY
    ? withPostHogConfig(nextConfig, {
          personalApiKey: process.env.POSTHOG_API_KEY, // Personal API Key
          envId: process.env.POSTHOG_ENV_ID, // Environment ID
          host: process.env.NEXT_PUBLIC_POSTHOG_HOST, // (optional), defaults to https://us.posthog.com
          sourcemaps: {
              // (optional)
          },
      })
    : nextConfig;
