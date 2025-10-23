/** @type {import('next').NextConfig} */

import { withPostHogConfig } from "@posthog/nextjs-config";

const nextConfig = {
    reactStrictMode: true,
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

export default withPostHogConfig(nextConfig, {
    personalApiKey: process.env.POSTHOG_API_KEY, // Personal API Key
    envId: process.env.POSTHOG_ENV_ID, // Environment ID
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST, // (optional), defaults to https://us.posthog.com
    sourcemaps: {
        // (optional)
    },
});
