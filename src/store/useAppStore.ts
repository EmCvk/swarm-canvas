import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { swarmClient, SwarmProgressData } from '../api/swarmClient';

export interface ModelItem {
  name: string;
  previewUrl?: string;
  triggerWords?: string[];
  description?: string;
}

export interface HistoryItem {
  id: string;
  batchId?: string;
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  createdAt: string;
  timestamp?: number;
  isFavorite?: boolean;
  params: {
    model: string;
    steps: number;
    cfgScale?: number;
    seed?: number;
    width?: number;
    height?: number;
    sampler?: string;
    scheduler?: string;
  };
}

export interface ControlNetUnit {
  id: string;
  enabled: boolean;
  preprocessor: string;
  controlMode: 'balanced' | 'prompt_priority' | 'controlnet_priority';
  weight: number;
  image?: string;
}

export interface ADetailerUnit {
  id: string;
  enabled: boolean;
  model: string;
  confidence: number;
  denoiseStrength: number;
}

export interface QueueItem {
  id: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed: number;
  sampler: string;
  scheduler: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  progress?: number;
  step?: number;
  maxSteps?: number;
  createdAt: number;
}

export interface AppSettings {
  activePreset: 'Default' | 'Prompt Engineer' | 'Studio Canvas' | 'Multi-ControlNet';
  bottomPanelHeight: number;
  sectionScales: {
    pills: number;
    params: number;
    extranetworks: number;
    history: number;
    controlnet: number;
    adetailer: number;
    imagesearch: number;
  };
  hideProgressBar: boolean;
  categorizationMode: 'prompt_flow' | 'danbooru_types' | 'danbooru_groups';
  tagSortOrder: 'alphabetical' | 'popularity';
  autoInjectLoraTrigger: boolean;
  showTagPlusPrefix: boolean;
  showTagPostCounts: boolean;
  useUnderscores: boolean;
  tagClickWeightStep: number;
  preservePromptsOnReload: boolean;
  randomizeSeedOnGen: boolean;
  autoSaveLayout: boolean;
  maxHistoryCount: number;
  defaultLoraWeight?: number;
  separateBatches: boolean;
  autoSwapToLatest: boolean;
  playCompletionSound: boolean;
  completionSoundData: string | null;
}

export const SWARM_VALID_SAMPLERS = [
  { id: 'euler', label: 'Euler' },
  { id: 'euler_ancestral', label: 'Euler a' },
  { id: 'heun', label: 'Heun' },
  { id: 'dpm_2', label: 'DPM2' },
  { id: 'dpm_2_ancestral', label: 'DPM2 a' },
  { id: 'lms', label: 'LMS' },
  { id: 'dpm_fast', label: 'DPM fast' },
  { id: 'dpm_adaptive', label: 'DPM adaptive' },
  { id: 'dpmpp_2s_ancestral', label: 'DPM++ 2S a' },
  { id: 'dpmpp_sde', label: 'DPM++ SDE' },
  { id: 'dpmpp_2m', label: 'DPM++ 2M' },
  { id: 'dpmpp_2m_sde', label: 'DPM++ 2M SDE' },
  { id: 'ddim', label: 'DDIM' },
  { id: 'uni_pc', label: 'UniPC' },
];

export const SWARM_VALID_SCHEDULERS = [
  'normal',
  'karras',
  'exponential',
  'sgm_uniform',
  'simple',
  'ddim_uniform',
  'turbo',
  'align_your_steps',
];

export interface AppState {
  serverUrl: string;
  sessionId: string | null;
  isConnected: boolean;

  prompt: string;
  negativePrompt: string;
  activeMacroCategory: string;
  activeSubCategory: string;
  pillSearchQuery: string;
  hideProgressBar: boolean;
  model: string;
  modelsList: ModelItem[];
  lorasList: ModelItem[];
  embeddingsList: ModelItem[];
  wildcardsList: string[];
  vae: string;
  vaesList: string[];
  textEncoder: string;
  textEncodersList: string[];

  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed: number;
  sampler: string;
  scheduler: string;
  batchCount: number;

