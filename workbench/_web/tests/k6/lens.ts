import { check } from "k6";
import { Options } from "k6/options";
import { Trend } from "k6/metrics";
import execution from "k6/execution";
import { startAndPoll, config, POLL_TIMEOUT_MS, PollResult } from "./utils";

// Custom metrics for tracking poll duration
const lensPollDuration = new Trend("lens_poll_duration", true);

// Test configuration - scalable up to N virtual users
export const options: Options = {
    vus: 10, // 10 virtual users
    duration: "30s", // Run for 30 seconds
    thresholds: {
        http_req_duration: ["p(95)<5000"], // 95% of requests must complete below 5s
        http_req_failed: ["rate<0.1"], // http errors should be less than 10%
        lens_poll_duration: ["p(95)<10000", "avg<5000"], // 95% < 10s, avg < 5s
    },
};

// Mock LensConfigData - shared by all users
const mockLensConfig = {
    model: "meta-llama/Llama-3.1-8B",
    prompt: "The quick brown fox jumps over the lazy dog",
    token: {
        idx: 5,
        id: 1234,
        text: "fox",
        targetIds: [5678, 9012, 3456],
    },
};

interface Line {
    id: string;
    data: Array<{ x: number; y: number }>;
}

export default function lensLineLoadTest() {
    try {
        // Call the lens line endpoint using our utils
        const result: PollResult<Line[]> = startAndPoll<Line[]>(
            config.endpoints.startLensLine,
            mockLensConfig,
            config.endpoints.resultsLensLine,
        );

        // Record the poll duration metric
        lensPollDuration.add(result.pollDuration);

        // Validate the response
        const checks = check(result.data, {
            "response is array": (r) => Array.isArray(r),
            "response has lines": (r) => r.length > 0,
            "lines have valid structure": (r) => {
                if (!Array.isArray(r) || r.length === 0) return false;
                const firstLine = r[0];
                return (
                    typeof firstLine.id === "string" &&
                    Array.isArray(firstLine.data) &&
                    firstLine.data.length > 0 &&
                    typeof firstLine.data[0].x === "number" &&
                    typeof firstLine.data[0].y === "number"
                );
            },
            "poll completed within timeout": () => result.pollDuration < POLL_TIMEOUT_MS,
        });

        if (!checks) {
            console.error("Response validation failed");
        }
    } catch (error) {
        console.error(`Error in lens line test: ${error}`);
        check(null, {
            "request succeeded": () => false,
        });
    }
}
