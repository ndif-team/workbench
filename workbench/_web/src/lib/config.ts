// Configuration for the application

const config = {
    backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
    ndifUrl:
        process.env.NEXT_PUBLIC_LOCAL_NDIF === "true"
            ? "http://localhost:8001"
            : "https://api.ndif.us",
    endpoints: {
        runLogitLens: "/logit_lens/run",

        runJLens: "/j_lens/run",

        startCausalMediation: "/causal_mediation/start",
        resultsCausalMediation: (jobId: string) => `/causal_mediation/results/${jobId}`,

        runActivationPatching: "/activation_patching/run",

        startGenerate: "/models/start-generate",

        models: "/models/",
    },
    getApiUrl: (endpoint: string) => `${config.backendUrl}${endpoint}`,
    ndifStatusUrl: (jobId: string) => `${config.ndifUrl}/response/${jobId}`,
} as const;

export default config;