  activeImage: string | null;
  livePreview: string | null;
  comparisonImage: string | null;
  isComparing: boolean;
  compareSplit: number;

  currentStep: number;
  maxSteps: number;
  progressPercent: number;
  metrics: {
    stage: string;
    modelLoadTime: number | null;
    speed: number | null;
    eta: number | null;
    totalTime: number;
  };

  isGenerating: boolean;
  queue: QueueItem[];
  activeJob: QueueItem | null;

  controlNetUnits: ControlNetUnit[];
  aDetailerUnits: ADetailerUnit[];
  history: HistoryItem[];
  settings: AppSettings;
  sessionStartTime: number;

  setServerUrl: (url: string) => void;
  setSessionId: (id: string | null) => void;
  setPrompt: (p: string) => void;
  setNegativePrompt: (np: string) => void;
  setActiveMacroCategory: (c: string) => void;
  setActiveSubCategory: (c: string) => void;
  setPillSearchQuery: (q: string) => void;

  toggleFavorite: (id: string) => void;
  currentQueueBatchId: string | null;

  setModel: (m: string) => void;
  setParams: (params: Partial<AppState>) => void;
  loadAssets: () => Promise<void>;
  syncCivitaiMetadata: (
    category: string,
    onProgress: (current: number, total: number, name: string) => void
  ) => Promise<void>;

  setIsComparing: (b: boolean) => void;
  setComparisonImage: (url: string | null) => void;
  setCompareSplit: (n: number) => void;

  enqueueAndProcess: () => Promise<void>;
  cancelGeneration: () => void;
  cancelQueuedJob: (id: string) => void;
  clearQueue: () => void;

  useGenerationParams: (item: HistoryItem) => void;
  updateControlNet: (id: string, updates: Partial<ControlNetUnit>) => void;
  updateADetailer: (id: string, updates: Partial<ADetailerUnit>) => void;
  updateSettings: (s: Partial<AppSettings>) => void;
  setSectionScale: (section: keyof AppSettings['sectionScales'], scale: number) => void;
  setCategorizationMode: (mode: AppSettings['categorizationMode']) => void;
  deleteHistoryItem: (id: string) => void;
  removeFromSessionHistory: (id: string) => void;

