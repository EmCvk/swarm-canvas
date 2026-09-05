import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Play, Film, Settings2, Upload, CheckCircle2, AlertTriangle, Copy, RotateCcw, ExternalLink } from 'lucide-react';

const STORAGE_KEY = 'swarm-animation-lab-v1';

type Engine = 'AnimateDiff' | 'Wan / I2V' | 'Custom ComfyUI Workflow';
type Fit = 'contain' | 'cover';

interface AnimationSettings {
  engine: Engine;
  comfyUrl: string;
  frames: number;
  fps: number;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  seed: number;
  loop: boolean;
  output: 'MP4' | 'WEBP' | 'GIF';
  prompt: string;
  negative: string;
  comfySourceImage: string;
  workflow: string;
}

const DEFAULTS: AnimationSettings = {
  engine: 'Custom ComfyUI Workflow',
  comfyUrl: 'http://127.0.0.1:8188',
  frames: 16,
  fps: 8,
  width: 512,
  height: 512,
  steps: 20,
  cfg: 5,
  seed: -1,
  loop: true,
  output: 'WEBP',
  prompt: '',
  negative: 'worst quality, low quality, flicker, unstable face, deformed hands',
  comfySourceImage: '',
  workflow: ''
};

function safeLoad(): AnimationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

function replaceWorkflowTokens(value: unknown, s: AnimationSettings, sourceImage: string): unknown {
  if (typeof value === 'string') {
    return value
      .replaceAll('__PROMPT__', s.prompt)
      .replaceAll('__NEGATIVE__', s.negative)
      .replaceAll('__SEED__', String(s.seed))
      .replaceAll('__WIDTH__', String(s.width))
      .replaceAll('__HEIGHT__', String(s.height))
      .replaceAll('__FRAMES__', String(s.frames))
      .replaceAll('__FPS__', String(s.fps))
      .replaceAll('__SOURCE_IMAGE__', sourceImage);
  }
  if (Array.isArray(value)) return value.map((x) => replaceWorkflowTokens(x, s, sourceImage));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, replaceWorkflowTokens(v, s, sourceImage)]));
  }
  return value;
}

