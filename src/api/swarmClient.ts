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

/**
 * Path-aware deduplication that keeps directory structure intact
 * (prevents qwen/vae from colliding with standard vae)
 */
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

  /**
   * Forces SwarmUI to re-scan all disk folders for newly added models/VAEs/encoders
   */
  public async triggerRefresh(): Promise<void> {
    const session = await getSession();
    try {
      await fetch('/API/TriggerRefresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session })
      });
    } catch {}
    try {
      await fetch('/API/RefreshModels', {
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

          let triggerWords: string[] | undefined = undefined;
          if (Array.isArray(item.trigger_words)) {
            triggerWords = item.trigger_words;
          } else if (typeof item.trigger_phrase === 'string' && item.trigger_phrase.trim()) {
            triggerWords = item.trigger_phrase.split(',').map((s: string) => s.trim()).filter(Boolean);
          } else if (Array.isArray(item.metadata?.trigger_words)) {
            triggerWords = item.metadata.trigger_words;
          }

          return {
            name: item.name || item.data || item.title || String(item),
            previewUrl,
            description: item.description || item.metadata?.description || undefined,
            triggerWords
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

  /**
   * Discovers all VAE files and deduplicates without collapsing subdirectories
   */
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

    try {
      const t2i = await this.getT2IParams();
      if (t2i?.list && Array.isArray(t2i.list)) {
        const vaeParam = t2i.list.find((p: any) =>
          (p.id || '').toLowerCase() === 'vae' || (p.name || '').toLowerCase() === 'vae'
        );
        if (vaeParam?.values && Array.isArray(vaeParam.values)) {
          vaeParam.values.forEach((v: string) => {
            if (v && v !== 'Automatic' && v !== 'None') rawVaes.push(v);
          });
        }
      }
    } catch {}

    return deduplicateModelList(rawVaes);
  }

  /**
   * Resolves Text Encoders and CLIP models (qwen_3_06b_base, etc.)
   */
  public async listTextEncoders(): Promise<string[]> {
    const rawEncoders: string[] = ['Automatic', 'None'];

    // 1. Scan /API/ListT2IParams parameter tables where CLIP / encoders are mapped
    try {
      const t2i = await this.getT2IParams();
      if (t2i) {
        const topLevel = t2i.text_encoders || t2i.clips || t2i.clip_models || [];
        if (Array.isArray(topLevel)) {
          topLevel.forEach((item: any) => {
            const name = typeof item === 'string' ? item : item.name || item.data;
            if (name) rawEncoders.push(name);
          });
        }

        if (Array.isArray(t2i.list)) {
          for (const p of t2i.list) {
            const id = (p.id || '').toLowerCase();
            const name = (p.name || '').toLowerCase();
            const isEncoder =
              id.includes('clip') ||
              id.includes('textencoder') ||
              id.includes('text_encoder') ||
              name.includes('clip') ||
              name.includes('text encoder') ||
              name.includes('encoder');

            if (isEncoder && !id.includes('clipvision') && !id.includes('controlnet')) {
              if (Array.isArray(p.values)) {
                p.values.forEach((v: string) => {
                  if (v && v !== 'Automatic' && v !== 'None') rawEncoders.push(v);
                });
              }

              // If parameter points to a specific subtype model pool
              if (p.subtype && typeof p.subtype === 'string') {
                try {
                  const subModels = await this.listModels(p.subtype);
                  subModels.forEach((m) => {
                    if (m.name && m.name !== 'Automatic' && m.name !== 'None') {
                      rawEncoders.push(m.name);
                    }
                  });
                } catch {}
              }
            }
          }
        }
      }
    } catch {}

    // 2. Direct query on SwarmUI model handlers
    const directTypes = ['CLIP', 'TextEncoder', 'TextEncoders'];
    for (const dt of directTypes) {
      try {
        const models = await this.listModels(dt);
        if (models.length > 0) {
          models.forEach((m) => {
            if (m.name && m.name !== 'Automatic' && m.name !== 'None') {
              rawEncoders.push(m.name);
            }
          });
        }
      } catch {}
    }

    return deduplicateModelList(rawEncoders);
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

          if (msg.image && typeof msg.image === 'string' && !msg.image.startsWith('data:') && !msg.preview) {
            const cleanPath = msg.image.replace(/^\/?(View\/)?/, 'View/');
            collectedImages.push(`/${cleanPath}`);
          }

          if (Array.isArray(msg.images)) {
            msg.images.forEach((img: any) => {
              if (typeof img === 'string' && !img.startsWith('data:')) {
                const cleanPath = img.replace(/^\/?(View\/)?/, 'View/');
                collectedImages.push(`/${cleanPath}`);
              }
            });
          }

          if (msg.complete === true || msg.status === 'complete' || msg.status === 'done') {
            if (!resolved && collectedImages.length > 0) {
              resolved = true;
              resolve({ imageUrl: collectedImages[0], images: collectedImages });
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

      ws.onclose = (e) => {
        if (!resolved) {
          resolved = true;
          if (collectedImages.length > 0) {
            resolve({ imageUrl: collectedImages[0], images: collectedImages });
          } else if (e.code === 1000) {
            reject(new Error('Generation ended without an output image payload.'));
          } else {
            reject(new Error(`WebSocket closed unexpectedly (code: ${e.code}).`));
          }
        }
      };
    });
  }
}

export const swarmClient = new SwarmClientClass();