  activeContextMenu: { x: number; y: number; title: string; items: any[] } | null;
  setActiveContextMenu: (menu: { x: number; y: number; title: string; items: any[] } | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      serverUrl: 'http://localhost:7801',
      sessionId: null,
      isConnected: false,
      sessionStartTime: Date.now(),
      hideProgressBar: false,

      prompt: 'masterpiece, best quality, 1girl, solo',
      negativePrompt: 'worst quality, low quality, bad anatomy, blurry',
      activeMacroCategory: '1. Subject & Count',
      activeSubCategory: 'All',
      pillSearchQuery: '',

      model: '',
      modelsList: [],
      lorasList: [],
      embeddingsList: [],
      wildcardsList: [],
      vae: 'Automatic',
      vaesList: ['Automatic', 'None'],
      textEncoder: 'Automatic',
      textEncodersList: ['Automatic'],

      width: 832,
      height: 1216,
      steps: 28,
      cfgScale: 6.5,
      seed: -1,
      sampler: 'euler_ancestral',
      scheduler: 'normal',
      batchCount: 1,

      activeImage: null,
      livePreview: null,
      comparisonImage: null,
      isComparing: false,
      compareSplit: 50,

      currentStep: 0,
      maxSteps: 28,
      progressPercent: 0,
      metrics: {
        stage: 'Idle',
        modelLoadTime: null,
        speed: null,
        eta: null,
        totalTime: 0,
      },

      isGenerating: false,
      queue: [],
      activeJob: null,

      controlNetUnits: [
        { id: '1', enabled: false, preprocessor: 'canny', controlMode: 'balanced', weight: 1.0 },
        { id: '2', enabled: false, preprocessor: 'depth', controlMode: 'balanced', weight: 1.0 },
        { id: '3', enabled: false, preprocessor: 'openpose', controlMode: 'balanced', weight: 1.0 },
      ],
      aDetailerUnits: [
        { id: '1', enabled: false, model: 'face_yolov8n.pt', confidence: 0.3, denoiseStrength: 0.4 },
        { id: '2', enabled: false, model: 'hand_yolov8n.pt', confidence: 0.3, denoiseStrength: 0.4 },
      ],
      history: [],
      settings: {
        activePreset: 'Default',
        bottomPanelHeight: 340,
        sectionScales: {
          pills: 100,
          params: 100,
          extranetworks: 100,
          history: 100,
          controlnet: 100,
          adetailer: 100,
          imagesearch: 100,
        },
        categorizationMode: 'prompt_flow',
        tagSortOrder: 'alphabetical',
        autoInjectLoraTrigger: true,
        showTagPlusPrefix: true,
        showTagPostCounts: true,
        useUnderscores: false,
        tagClickWeightStep: 0.2,
        preservePromptsOnReload: true,
        randomizeSeedOnGen: true,
        autoSaveLayout: true,
        maxHistoryCount: 50,
        defaultLoraWeight: 1.0,
        separateBatches: true,
        autoSwapToLatest: true,
        hideProgressBar: false,
        playCompletionSound: true,
        completionSoundData: null,
      },
      
      activeContextMenu: null,
      setActiveContextMenu: (activeContextMenu) => set({ activeContextMenu }),

      toggleFavorite: (id: string) =>
        set((s) => ({
          history: s.history.map((item) =>
            item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
          ),
        })),

      setServerUrl: (url) => set({ serverUrl: url }),
      setSessionId: (id) => set({ sessionId: id }),
      setPrompt: (prompt) => set({ prompt }),
      setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
      setActiveMacroCategory: (activeMacroCategory) => set({ activeMacroCategory }),
      setActiveSubCategory: (activeSubCategory) => set({ activeSubCategory }),
      setPillSearchQuery: (pillSearchQuery) => set({ pillSearchQuery }),

      setModel: (model) => set({ model }),
      setParams: (params) => set((s) => ({ ...s, ...params })),

      deleteHistoryItem: (id) =>
        set((s) => ({
          history: s.history.filter((h) => h.id !== id),
          activeImage: s.activeImage === s.history.find((h) => h.id === id)?.imageUrl ? null : s.activeImage,
        })),

      removeFromSessionHistory: (id) =>
        set((s) => ({
          history: s.history.filter((h) => h.id !== id),
        })),

      loadAssets: async () => {
        try {
          const [models, loras, embeddings, wildcards] = await Promise.all([
            swarmClient.listModels('Stable-Diffusion'),
            swarmClient.listModels('LoRA'),
            swarmClient.listModels('Embedding'),
            swarmClient.listModels('Wildcards'),
          ]);

          const server = get().serverUrl.replace(/\/+$/, '');

          const formatItems = (list: any[]) =>
            list.map((m: any) => ({
              name: typeof m === 'string' ? m : m.name,
              previewUrl: m.preview_image
                ? m.preview_image.startsWith('data:')
                  ? m.preview_image
                  : `${server}/${m.preview_image.replace(/^\/+/, '')}`
                : undefined,
              description: m.description,
            }));

          set((s) => ({
            modelsList: formatItems(models),
            lorasList: formatItems(loras),
            embeddingsList: formatItems(embeddings),
            wildcardsList: wildcards.map((w: any) => (typeof w === 'string' ? w : w.name)),
            model: s.model || (models.length > 0 ? (typeof models[0] === 'string' ? models[0] : models[0].name) : ''),
          }));
        } catch (err) {
          console.error('Failed to load asset catalogs:', err);
        }
      },

      syncCivitaiMetadata: async (_cat, onProgress) => {
        const state = get();
        const items = state.modelsList;
        for (let i = 0; i < items.length; i++) {
          if (onProgress) onProgress(i + 1, items.length, items[i].name);
          await new Promise((r) => setTimeout(r, 40));
        }
      },

      setIsComparing: (isComparing) => set({ isComparing }),
      setComparisonImage: (comparisonImage) => set({ comparisonImage }),
      setCompareSplit: (compareSplit) => set({ compareSplit }),

      currentQueueBatchId: null,

      enqueueAndProcess: async () => {
        const state = get();
        let targetModel = state.model;
        if (!targetModel && state.modelsList.length > 0) {
          targetModel = state.modelsList[0].name;
          set({ model: targetModel });
        }

        const effectiveSeed = state.seed === -1 ? Math.floor(Math.random() * 2147483647) : state.seed;

        const newJob: QueueItem = {
          id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          prompt: state.prompt,
          negativePrompt: state.negativePrompt,
          model: targetModel,
          width: state.width,
          height: state.height,
          steps: state.steps,
          cfgScale: state.cfgScale,
          seed: effectiveSeed,
          sampler: state.sampler,
          scheduler: state.scheduler,
          status: 'queued',
          progress: 0,
          step: 0,
          maxSteps: state.steps,
          createdAt: Date.now(),
        };

        const activeBatchId = get().currentQueueBatchId || `batch-${Date.now()}`;
        set((s) => ({
          queue: [...s.queue, newJob],
          currentQueueBatchId: activeBatchId,
        }));

        if (state.isGenerating) return;

        const processQueue = async () => {
          const current = get();
          if (current.queue.length === 0) {
            set({ isGenerating: false, activeJob: null, currentQueueBatchId: null });
            return;
          }

          const [nextJob, ...rest] = current.queue;
          set({
            queue: rest,
            activeJob: { ...nextJob, status: 'running' },
            isGenerating: true,
            currentStep: 0,
            maxSteps: nextJob.steps,
            progressPercent: 0,
            metrics: { ...current.metrics, stage: 'Obtaining Session...', totalTime: 0 },
          });

          const startTime = Date.now();

          try {
            const freshSessionId = await swarmClient.getNewSession();
            set({ sessionId: freshSessionId });

            const res = await swarmClient.generateImage(
              {
                session_id: freshSessionId,
                prompt: nextJob.prompt,
                negativeprompt: nextJob.negativePrompt,
                model: nextJob.model,
                width: nextJob.width,
                height: nextJob.height,
                steps: nextJob.steps,
                cfgscale: nextJob.cfgScale,
                seed: nextJob.seed,
                sampler: nextJob.sampler,
                scheduler: nextJob.scheduler,
              },
              (p: SwarmProgressData) => {
                set((s) => ({
                  currentStep: p.step || s.currentStep,
                  maxSteps: p.max_steps || s.maxSteps,
                  progressPercent: typeof p.percent === 'number' ? p.percent : s.progressPercent,
                  livePreview: p.preview || s.livePreview,
                  metrics: {
                    stage: p.stage || 'Sampling',
                    modelLoadTime: s.metrics.modelLoadTime,
                    speed: p.speed ?? s.metrics.speed,
                    eta: p.eta ?? s.metrics.eta,
                    totalTime: Number(((Date.now() - startTime) / 1000).toFixed(1)),
                  },
                }));
              }
            );

            const duration = Number(((Date.now() - startTime) / 1000).toFixed(1));

            let rawImages: string[] = [];
            if (Array.isArray((res as any)?.images) && (res as any).images.length > 0) {
              rawImages = (res as any).images;
            } else if ((res as any)?.image) {
              rawImages = [(res as any).image];
            } else if ((res as any)?.imageUrl) {
              rawImages = [(res as any).imageUrl];
            } else if ((res as any)?.output) {
              rawImages = Array.isArray((res as any).output) ? (res as any).output : [(res as any).output];
            }

            const separate = get().settings.separateBatches;
            const now = Date.now();
            const batchId = get().currentQueueBatchId || `batch-${now}`;

            const newHistoryItems: HistoryItem[] = rawImages.map((imgUrl: string, idx: number) => ({
              id: `hist-${now}-${idx}`,
              batchId,
              imageUrl: imgUrl,
              prompt: nextJob.prompt,
              negativePrompt: nextJob.negativePrompt,
              createdAt: new Date(now).toLocaleTimeString(),
              timestamp: now,
              params: {
                model: nextJob.model,
                steps: nextJob.steps,
                cfgScale: nextJob.cfgScale,
                seed: nextJob.seed + (separate ? idx : 0),
                width: nextJob.width,
                height: nextJob.height,
                sampler: nextJob.sampler,
                scheduler: nextJob.scheduler,
              },
            }));

            const shouldAutoSwap = get().settings.autoSwapToLatest;

            set((s) => ({
              activeImage: shouldAutoSwap && newHistoryItems.length > 0 ? newHistoryItems[0].imageUrl : s.activeImage,
              livePreview: null,
              progressPercent: 100,
              metrics: { ...s.metrics, stage: 'Complete', totalTime: duration },
              history: [...newHistoryItems, ...s.history].slice(0, s.settings.maxHistoryCount),
            }));

            const currentSettings = get().settings;
            if (currentSettings.playCompletionSound && get().queue.length === 0) {
              try {
                if (currentSettings.completionSoundData) {
                  const audio = new Audio(currentSettings.completionSoundData);
                  audio.play().catch((err) => console.warn('Audio playback failed:', err));
                } else {
                  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                  if (AudioCtx) {
                    const ctx = new AudioCtx();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
                    gain.gain.setValueAtTime(0.15, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.4);
                  }
                }
              } catch (audioErr) {
                console.warn('Could not play notification sound:', audioErr);
              }
            }
          } catch (e: any) {
            console.error('Generation failure:', e);
            set((s) => ({
              metrics: {
                ...s.metrics,
                stage: `Error: ${e?.message || 'Server connection failed'}`,
              },
            }));
          } finally {
            processQueue();
          }
        };

        processQueue();
      },

      cancelGeneration: () => {
        swarmClient.interrupt();
        set({ isGenerating: false, activeJob: null, livePreview: null, currentQueueBatchId: null });
      },

      cancelQueuedJob: (id) =>
        set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),

