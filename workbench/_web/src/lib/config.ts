// Configuration for the application

const config = {
    backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
    ndifUrl:
        process.env.NEXT_PUBLIC_LOCAL_NDIF === "true"
            ? "http://localhost:8001"
            : "https://api.ndif.us",
    endpoints: {
        startLensLine: "/lens/start-line",
        resultsLensLine: (jobId: string) => `/lens/results-line/${jobId}`,

        startLensGrid: "/lens/start-grid",
        resultsLensGrid: (jobId: string) => `/lens/results-grid/${jobId}`,

        runLens2: "/logit_lens/run",

        runJLens: "/j_lens/run",

        startCausalMediation: "/causal_mediation/start",
        resultsCausalMediation: (jobId: string) => `/causal_mediation/results/${jobId}`,

        runActivationPatching: "/activation_patching/run",

        startPrediction: "/models/start-prediction",
        resultsPrediction: (jobId: string) => `/models/results-prediction/${jobId}`,

        startGenerate: "/models/start-generate",
        resultsGenerate: (jobId: string) => `/models/results-generate/${jobId}`,

        models: "/models/",
    },
    getApiUrl: (endpoint: string) => `${config.backendUrl}${endpoint}`,
    ndifStatusUrl: (jobId: string) => `${config.ndifUrl}/response/${jobId}`,
} as const;

export default config;
