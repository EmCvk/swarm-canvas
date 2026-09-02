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
    console.error('[SwarmClient] Session failed:', err);
  }
  return '';
}

export const swarmApi = {
  async listModelsDetailed(subtype: string): Promise<{ name: string; previewUrl?: string; description?: string }[]> {
    try {
      const session = await getSession();
      const res = await fetch('/API/ListModels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session, path: '', depth: 10, subtype })
      });
      const data = await res.json();
      if (data?.files && Array.isArray(data.files)) {
        return data.files.map((item: any) => {
          if (typeof item === 'string') return { name: item };
          const name = item.data || item.name || String(item);
          let preview = item.preview_image || item.image || item.thumbnail;
          if (preview && !preview.startsWith('http') && !preview.startsWith('data:')) {
            preview = `/${preview.replace(/^\/+/, '')}`;
          }
          return { name, previewUrl: preview, description: item.description };
        });
      }
      return [];
    } catch {
      return [];
    }
  },

  async listVAEs(): Promise<string[]> {
    try {
      const detailed = await this.listModelsDetailed('VAE');
      return ['Automatic', 'None', ...detailed.map((d) => d.name)];
    } catch {
      return ['Automatic', 'None'];
    }
  },

  async listTextEncoders(): Promise<string[]> {
    try {
      const detailed = await this.listModelsDetailed('Clip');
      return ['Automatic', ...detailed.map((d) => d.name)];
    } catch {
      return ['Automatic'];
    }
  },

  async listWildcards(): Promise<string[]> {
    try {
      const detailed = await this.listModelsDetailed('Wildcards');
      return detailed.map((d) => d.name);
    } catch {
      return [];
    }
  },

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