async function queueComfyWorkflow(comfyUrl: string, workflowText: string, settings: AnimationSettings, sourceImage: string) {
  const parsed = JSON.parse(workflowText);
  const prepared = replaceWorkflowTokens(parsed, settings, sourceImage);
  const prompt = (prepared && typeof prepared === 'object' && 'prompt' in prepared)
    ? (prepared as { prompt: unknown }).prompt
    : prepared;
  if (!prompt || typeof prompt !== 'object') throw new Error('Workflow must be a ComfyUI API-format prompt JSON object, or an object containing a "prompt" field.');

  const clientId = crypto.randomUUID();
  const body = { prompt, client_id: clientId };
  const response = await fetch(`${comfyUrl.replace(/\/$/, '')}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.error || `ComfyUI returned HTTP ${response.status}`);
  return data;
}

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <label className="block space-y-1.5">
    <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{label}</span>
    {children}
    {hint && <span className="block text-[10px] text-zinc-600">{hint}</span>}
  </label>
);

export const AnimationLab: React.FC = () => {
  const store = useAppStore();
  const [settings, setSettings] = useState<AnimationSettings>(safeLoad);
  const [source, setSource] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'ready' | 'error' | 'queued'>('idle');
  const [statusText, setStatusText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fit, setFit] = useState<Fit>('contain');

  const activeSource = source || store.activeImage || (store.history[0]?.imageUrl ?? null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);

  useEffect(() => {
    setSettings((s) => ({ ...s, prompt: s.prompt || store.prompt, negative: s.negative || store.negativePrompt }));
  }, [store.prompt, store.negativePrompt]);

  const update = <K extends keyof AnimationSettings>(key: K, value: AnimationSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const sourcePresets = useMemo(() => [
    { label: 'Current canvas', value: store.activeImage },
    ...store.history.slice(0, 8).map((h) => ({ label: h.prompt.slice(0, 48) || h.id, value: h.imageUrl }))
  ].filter((x) => !!x.value), [store.activeImage, store.history]);

  const testConnection = async () => {
    setStatus('checking');
    setStatusText('Checking ComfyUI…');
    try {
      const response = await fetch(`${settings.comfyUrl.replace(/\/$/, '')}/system_stats`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatus('ready');
      setStatusText('ComfyUI is reachable.');
    } catch (error) {
      setStatus('error');
      setStatusText(error instanceof Error ? error.message : 'Could not reach ComfyUI.');
    }
  };

  const queueWorkflow = async () => {
    if (!settings.workflow.trim()) {
      setStatus('error');
      setStatusText('Paste a ComfyUI API-format workflow first.');
      return;
    }
    setBusy(true);
    setStatus('checking');
    setStatusText('Submitting workflow…');
    try {
      const result = await queueComfyWorkflow(settings.comfyUrl, settings.workflow, settings, settings.comfySourceImage || '');
      setStatus('queued');
      setStatusText(`Queued in ComfyUI${result?.prompt_id ? ` · ${result.prompt_id}` : ''}`);
    } catch (error) {
      setStatus('error');
      setStatusText(error instanceof Error ? error.message : 'Failed to queue workflow.');
    } finally {
      setBusy(false);
    }
  };

  const copyTokens = async () => {
    const text = '__PROMPT__  __NEGATIVE__  __SEED__  __WIDTH__  __HEIGHT__  __FRAMES__  __FPS__  __SOURCE_IMAGE__';
    await navigator.clipboard?.writeText(text);
    setStatusText('Placeholder tokens copied.');
  };

  const reset = () => setSettings({ ...DEFAULTS, prompt: store.prompt, negative: store.negativePrompt });

  return (
    <div className="h-full w-full overflow-hidden bg-[#090a0d] text-zinc-100 flex flex-col">
      <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-[#252933] bg-[#101218]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center">
            <Film className="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <div className="text-sm font-semibold">Animation Lab</div>
            <div className="text-[10px] text-zinc-500">Anima source → ComfyUI animation workflow</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reset} className="px-2.5 py-1.5 rounded-md border border-[#2a2e38] text-xs text-zinc-300 hover:bg-[#1b1e27] flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" />Reset</button>
          <button onClick={testConnection} disabled={busy} className="px-2.5 py-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 text-xs text-cyan-200 hover:bg-cyan-500/15 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Test ComfyUI</button>
          <button onClick={queueWorkflow} disabled={busy} className="px-3 py-1.5 rounded-md bg-cyan-500 text-zinc-950 text-xs font-semibold hover:bg-cyan-400 disabled:opacity-50 flex items-center gap-1.5"><Play className="w-3.5 h-3.5" />{busy ? 'Queuing…' : 'Queue Animation'}</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(260px,1fr)_360px]">
        <div className="min-w-0 min-h-0 flex flex-col border-r border-[#252933]">
          <div className="flex-1 min-h-0 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,#141923_0%,#090a0d_70%)]">
            {activeSource ? (
              <div className="relative max-h-full max-w-full">
                <img src={activeSource} alt="Animation source" className={`max-h-[calc(100vh-170px)] max-w-full object-${fit} rounded-xl border border-[#303541] shadow-2xl`} />
                <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/70 border border-white/10 text-[10px] text-zinc-300 backdrop-blur">SOURCE · ANIMA IMAGE</div>
              </div>
            ) : (
              <div className="text-center text-zinc-600">
                <Film className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <div className="text-sm">No source image selected</div>
                <div className="text-xs mt-1">Generate an image in Canvas first, or select one from history.</div>
              </div>
            )}
          </div>
          <div className="shrink-0 px-5 py-3 border-t border-[#252933] flex items-center gap-2 overflow-x-auto">
            {sourcePresets.slice(0, 9).map((item, i) => (
              <button key={`${item.value}-${i}`} onClick={() => setSource(item.value || null)} className="shrink-0 w-12 h-12 rounded-md overflow-hidden border border-[#303541] hover:border-cyan-400/60 bg-black/30">
                <img src={item.value || ''} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
            <label className="shrink-0 w-12 h-12 rounded-md border border-dashed border-[#3a3f4c] hover:border-cyan-400/50 flex items-center justify-center cursor-pointer text-zinc-500 hover:text-cyan-300" title="Use an image from this machine">
              <Upload className="w-4 h-4" />
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setSource(typeof reader.result === 'string' ? reader.result : null);
                reader.readAsDataURL(file);
              }} />
            </label>
            <button onClick={() => setFit((x) => x === 'contain' ? 'cover' : 'contain')} className="ml-auto text-[10px] text-zinc-500 hover:text-zinc-300">Fit: {fit}</button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-4 space-y-4">
          <section className="rounded-xl border border-[#2a2e38] bg-[#101218] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold"><Settings2 className="w-4 h-4 text-cyan-300" /> Engine & Connection</div>
            <Field label="Engine">
              <select value={settings.engine} onChange={(e) => update('engine', e.target.value as Engine)} className="w-full bg-[#171a22] border border-[#2c313d] rounded-lg px-3 py-2 text-xs outline-none focus:border-cyan-500/60">
                <option>Custom ComfyUI Workflow</option>
                <option>AnimateDiff</option>
                <option>Wan / I2V</option>
              </select>
            </Field>
            <Field label="ComfyUI URL" hint="ComfyUI's local API is normally http://127.0.0.1:8188">
              <input value={settings.comfyUrl} onChange={(e) => update('comfyUrl', e.target.value)} className="w-full bg-[#171a22] border border-[#2c313d] rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-cyan-500/60" />
            </Field>
            <Field label="ComfyUI source image filename" hint="Use a filename/path that exists in ComfyUI's input folder. __SOURCE_IMAGE__ is replaced in the workflow.">
              <input value={settings.comfySourceImage} onChange={(e) => update('comfySourceImage', e.target.value)} placeholder="example.png" className="w-full bg-[#171a22] border border-[#2c313d] rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-cyan-500/60" />
            </Field>
          </section>

          <section className="rounded-xl border border-[#2a2e38] bg-[#101218] p-4 space-y-3">
            <div className="text-xs font-semibold">Animation</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Frames"><input type="number" min={4} max={256} value={settings.frames} onChange={(e) => update('frames', Number(e.target.value))} className="num" /></Field>
              <Field label="FPS"><input type="number" min={1} max={60} value={settings.fps} onChange={(e) => update('fps', Number(e.target.value))} className="num" /></Field>
              <Field label="Width"><input type="number" step={64} min={256} max={2048} value={settings.width} onChange={(e) => update('width', Number(e.target.value))} className="num" /></Field>
              <Field label="Height"><input type="number" step={64} min={256} max={2048} value={settings.height} onChange={(e) => update('height', Number(e.target.value))} className="num" /></Field>
              <Field label="Steps"><input type="number" min={1} max={100} value={settings.steps} onChange={(e) => update('steps', Number(e.target.value))} className="num" /></Field>
              <Field label="CFG"><input type="number" min={0} max={30} step={0.5} value={settings.cfg} onChange={(e) => update('cfg', Number(e.target.value))} className="num" /></Field>
              <Field label="Seed"><input type="number" value={settings.seed} onChange={(e) => update('seed', Number(e.target.value))} className="num" /></Field>
              <Field label="Output"><select value={settings.output} onChange={(e) => update('output', e.target.value as AnimationSettings['output'])} className="num"><option>WEBP</option><option>MP4</option><option>GIF</option></select></Field>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={settings.loop} onChange={(e) => update('loop', e.target.checked)} /> Loop output</label>
            <div className="text-[10px] text-zinc-600">For a 4 GB RTX 3050, start around 384–512px, 8–16 frames and batch 1 in the ComfyUI workflow.</div>
          </section>

          <section className="rounded-xl border border-[#2a2e38] bg-[#101218] p-4 space-y-3">
            <div className="text-xs font-semibold">Prompt</div>
            <Field label="Motion prompt">
              <textarea value={settings.prompt} onChange={(e) => update('prompt', e.target.value)} rows={4} className="w-full resize-y bg-[#171a22] border border-[#2c313d] rounded-lg px-3 py-2 text-xs outline-none focus:border-cyan-500/60" placeholder="subtle head movement, blinking, hair moving in the wind, gentle camera motion" />
            </Field>
            <Field label="Negative prompt"><textarea value={settings.negative} onChange={(e) => update('negative', e.target.value)} rows={3} className="w-full resize-y bg-[#171a22] border border-[#2c313d] rounded-lg px-3 py-2 text-xs outline-none focus:border-cyan-500/60" /></Field>
          </section>

          <section className="rounded-xl border border-[#2a2e38] bg-[#101218] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold">ComfyUI API Workflow</div>
              <button onClick={copyTokens} className="text-[10px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1"><Copy className="w-3 h-3" />Tokens</button>
            </div>
            <textarea value={settings.workflow} onChange={(e) => update('workflow', e.target.value)} rows={12} spellCheck={false} className="w-full resize-y bg-[#0b0d11] border border-[#2c313d] rounded-lg px-3 py-2 text-[10px] font-mono leading-4 outline-none focus:border-cyan-500/60" placeholder={'Paste the API-format JSON exported by ComfyUI.\n\nSupported replacement tokens:\n__PROMPT__ __NEGATIVE__ __SEED__ __WIDTH__ __HEIGHT__ __FRAMES__ __FPS__ __SOURCE_IMAGE__'} />
            <div className="flex items-start gap-2 text-[10px] text-zinc-500"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400/80" />The tab queues your workflow; it does not guess node IDs. Export one working AnimateDiff/Wan workflow from ComfyUI and add the placeholders where you want these controls injected.</div>
          </section>

          <div className={`rounded-lg border px-3 py-2 text-[11px] ${status === 'error' ? 'border-rose-500/30 bg-rose-500/5 text-rose-300' : status === 'queued' || status === 'ready' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : 'border-[#2a2e38] bg-[#101218] text-zinc-400'}`}>
            {statusText || 'Ready.'}
          </div>

          <button onClick={() => window.open(settings.comfyUrl, '_blank')} className="w-full py-2 rounded-lg border border-[#2a2e38] text-xs text-zinc-400 hover:text-zinc-200 hover:bg-[#181b23] flex items-center justify-center gap-2"><ExternalLink className="w-3.5 h-3.5" />Open ComfyUI</button>
        </div>
      </div>
      <style>{`.num{width:100%;background:#171a22;border:1px solid #2c313d;border-radius:.5rem;padding:.5rem .75rem;font-size:.75rem;outline:none}.num:focus{border-color:rgb(6 182 212 / .6)}`}</style>
    </div>
  );
};

export default AnimationLab;
