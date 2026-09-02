export interface GenParams {
  prompt: string;
  negativeprompt?: string;
  model: string;
  vae?: string;
  textencoder?: string;
  steps: number;
  cfgscale: number;
  width: number;
  height: number;
  seed: number;
  sampler?: string;
  scheduler?: string;
}

export interface ProgressPayload {
  step: number;
  maxSteps: number;
  percent: number;
  previewUrl?: string;
  stage?: string;
}

let activeSessionId = '';

export async function getSession(): Promise<string> {
  if (activeSessionId) return activeSessionId;
  try {
    const res = await fetch('/API/GetNewSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data?.session_id) {
      activeSessionId = String(data.session_id);
      return activeSessionId;
    }
  } catch (err) {
    console.error('[SwarmClient] Failed to establish Swarm session:', err);
  }
  return '';
}

function parseFileList(data: any): string[] {
  if (data?.files && Array.isArray(data.files)) {
    return data.files.map((item: any) => (typeof item === 'string' ? item : item.data || item.name || item));
  }
  return [];
}

async function listBySubtype(subtype: string, path = '', depth = 10): Promise<string[]> {
  try {
    const session = await getSession();
    const res = await fetch('/API/ListModels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session, path, depth, subtype })
    });
    return parseFileList(await res.json());
  } catch {
    return [];
  }
}

export const swarmApi = {
  listModels: () => listBySubtype('Stable-Diffusion'),
  listVAEs: async () => ['Automatic', 'None', ...(await listBySubtype('VAE'))],
  listLoRAs: () => listBySubtype('LoRA'),
  listEmbeddings: () => listBySubtype('Embedding'),
  listTextEncoders: async () => ['Automatic', ...(await listBySubtype('Clip'))],
  listWildcards: () => listBySubtype('Wildcards'),

  generateWS(
    params: GenParams,
    onProgress: (payload: ProgressPayload) => void,
    onComplete: (imageUrls: string[]) => void,
    onError: (err: string) => void
  ) {
    getSession().then((session) => {
      const ws = new WebSocket('ws://127.0.0.1:7801/API/GenerateText2ImageWS');

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            session_id: session,
            ...params,
            images: 1,
            donotsave: false
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.step !== undefined || msg.overall_percent !== undefined) {
            const step = msg.step ?? Math.round((msg.overall_percent ?? 0) * params.steps);
            const max = msg.max_steps ?? params.steps;
            const percent = Math.round((msg.overall_percent ?? (max > 0 ? step / max : 0)) * 100);

            let previewUrl = undefined;
            if (msg.preview) {
              previewUrl = msg.preview.startsWith('data:') ? msg.preview : `/${msg.preview.replace(/^\/+/, '')}`;
            }

            onProgress({
              step,
              maxSteps: max,
              percent,
              previewUrl,
              stage: msg.status || (step === 0 ? 'Loading Model' : 'Sampling')
            });
          }

          if (msg.images || msg.image || msg.output) {
            const rawImgs = msg.images || [msg.image] || msg.output;
            const resolved = rawImgs.filter(Boolean).map((raw: any) => {
              const target = typeof raw === 'string' ? raw : raw.image || raw.url || raw.data;
              return target.startsWith('http') || target.startsWith('data:') ? target : `/${target.replace(/^\/+/, '')}`;
            });
            onComplete(resolved);
            ws.close();
          }

          if (msg.error) {
            onError(msg.error);
            ws.close();
          }
        } catch {}
      };

      ws.onerror = () => {
        onError('WebSocket connection failed.');
      };
    });
  }
};