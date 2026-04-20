// Configuration for the application

const config = {
    backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
    endpoints: {
        runLensLine: "/lens/run-line",
        runLensGrid: "/lens/run-grid",
        runLens2: "/logit_lens/run",
        runActivationPatching: "/activation_patching/run",
        runPrediction: "/models/run-prediction",
        runGenerate: "/models/run-generate",

        models: "/models/",
    },
    getApiUrl: (endpoint: string) => `${config.backendUrl}${endpoint}`,
} as const;

export default config;
