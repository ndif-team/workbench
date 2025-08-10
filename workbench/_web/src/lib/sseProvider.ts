import config from '@/lib/config';
import { toast } from 'sonner';
import { useWorkspace } from '@/stores/useWorkspace';

const eventSourcesMap: Record<string, EventSource> = {};

const generateTaskId = (): string => {
  return `sse-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
};

const createEventSource = (
  url: string,
  onMessage: (data: unknown) => void,
  onFinish: () => void,
): { eventSource: EventSource; onCancel: () => void } => {
  const taskId = generateTaskId();

  const eventSource = new EventSource(`${config.backendUrl}${url}`, {
    withCredentials: true,
  });

  eventSourcesMap[taskId] = eventSource;

  eventSource.onmessage = (event) => {
    if (event.data === '[DONE]') {
      closeConnection();
      return;
    }

    try {
      const data = JSON.parse(event.data);
      console.log('(sse)', data);
      onMessage(data);
    } catch (error) {
      console.error('Error parsing SSE data:', error);
      toast.error('Failed to parse server-sent event data');
    }
  };

  eventSource.onerror = (error) => {
    console.error('EventSource error:', error);
    toast.error('Server-sent event connection failed');
    closeConnection();
  };

  const closeConnection = () => {
    if (eventSourcesMap[taskId]) {
      eventSource.close();
      delete eventSourcesMap[taskId];
    }
    onFinish();
  };

  return {
    eventSource,
    onCancel: closeConnection,
  };
};

interface SSEData<T> {
  type: string;
  message: string;
  data: T;
}

const listenToSSE = async <T>(url: string): Promise<T> => {
  // E2E fallback: fetch JSON once instead of establishing SSE
  if (process.env.NEXT_PUBLIC_E2E === 'true') {
    const response = await fetch(`${config.backendUrl}${url}`);
    return (await response.json()) as T;
  }

  return new Promise((resolve, reject) => {
    let result: T | null = null;
    const { setJobStatus } = useWorkspace.getState();
    
    const { onCancel } = createEventSource(
      url,
      (data: unknown) => {
        const sseData = data as SSEData<T>;
        if (sseData.type === 'status') {
          setJobStatus(sseData.message);
        } else if (sseData.type === 'result') {
          result = sseData.data;
        } else if (sseData.type === 'error') {
          setJobStatus(`Error: ${sseData.message}`);
          reject(new Error(sseData.message));
        }
      },
      () => {
        if (result) {
          setJobStatus('idle');
          resolve(result);
        } else {
          setJobStatus('Error: No result received');
          reject(new Error('No result received'));
        }
      }
    );
  });
};

const sseService = {
  createEventSource,
  listenToSSE,
};

export default sseService;
