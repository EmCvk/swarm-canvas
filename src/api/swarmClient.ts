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

  yolomodelinternal?: string;
  segmentsteps?: number;
  segmentthresholdmax?: number;
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
  intermediateImageUrl?: string; // New field for step outputs
}

export interface ModelItemResult {
  name: string;
  previewUrl?: string;
  description?: string;
  triggerWords?: string[];
}

export type SwarmProgressData = ProgressPayload;

let activeSessionId = '';
let sessionPromise: Promise<string> | null = null;

export async function getSession(forceNew = false): Promise<string> {
  if (activeSessionId && !forceNew) return activeSessionId;
  if (sessionPromise && !forceNew) return sessionPromise;

  sessionPromise = (async () => {
    try {
      const res = await fetch('/API/GetNewSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.session_id) {
          activeSessionId = String(data.session_id);
          return activeSessionId;
        }
      }
    } catch (err) {
      console.error('[SwarmClient] Session request failed:', err);
    } finally {
      sessionPromise = null;
    }
    activeSessionId = `sess_${Date.now()}`;
    return activeSessionId;
  })();

  return sessionPromise;
}

export function deduplicateModelList(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'string') continue;
    const clean = item.trim();
    if (!clean) continue;

    const normKey = clean.replace(/\\/g, '/').toLowerCase().replace(/\.(safetensors|pt|ckpt|bin)$/i, '');

    if (!seen.has(normKey)) {
      seen.add(normKey);
      result.push(clean);
    }
  }

  return result;
}

class SwarmClientClass {
  public setBaseUrl(_url: string) {}

  public async getNewSession(): Promise<string> {
    activeSessionId = '';
    return getSession(true);
  }

