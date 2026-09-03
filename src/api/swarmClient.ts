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
  session_id?: string;
}

export interface ProgressPayload {
  step: number;
  maxSteps: number;
  max_steps?: number;
  percent: number;
  overall_percent?: number;
  previewUrl?: string;
  preview?: string;
  speed?: number;
  eta?: number;
  stage?: string;
}

export type SwarmProgressData = ProgressPayload;

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
    console.error('[SwarmClient] Session failed:', err);
  }
  activeSessionId = `sess_${Date.now()}`;
  return activeSessionId;
}

class SwarmClientClass {
  public setBaseUrl(_url: string) {}

  public async getNewSession(): Promise<string> {
    return getSession();
  }

  public async listModels(): Promise<string[]> {
    try {
      const session = await getSession();
      const res = await fetch('/API/ListModels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session, path: '', depth: 10 })
      });
      const data = await res.json();
      if (data?.files && Array.isArray(data.files)) {
        return data.files.map((item: any) => (typeof item === 'string' ? item : item.data || item.name || String(item)));
      }
      return [];
    } catch {
      return [];
    }
  }

  public async interrupt(): Promise<boolean> {
    try {
      const session = await getSession();
      const res = await fetch('/API/InterruptJob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async generateImage(
    params: GenParams,
    onProgress: (payload: ProgressPayload) => void
  ): Promise<{ imageUrl: string }> {
    const session = await getSession();
    params.session_id = session;

    return new Promise((resolve, reject) => {
      const wsUrl = `ws://${window.location.host || '127.0.0.1:7801'}/API/GenerateText2ImageWS`;
      const ws = new WebSocket(wsUrl);
      let resolved = false;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
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
            const rawPreview = msg.preview || msg.previewUrl;
            if (rawPreview) {
              previewUrl = rawPreview.startsWith('data:') ? rawPreview : `/${rawPreview.replace(/^\/+/, '')}`;
            }

            onProgress({
              step,
              maxSteps: max,
              max_steps: max,
              percent,
              overall_percent: percent / 100,
              previewUrl,
              preview: previewUrl,
              speed: msg.speed,
              eta: msg.eta,
              stage: msg.status || (step === 0 ? 'Loading Model' : 'Sampling')
            });
          }

          if (msg.images || msg.image || msg.output) {
            const rawImgs = msg.images || [msg.image] || msg.output;
            const resolvedImgs = rawImgs.filter(Boolean).map((raw: any) => {
              const target = typeof raw === 'string' ? raw : raw.image || raw.url || raw.data;
              return target.startsWith('http') || target.startsWith('data:') ? target : `/${target.replace(/^\/+/, '')}`;
            });
            if (!resolved) {
              resolved = true;
              ws.close();
              resolve({ imageUrl: resolvedImgs[0] });
            }
          }

          if (msg.error) {
            if (!resolved) {
              resolved = true;
              ws.close();
              reject(new Error(msg.error));
            }
          }
        } catch {}
      };

      ws.onerror = () => {
        if (!resolved) {
          resolved = true;
          reject(new Error('WebSocket connection failed.'));
        }
      };
    });
  }
}

export const swarmClient = new SwarmClientClass();
export const swarmApi = {
  ...swarmClient,
  async listModelsDetailed(_subtype: string) {
    return [{ name: 'Default Model' }];
  },
  async listVAEs() { return ['Automatic', 'None']; },
  async listTextEncoders() { return ['Automatic']; },
  async listWildcards() { return []; },
  generateWS(params: GenParams, onProgress: any, onComplete: any, onError: any) {
    swarmClient.generateImage(params, (p) => onProgress(p)).then((res) => onComplete([res.imageUrl])).catch((e) => onError(e.message));
  }
};