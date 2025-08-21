import http from 'k6/http';
import { sleep } from 'k6';
import { check } from 'k6';

const POLL_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 1000;

const config = {
    backendUrl: __ENV.BACKEND_URL || 'http://localhost:8000',
    endpoints: {
        startLensLine: '/lens/start-line',
        resultsLensLine: (jobId: string) => `/lens/results-line/${jobId}`,
        startLensGrid: '/lens/start-grid',
        resultsLensGrid: (jobId: string) => `/lens/results-grid/${jobId}`,
    },
    getApiUrl: (endpoint: string) => `${config.backendUrl}${endpoint}`,
    ndifStatusUrl: (jobId: string) => `https://api.ndif.us/response/${jobId}`,
};

interface JobStartResponse<T> {
    job_id: string | null;
    data?: T;
    [key: string]: any;
}

function awaitNDIFJob(jobId: string): void {
    const startedAt = Date.now();
    
    while (true) {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            throw new Error('Timed out waiting for job to complete');
        }

        const pollResp = http.get(config.ndifStatusUrl(jobId));
        
        if (pollResp.status !== 200) {
            throw new Error('Polling failed');
        }
        
        const data = JSON.parse(pollResp.body as string);
        const status = data?.status as string | undefined;

        if (status === 'COMPLETED') {
            return;
        }
        
        if (status === 'ERROR' || status === 'NNSIGHT_ERROR') {
            throw new Error('Job failed');
        }

        // For non-terminal statuses, wait and try again
        sleep(POLL_INTERVAL_MS / 1000); // k6 sleep takes seconds
    }
}

function startJob<T>(url: string, body: any): JobStartResponse<T> {
    const response = http.post(url, JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.status !== 200) {
        throw new Error('Failed to start job');
    }
    
    return JSON.parse(response.body as string) as JobStartResponse<T>;
}

function fetchResults<T>(url: string, body: any): T {
    const resp = http.post(url, JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });
    
    if (resp.status !== 200) {
        throw new Error('Failed to fetch results');
    }
    
    return JSON.parse(resp.body as string) as T;
}

export function startAndPoll<T>(
    startEndpoint: string,
    body: any,
    resultsEndpoint: (jobId: string) => string,
): T {
    const startUrl = config.getApiUrl(startEndpoint);
    const response = startJob<T>(startUrl, body);
    const jobId = response?.job_id ?? null;
    
    if (jobId) {
        awaitNDIFJob(jobId);
        
        const resultsUrl = config.getApiUrl(resultsEndpoint(jobId));
        const results = fetchResults<any>(resultsUrl, body);
        
        if (results && typeof results === 'object' && 'data' in results) {
            return (results as { data: T }).data;
        }
        return results as T;
    }
    
    if ('data' in response) {
        return (response as { data: T | null }).data as T;
    }
    
    return response as unknown as T;
}

export { config };