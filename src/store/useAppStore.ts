import { create } from 'zustand';
import { swarmApi, ProgressPayload } from '../api/swarmClient';
import { danbooru } from '../api/danbooruService';

export interface ModelItem {
  name: string;
  previewUrl?: string;
  description?: string;
}

export interface ControlNetUnit {
  id: string;
  enabled: boolean;
  preprocessor: string;
  model: string;
  weight: number;
  guidanceStart: number;
  guidanceEnd: number;
  controlMode: 'balanced' | 'prompt_priority' | 'controlnet_priority';
  image: string | null;
}

export interface ADetailerUnit {
  id: string;
  enabled: boolean;
  model: string;
  confidence: number;
  maskBlur: number;
  denoiseStrength: number;
  maskDilation: number;
  inpaintWidth: number;
  inpaintHeight: number;
  prompt: string;
}

export interface HistoryItem {
  id: string;
  imageUrl: string;
  prompt: string;
  negativePrompt: string;
  params: {
    model: string;
    sampler: string;
    scheduler: string;
    steps: number;
    cfgScale: number;
    seed: number;
    width: number;
    height: number;
  };
  createdAt: string;
}

export const SWARM_VALID_SAMPLERS = [
  { id: 'euler', label: 'Euler' },
  { id: 'euler_ancestral', label: 'Euler Ancestral' },
  { id: 'er_sde', label: 'ER-SDE Solver' },
  { id: 'dpmpp_2m', label: 'DPM++ 2M' },
  { id: 'dpmpp_2m_sde', label: 'DPM++ 2M SDE' },
  { id: 'dpmpp_sde', label: 'DPM++ SDE' },
  { id: 'dpmpp_3m_sde', label: 'DPM++ 3M SDE' },
  { id: 'dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
  { id: 'ddim', label: 'DDIM' },
  { id: 'lcm', label: 'LCM' },
  { id: 'uni_pc', label: 'UniPC' },
  { id: 'res_multistep', label: 'Res Multistep' },
  { id: 'heun', label: 'Heun' }
];

export const SWARM_VALID_SCHEDULERS = [
  'normal',
  'karras',
  'exponential',
  'sgm_uniform',
  'simple',
  'ddim_uniform',
  'turbo',
  'align_your_steps'
];

interface AppState {
  // Global View Scaling
  uiScale: number;
  setUiScale: (s: number) => void;

  // Generation Core Params
  prompt: string;
  negativePrompt: string;
  model: string;
  vae: string;
  textEncoder: string;
  modelsList: ModelItem[];
  vaesList: string[];
  textEncodersList: string[];
  lorasList: ModelItem[];
  embeddingsList: ModelItem[];
  wildcardsList: string[];

  steps: number;
  cfgScale: number;
  width: number;
  height: number;
  seed: number;
  sampler: string;
  scheduler: string;

  // Addons & Multi-Units
  controlNetUnits: ControlNetUnit[];
  aDetailerUnits: ADetailerUnit[];

  // Progress & Execution State
  currentStep: number;
  maxSteps: number;
  progressPercent: number;
  isGenerating: boolean;
  activeImage: string | null;
  livePreview: string | null;
  metrics: {
    stage: string;
    modelLoadTime: number | null;
    samplingTime: number | null;
    totalTime: number;
    speed: number | null;
    eta: number | null;
  };

  // Gallery History
  history: HistoryItem[];

  // Danbooru Categories & Filter Search
  activeMacroCategory: string;
  activeSubCategory: string;
  pillSearchQuery: string;

  // Actions
  setPrompt: (p: string) => void;
  setNegativePrompt: (np: string) => void;
  setModel: (m: string) => void;
  setParams: (partial: Partial<AppState>) => void;
  updateControlNet: (id: string, partial: Partial<ControlNetUnit>) => void;
  updateADetailer: (id: string, partial: Partial<ADetailerUnit>) => void;
  setActiveMacroCategory: (c: string) => void;
  setActiveSubCategory: (s: string) => void;
  setPillSearchQuery: (q: string) => void;
  loadAssets: () => Promise<void>;
  enqueueAndProcess: () => Promise<void>;
  cancelGeneration: () => void;
}

let timerInterval: ReturnType<typeof setInterval> | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  uiScale: Number(localStorage.getItem('swarm_ui_scale') || 100),
  setUiScale: (scale: number) => {
    localStorage.setItem('swarm_ui_scale', String(scale));
    set({ uiScale: scale });
  },

  prompt: '',
  negativePrompt: 'worst quality, low quality, blurry, mutated, bad anatomy',
  model: '',
  vae: 'Automatic',
  textEncoder: 'Automatic',
  modelsList: [],
  vaesList: ['Automatic', 'None'],
  textEncodersList: ['Automatic'],
  lorasList: [],
  embeddingsList: [],
  wildcardsList: [],

  steps: 26,
  cfgScale: 5.0,
  width: 1024,
  height: 1024,
  seed: -1,
  sampler: 'euler',
  scheduler: 'normal',

  controlNetUnits: [
    {
      id: '1',
      enabled: false,
      preprocessor: 'canny',
      model: 'controlnet-canny-sdxl',
      weight: 1.0,
      guidanceStart: 0,
      guidanceEnd: 1,
      controlMode: 'balanced',
      image: null
    },
    {
      id: '2',
      enabled: false,
      preprocessor: 'depth',
      model: 'controlnet-depth-sdxl',
      weight: 1.0,
      guidanceStart: 0,
      guidanceEnd: 1,
      controlMode: 'balanced',
      image: null
    },
    {
      id: '3',
      enabled: false,
      preprocessor: 'openpose',
      model: 'controlnet-openpose-sdxl',
      weight: 1.0,
      guidanceStart: 0,
      guidanceEnd: 1,
      controlMode: 'balanced',
      image: null
    }
  ],

  aDetailerUnits: [
    {
      id: '1',
      enabled: false,
      model: 'face_yolov8n.pt',
      confidence: 0.3,
      maskBlur: 4,
      denoiseStrength: 0.4,
      maskDilation: 4,
      inpaintWidth: 512,
      inpaintHeight: 512,
      prompt: ''
    },
    {
      id: '2',
      enabled: false,
      model: 'hand_yolov8n.pt',
      confidence: 0.4,
      maskBlur: 4,
      denoiseStrength: 0.4,
      maskDilation: 4,
      inpaintWidth: 512,
      inpaintHeight: 512,
      prompt: ''
    }
  ],

  currentStep: 0,
  maxSteps: 26,
  progressPercent: 0,
  isGenerating: false,
  activeImage: null,
  livePreview: null,
  metrics: {
    stage: 'Idle',
    modelLoadTime: null,
    samplingTime: null,
    totalTime: 0,
    speed: null,
    eta: null
  },

  history: [],
  activeMacroCategory: 'All',
  activeSubCategory: 'All',
  pillSearchQuery: '',

  setPrompt: (prompt) => set({ prompt }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
  setModel: (model) => set({ model }),
  setParams: (partial) => set(partial),

  updateControlNet: (id, partial) =>
    set((s) => ({
      controlNetUnits: s.controlNetUnits.map((u) => (u.id === id ? { ...u, ...partial } : u))
    })),

  updateADetailer: (id, partial) =>
    set((s) => ({
      aDetailerUnits: s.aDetailerUnits.map((u) => (u.id === id ? { ...u, ...partial } : u))
    })),

  setActiveMacroCategory: (activeMacroCategory) => set({ activeMacroCategory, activeSubCategory: 'All' }),
  setActiveSubCategory: (activeSubCategory) => set({ activeSubCategory }),
  setPillSearchQuery: (pillSearchQuery) => set({ pillSearchQuery }),

  loadAssets: async () => {
    await danbooru.init();
    const [rawModels, vaes, rawLoras, rawEmbeddings, textEncoders, wildcards] = await Promise.all([
      swarmApi.listModelsDetailed('Stable-Diffusion'),
      swarmApi.listVAEs(),
      swarmApi.listModelsDetailed('LoRA'),
      swarmApi.listModelsDetailed('Embedding'),
      swarmApi.listTextEncoders(),
      swarmApi.listWildcards()
    ]);

    set({
      modelsList: rawModels,
      model: get().model || (rawModels[0]?.name ?? ''),
      vaesList: vaes,
      lorasList: rawLoras,
      embeddingsList: rawEmbeddings,
      textEncodersList: textEncoders,
      wildcardsList: wildcards
    });
  },

  cancelGeneration: () => {
    if (timerInterval) clearInterval(timerInterval);
    set({ isGenerating: false, livePreview: null });
  },

  enqueueAndProcess: async () => {
    const s = get();
    if (s.isGenerating || !s.model) return;

    if (timerInterval) clearInterval(timerInterval);
    const startPerf = performance.now();
    let sampleStartPerf: number | null = null;
    let modelLoadSeconds: number | null = null;

    set({
      isGenerating: true,
      currentStep: 0,
      maxSteps: s.steps,
      progressPercent: 0,
      livePreview: null,
      metrics: {
        stage: 'Loading Model',
        modelLoadTime: null,
        samplingTime: null,
        totalTime: 0,
        speed: null,
        eta: null
      }
    });

    timerInterval = setInterval(() => {
      const now = performance.now();
      const totalElapsed = Number(((now - startPerf) / 1000).toFixed(1));
      let sampleElapsed: number | null = null;
      let speed: number | null = null;
      let eta: number | null = null;

      if (sampleStartPerf) {
        sampleElapsed = Number(((now - sampleStartPerf) / 1000).toFixed(1));
        const curStep = get().currentStep;
        if (sampleElapsed > 0.2 && curStep > 0) {
          speed = Number((curStep / sampleElapsed).toFixed(2));
          const remSteps = Math.max(0, get().maxSteps - curStep);
          eta = Math.max(0, Number((remSteps / (speed || 1)).toFixed(1)));
        }
      }

      set({
        metrics: {
          ...get().metrics,
          totalTime: totalElapsed,
          samplingTime: sampleElapsed,
          speed,
          eta
        }
      });
    }, 100);

    swarmApi.generateWS(
      {
        prompt: s.prompt,
        negativeprompt: s.negativePrompt,
        model: s.model,
        vae: s.vae === 'Automatic' ? undefined : s.vae,
        textencoder: s.textEncoder === 'Automatic' ? undefined : s.textEncoder,
        steps: s.steps,
        cfgscale: s.cfgScale,
        width: s.width,
        height: s.height,
        seed: s.seed,
        sampler: s.sampler,
        scheduler: s.scheduler
      },
      (progress: ProgressPayload) => {
        const now = performance.now();
        if (progress.step > 0 && sampleStartPerf === null) {
          sampleStartPerf = now;
          modelLoadSeconds = Number(((now - startPerf) / 1000).toFixed(2));
        }

        set({
          currentStep: progress.step,
          maxSteps: progress.maxSteps,
          progressPercent: progress.percent,
          livePreview: progress.previewUrl || get().livePreview,
          metrics: {
            ...get().metrics,
            stage: progress.stage || (progress.step === 0 ? 'Loading Model' : 'Sampling'),
            modelLoadTime: modelLoadSeconds
          }
        });
      },
      (imageUrls: string[]) => {
        if (timerInterval) clearInterval(timerInterval);
        const totalSec = Number(((performance.now() - startPerf) / 1000).toFixed(2));
        const finalUrl = imageUrls[0] || null;

        if (finalUrl) {
          const histItem: HistoryItem = {
            id: crypto.randomUUID(),
            imageUrl: finalUrl,
            prompt: s.prompt,
            negativePrompt: s.negativePrompt,
            params: {
              model: s.model,
              sampler: s.sampler,
              scheduler: s.scheduler,
              steps: s.steps,
              cfgScale: s.cfgScale,
              seed: s.seed,
              width: s.width,
              height: s.height
            },
            createdAt: new Date().toLocaleTimeString()
          };
          set((state) => ({ history: [histItem, ...state.history] }));
        }

        set({
          activeImage: finalUrl,
          livePreview: null,
          isGenerating: false,
          progressPercent: 100,
          metrics: { ...get().metrics, stage: 'Done', totalTime: totalSec, eta: 0 }
        });
      },
      (err: string) => {
        console.error('[AppStore] Generation failed:', err);
        if (timerInterval) clearInterval(timerInterval);
        set({ isGenerating: false, metrics: { ...get().metrics, stage: 'Failed' } });
      }
    );
  }
}));