  public async triggerRefresh(): Promise<void> {
    const session = await getSession();
    try {
      await fetch('/API/TriggerRefresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session })
      });
    } catch {}
  }

  public async getT2IParams(): Promise<any> {
    try {
      const session = await getSession();
      const res = await fetch('/API/ListT2IParams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session })
      });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }

  public async listModels(subtype = 'Stable-Diffusion'): Promise<ModelItemResult[]> {
    try {
      const session = await getSession();
      const res = await fetch('/API/ListModels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session,
          path: '',
          depth: 100,
          subtype: subtype,
          sortBy: 'Name'
        })
      });

      if (!res.ok) return [];

      const data = await res.json();
      if (data?.error) return [];

      const files = data?.files || data?.models || [];
      if (Array.isArray(files)) {
        return files.map((item: any) => {
          if (typeof item === 'string') {
            return { name: item };
          }
          const rawPreview = item.preview_image || item.preview || item.image;
          let previewUrl: string | undefined = undefined;
          if (rawPreview) {
            if (rawPreview.startsWith('http') || rawPreview.startsWith('data:')) {
              previewUrl = rawPreview;
            } else {
              const clean = rawPreview.replace(/^\/+/, '');
              previewUrl = clean.startsWith('View/') ? `/${clean}` : `/View/${clean}`;
            }
          }
          return {
            name: item.name || item.data || item.title || String(item),
            previewUrl,
            description: item.description || item.metadata?.description || undefined,
            triggerWords: item.trigger_words || undefined
          };
        });
      }
      return [];
    } catch {
      return [];
    }
  }

  public async listWildcards(): Promise<string[]> {
    const data = await this.getT2IParams();
    if (data?.wildcards && Array.isArray(data.wildcards)) {
      return data.wildcards;
    }
    const models = await this.listModels('Wildcards');
    return models.map((w) => w.name);
  }

  public async listVAEs(): Promise<string[]> {
    const rawVaes: string[] = ['Automatic', 'None'];
    try {
      const models = await this.listModels('VAE');
      models.forEach((m) => {
        if (m.name && m.name !== 'Automatic' && m.name !== 'None') {
          rawVaes.push(m.name);
        }
      });
    } catch {}
    return deduplicateModelList(rawVaes);
  }

  public async listTextEncoders(): Promise<string[]> {
    const rawEncoders: string[] = ['Automatic', 'None'];
    const subtypes = ['Clip', 'CLIP', 'Text-Encoder', 'TextEncoder', 'text_encoders'];
    for (const sub of subtypes) {
      try {
        const models = await this.listModels(sub);
        if (models && models.length > 0) {
          models.forEach((m) => {
            if (m.name && m.name !== 'Automatic' && m.name !== 'None') {
              rawEncoders.push(m.name);
            }
          });
        }
      } catch {}
    }
    try {
      const t2i = await this.getT2IParams();
      if (t2i?.list && Array.isArray(t2i.list)) {
        for (const p of t2i.list) {
          const id = (p.id || '').toLowerCase();
          if (id === 'cliplmodel' || id === 'clipgmodel' || id === 'clip' || id === 'textencoder') {
            if (Array.isArray(p.values)) {
              p.values.forEach((v: string) => {
                if (v && v !== 'Automatic' && v !== 'None') rawEncoders.push(v);
              });
            }
          }
        }
      }
    } catch {}
    return deduplicateModelList(rawEncoders);
  }

  public async listYoloModels(): Promise<string[]> {
    try {
      const t2i = await this.getT2IParams();
      if (t2i?.list && Array.isArray(t2i.list)) {
        const yoloParam = t2i.list.find((p: any) => p.id === 'yolomodelinternal');
        if (yoloParam?.values && Array.isArray(yoloParam.values) && yoloParam.values.length > 0) {
          return yoloParam.values;
        }
      }
    } catch (e) {
      console.warn('[SwarmClient] Could not fetch yolomodelinternal values:', e);
    }
    return ['face_yolov8n.pt', 'hand_yolov8n.pt', 'face_yolov8m.pt', 'face_yolov9c.pt', 'person_yolov8m-seg.pt'];
  }

  public async listServerImages(): Promise<Array<{ url: string; name: string }>> {
    try {
      const session = await getSession();
      const res = await fetch('/API/ListImages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session, path: '', depth: 10 })
      });
      if (res.ok) {
        const data = await res.json();
        const files = data?.files || [];
        return files.map((f: any) => {
          const raw = typeof f === 'string' ? f : f.data || f.name || f.src;
          const clean = raw.replace(/^\/+/, '');
          const url = clean.startsWith('http') || clean.startsWith('data:') ? clean : `/View/${clean.replace(/^(View\/)?/, '')}`;
          return { url, name: clean };
        });
      }
    } catch {}
    return [];
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
  ): Promise<{ imageUrl: string; images: string[] }> {
    const session = await this.getNewSession();
    params.session_id = session;

    return new Promise((resolve, reject) => {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host || '127.0.0.1:7801'}/API/GenerateText2ImageWS?session_id=${encodeURIComponent(session)}`;
      const ws = new WebSocket(wsUrl);
      let resolved = false;
      const collectedImages: string[] = [];

      ws.onopen = () => {
        const cleanPayload: Record<string, any> = {
          session_id: params.session_id,
          prompt: params.prompt,
          negativeprompt: params.negativeprompt || '',
          model: params.model,
          width: params.width,
          height: params.height,
          steps: params.steps,
          cfgscale: params.cfgscale,
          seed: params.seed,
          sampler: params.sampler,
          scheduler: params.scheduler,
          images: 1,
          donotsave: false
        };

        if (params.vae && params.vae !== 'Automatic' && params.vae !== 'None') {
          cleanPayload.vae = params.vae;
        }

        if (params.textencoder && params.textencoder !== 'Automatic' && params.textencoder !== 'None') {
          cleanPayload.cliplmodel = params.textencoder;
          cleanPayload.clipgmodel = params.textencoder;
        }

        // Native SwarmUI ADetailer / Segmentation parameters
        if (params.yolomodelinternal) {
          cleanPayload.segmentmodel = params.yolomodelinternal;
          cleanPayload.yolomodelinternal = params.yolomodelinternal;
          cleanPayload.segmentsteps = params.segmentsteps || Math.max(10, Math.round(params.steps * 0.5));
          if (params.segmentthresholdmax !== undefined) {
            cleanPayload.segmentthresholdmax = params.segmentthresholdmax;
          }
        }

        ws.send(JSON.stringify(cleanPayload));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Capture intermediate step outputs emitted during multi-pass refinement
          if (msg.image && typeof msg.image === 'string' && !msg.image.startsWith('data:') && !msg.preview) {
            const cleanPath = msg.image.replace(/^\/?(View\/)?/, 'View/');
            const fullUrl = `/${cleanPath}`;
            if (!collectedImages.includes(fullUrl)) {
              collectedImages.push(fullUrl);
              onProgress({
                step: msg.step || 0,
                maxSteps: msg.max_steps || params.steps,
                percent: 100,
                intermediateImageUrl: fullUrl,
                stage: msg.status || 'Intermediate Pass'
              });
            }
          }

          if (Array.isArray(msg.images)) {
            msg.images.forEach((img: any) => {
              if (typeof img === 'string' && !img.startsWith('data:')) {
                const cleanPath = img.replace(/^\/?(View\/)?/, 'View/');
                const fullUrl = `/${cleanPath}`;
                if (!collectedImages.includes(fullUrl)) {
                  collectedImages.push(fullUrl);
                }
              }
            });
          }

          if (msg.step !== undefined || msg.overall_percent !== undefined) {
            const step = msg.step ?? Math.round((msg.overall_percent ?? 0) * params.steps);
            const max = msg.max_steps ?? params.steps;
            const percent = Math.round((msg.overall_percent ?? (max > 0 ? step / max : 0)) * 100);

            let previewUrl = undefined;
            const rawPreview = msg.preview || msg.previewUrl;
            if (rawPreview) {
              previewUrl = rawPreview.startsWith('data:') || rawPreview.startsWith('http')
                ? rawPreview
                : `/${rawPreview.replace(/^\/+/, '')}`;
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

          if (msg.complete === true || msg.status === 'complete' || msg.status === 'done') {
            if (!resolved && collectedImages.length > 0) {
              resolved = true;
              resolve({ imageUrl: collectedImages[collectedImages.length - 1], images: collectedImages });
            }
          }

          if (msg.error) {
            if (!resolved) {
              resolved = true;
              reject(new Error(msg.error));
            }
          }
        } catch (e) {
          console.warn('[SwarmClient] WS parse error:', e);
        }
      };

      ws.onerror = () => {
        if (!resolved) {
          resolved = true;
          reject(new Error('WebSocket connection to SwarmUI failed.'));
        }
      };

      ws.onclose = () => {
        if (!resolved) {
          resolved = true;
          if (collectedImages.length > 0) {
            resolve({ imageUrl: collectedImages[collectedImages.length - 1], images: collectedImages });
          } else {
            reject(new Error('WebSocket closed without generating output images.'));
          }
        }
      };
    });
  }
}

export const swarmClient = new SwarmClientClass();