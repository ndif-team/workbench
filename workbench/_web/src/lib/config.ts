// Configuration for the application

// Every model-touching endpoint is one streaming POST (see runAndStream.ts).
// There is deliberately no NDIF URL here: the browser talks only to this app's
// own backend, which is the only thing that speaks to NDIF.
const config = {
    backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
    endpoints: {
        // Lens v1 — hidden, do not extend (see CLAUDE.md).
        runLensLine: "/lens/run-line",
        runLensGrid: "/lens/run-grid",

        runLens2: "/logit_lens/run",
        runJLens: "/j_lens/run",
        runCausalMediation: "/causal_mediation/run",
        runActivationPatching: "/activation_patching/run",

        runPrediction: "/models/run-prediction",
        runGenerate: "/models/run-generate",

        models: "/models/",
    },
    getApiUrl: (endpoint: string) => `${config.backendUrl}${endpoint}`,
} as const;

export default config;
