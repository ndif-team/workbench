// Configuration for the application

const config = {
    backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
    ndifUrl:
        process.env.NEXT_PUBLIC_LOCAL_NDIF === "true"
            ? "http://localhost:5001"
            : "https://api.ndif.us",
    endpoints: {
        logitLens: "/logit-lens/run",
        logitLensHeatmap: (jobId: string) => `/logit-lens/heatmap/${jobId}`,
        logitLensLine: (jobId: string) => `/logit-lens/line/${jobId}`,

        conceptLens: "/concept-lens/run",
        conceptLensHeatmap: (jobId: string) => `/concept-lens/heatmap/${jobId}`,

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