      clearQueue: () => set({ queue: [], currentQueueBatchId: null }),

      useGenerationParams: (item) =>
        set({
          prompt: item.prompt,
          negativePrompt: item.negativePrompt || '',
          model: item.params.model,
          steps: item.params.steps,
          cfgScale: item.params.cfgScale ?? 6.5,
          seed: item.params.seed ?? -1,
          width: item.params.width ?? 832,
          height: item.params.height ?? 1216,
          sampler: item.params.sampler ?? 'euler_ancestral',
          scheduler: item.params.scheduler ?? 'normal',
        }),

      updateControlNet: (id, updates) =>
        set((s) => ({
          controlNetUnits: s.controlNetUnits.map((u) => (u.id === id ? { ...u, ...updates } : u)),
        })),

      updateADetailer: (id, updates) =>
        set((s) => ({
          aDetailerUnits: s.aDetailerUnits.map((u) => (u.id === id ? { ...u, ...updates } : u)),
        })),

      updateSettings: (updates) =>
        set((s) => ({ settings: { ...s.settings, ...updates } })),

      setSectionScale: (section, scale) =>
        set((s) => ({
          settings: {
            ...s.settings,
            sectionScales: { ...s.settings.sectionScales, [section]: scale },
          },
        })),

      setCategorizationMode: (mode) =>
        set((s) => ({ settings: { ...s.settings, categorizationMode: mode } })),
    }),
    {
      name: 'swarm_canvas_persisted_store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        prompt: state.prompt,
        negativePrompt: state.negativePrompt,
        model: state.model,
        steps: state.steps,
        cfgScale: state.cfgScale,
        width: state.width,
        height: state.height,
        seed: state.seed,
        sampler: state.sampler,
        scheduler: state.scheduler,
        batchCount: state.batchCount,
        settings: state.settings,
        history: state.history,
        activeImage: state.activeImage,
      }),
    }
  )
);