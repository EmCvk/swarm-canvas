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
  batchId: string;
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  createdAt: string;
  timestamp: number;
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
  batchId: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  vae?: string;
  textEncoder?: string;
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
  aDetailerUnits?: ADetailerUnit[];
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

export function stripDisabledPromptTags(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Builds SwarmUI's native YOLO segmentation directives
 * Syntax: <segment:yolo-modelname,,denoise>
 */
export function buildADetailerDirectives(units: ADetailerUnit[]): string {
  const enabledUnits = units.filter((u) => u.enabled);
  if (enabledUnits.length === 0) return '';

  return enabledUnits
    .map((u) => {
      const cleanModel = u.model.replace(/\.pt$/i, '');
      const denoise = (u.denoiseStrength ?? 0.4).toFixed(2);
      return `<segment:yolo-${cleanModel},,${denoise}>`;
    })
    .join(' ');
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

  history: HistoryItem[];
  galleryHistory: HistoryItem[];

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

  startNewBatch: () => void;
  duplicateQueuedItem: (id: string) => void;
  addVariationToBatch: (batchId: string) => void;
  removeBatchFromQueue: (batchId: string) => void;

  isQueuePaused: boolean;
  setIsQueuePaused: (paused: boolean) => void;
  reorderQueue: (startIndex: number, endIndex: number) => void;

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
  activeContextMenu: { x: number; y: number; title: string; items: any[] } | null;
  setActiveContextMenu: (menu: { x: number; y: number; title: string; items: any[] } | null) => void;

  setModel: (m: string) => void;
  setParams: (params: Partial<AppState>) => void;
  loadAssets: () => Promise<void>;
  syncServerGallery: () => Promise<void>;
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
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      serverUrl: 'http://localhost:7801',
      sessionId: null,
      isConnected: false,
      sessionStartTime: (() => {
        const existing = sessionStorage.getItem('swarm_session_start');
        if (existing) return Number(existing);
        const now = Date.now();
        sessionStorage.setItem('swarm_session_start', String(now));
        return now;
      })(),
      hideProgressBar: false,

      history: [],
      galleryHistory: [],

      prompt: 'masterpiece, best quality, 1girl, solo',
      negativePrompt: 'worst quality, low quality, bad anatomy, blurry',
      activeMacroCategory: '1. Subject & Count',
      activeSubCategory: 'All',
      pillSearchQuery: '',

      isQueuePaused: false,
      setIsQueuePaused: (isQueuePaused) => set({ isQueuePaused }),

      reorderQueue: (startIndex: number, endIndex: number) =>
        set((s) => {
          const list = [...s.queue];
          const [moved] = list.splice(startIndex, 1);
          list.splice(endIndex, 0, moved);
          return { queue: list };
        }),

      startNewBatch: () => {
        set({ currentQueueBatchId: `batch-${Date.now()}` });
      },

      duplicateQueuedItem: (id: string) =>
        set((s) => {
          const item = s.queue.find((q) => q.id === id);
          if (!item) return {};
          const copy: QueueItem = {
            ...item,
            id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            seed: item.seed === -1 ? -1 : item.seed + 1,
            createdAt: Date.now(),
          };
          const idx = s.queue.findIndex((q) => q.id === id);
          const updated = [...s.queue];
          updated.splice(idx + 1, 0, copy);
          return { queue: updated };
        }),

      addVariationToBatch: (batchId: string) => {
        const state = get();
        const targetModel = state.model || (state.modelsList[0]?.name ?? '');
        const cleanPositive = stripDisabledPromptTags(state.prompt);
        const cleanNegative = stripDisabledPromptTags(state.negativePrompt);
        const currentADetailer = state.aDetailerUnits.map((u) => ({ ...u }));

        const newJob: QueueItem = {
          id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          batchId,
          prompt: cleanPositive,
          negativePrompt: cleanNegative,
          model: targetModel,
          vae: state.vae,
          textEncoder: state.textEncoder,
          width: state.width,
          height: state.height,
          steps: state.steps,
          cfgScale: state.cfgScale,
          seed: Math.floor(Math.random() * 2147483647),
          sampler: state.sampler,
          scheduler: state.scheduler,
          status: 'queued',
          progress: 0,
          step: 0,
          maxSteps: state.steps,
          createdAt: Date.now(),
          aDetailerUnits: currentADetailer,
        };

        set((s) => ({ queue: [...s.queue, newJob] }));
        if (!get().isGenerating) {
          get().enqueueAndProcess();
        }
      },

      removeBatchFromQueue: (batchId: string) =>
        set((s) => ({
          queue: s.queue.filter((q) => q.batchId !== batchId),
        })),

      model: '',
      modelsList: [],
      lorasList: [],
      embeddingsList: [],
      wildcardsList: [],
      vae: 'Automatic',
      vaesList: ['Automatic', 'None'],
      textEncoder: 'Automatic',
      textEncodersList: ['Automatic', 'None'],

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
        maxHistoryCount: 5000,
        defaultLoraWeight: 1.0,
        separateBatches: true,
        autoSwapToLatest: true,
        hideProgressBar: false,
        playCompletionSound: true,
        completionSoundData: null,
      },

      toggleFavorite: (id: string) =>
        set((s) => ({
          history: s.history.map((item) =>
            item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
          ),
          galleryHistory: s.galleryHistory.map((item) =>
            item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
          ),
        })),

      activeContextMenu: null,
      setActiveContextMenu: (activeContextMenu) => set({ activeContextMenu }),

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
          galleryHistory: s.galleryHistory.filter((h) => h.id !== id),
          activeImage: s.activeImage === s.history.find((h) => h.id === id)?.imageUrl ? null : s.activeImage,
        })),

      removeFromSessionHistory: (id) =>
        set((s) => ({
          history: s.history.filter((h) => h.id !== id),
        })),

      loadAssets: async () => {
        try {
          await swarmClient.triggerRefresh();

          const [models, loras, embeddings, wildcards, vaes, textEncoders] = await Promise.all([
            swarmClient.listModels('Stable-Diffusion'),
            swarmClient.listModels('LoRA'),
            swarmClient.listModels('Embedding'),
            swarmClient.listWildcards(),
            swarmClient.listVAEs(),
            swarmClient.listTextEncoders(),
          ]);

          const formatItems = (list: any[]): ModelItem[] =>
            list.map((m: any) => ({
              name: m.name,
              previewUrl: m.previewUrl,
              description: m.description,
              triggerWords: m.triggerWords,
            }));

          const formattedModels = formatItems(models);
          const formattedLoras = formatItems(loras);
          const formattedEmbeddings = formatItems(embeddings);

          set((s) => ({
            modelsList: formattedModels,
            lorasList: formattedLoras,
            embeddingsList: formattedEmbeddings,
            wildcardsList: wildcards.map((w) => (typeof w === 'string' ? w : (w as any).name || String(w))),
            vaesList: vaes,
            textEncodersList: textEncoders,
            model: s.model || (formattedModels.length > 0 ? formattedModels[0].name : ''),
            vae: s.vae || 'Automatic',
            textEncoder: s.textEncoder || 'Automatic',
          }));
        } catch (err) {
          console.error('[Store] Failed to load asset catalogs:', err);
        }
      },

      syncServerGallery: async () => {
        try {
          const serverImgs = await swarmClient.listServerImages();
          if (serverImgs.length === 0) return;

          const currentUrls = new Set(get().galleryHistory.map((h) => h.imageUrl));
          const additions: HistoryItem[] = [];
          const now = Date.now();

          serverImgs.forEach((img, i) => {
            if (!currentUrls.has(img.url)) {
              additions.push({
                id: `server-${now}-${i}`,
                batchId: `batch-server-${now}`,
                imageUrl: img.url,
                prompt: img.name.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Server image',
                negativePrompt: '',
                createdAt: new Date().toLocaleTimeString(),
                timestamp: now - i * 1000,
                params: {
                  model: get().model || 'Unknown',
                  steps: 28,
                  cfgScale: 6.5,
                  seed: -1,
                  width: 832,
                  height: 1216,
                  sampler: 'euler_ancestral',
                  scheduler: 'normal',
                },
              });
            }
          });

          if (additions.length > 0) {
            set((s) => ({
              galleryHistory: [...s.galleryHistory, ...additions].slice(0, s.settings.maxHistoryCount || 5000),
            }));
          }
        } catch (err) {
          console.error('[Store] Failed to sync server gallery:', err);
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
        const cleanPositive = stripDisabledPromptTags(state.prompt);
        const cleanNegative = stripDisabledPromptTags(state.negativePrompt);
        const currentADetailer = state.aDetailerUnits.map((u) => ({ ...u }));

        const count = Math.max(1, state.batchCount || 1);
        const activeBatchId = get().currentQueueBatchId || `batch-${Date.now()}`;
        const newJobs: QueueItem[] = [];

        for (let i = 0; i < count; i++) {
          newJobs.push({
            id: `job-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            batchId: activeBatchId,
            prompt: cleanPositive,
            negativePrompt: cleanNegative,
            model: targetModel,
            vae: state.vae,
            textEncoder: state.textEncoder,
            width: state.width,
            height: state.height,
            steps: state.steps,
            cfgScale: state.cfgScale,
            seed: state.seed === -1 ? Math.floor(Math.random() * 2147483647) : effectiveSeed + i,
            sampler: state.sampler,
            scheduler: state.scheduler,
            status: 'queued',
            progress: 0,
            step: 0,
            maxSteps: state.steps,
            createdAt: Date.now() + i,
            aDetailerUnits: currentADetailer,
          });
        }

        set((s) => ({
          queue: [...s.queue, ...newJobs],
          currentQueueBatchId: activeBatchId,
        }));

        if (get().isGenerating) return;

        set({ isGenerating: true });

        while (get().queue.length > 0) {
          if (get().isQueuePaused) {
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }

          const currentQueue = get().queue;
          const [nextJob, ...remainingQueue] = currentQueue;

          // Transition job to activeJob without holding duplicate in queue
          set({
            queue: remainingQueue,
            activeJob: { ...nextJob, status: 'running' },
            currentStep: 0,
            maxSteps: nextJob.steps,
            progressPercent: 0,
            metrics: { ...get().metrics, stage: 'Obtaining Session...', totalTime: 0 },
          });

          const startTime = Date.now();

          try {
            const freshSessionId = await swarmClient.getNewSession();
            set({ sessionId: freshSessionId });

            // Compile SwarmUI native YOLO segmentation prompt syntax
            const activeUnits = nextJob.aDetailerUnits || [];
            const adetailerTag = buildADetailerDirectives(activeUnits);
            const finalPromptWithADetailer = adetailerTag
              ? `${nextJob.prompt} ${adetailerTag}`
              : nextJob.prompt;

            const res = await swarmClient.generateImage(
              {
                session_id: freshSessionId,
                prompt: finalPromptWithADetailer,
                negativeprompt: nextJob.negativePrompt,
                model: nextJob.model,
                vae: nextJob.vae !== 'Automatic' ? nextJob.vae : undefined,
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
            const rawImages = res.images && res.images.length > 0 ? res.images : [res.imageUrl];
            const now = Date.now();
            const batchId = nextJob.batchId || `batch-${now}`;

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
                seed: nextJob.seed,
                width: nextJob.width,
                height: nextJob.height,
                sampler: nextJob.sampler,
                scheduler: nextJob.scheduler,
              },
            }));

            const shouldAutoSwap = get().settings.autoSwapToLatest;
            const limit = Math.max(1000, get().settings?.maxHistoryCount || 5000);

            set((s) => ({
              activeImage: shouldAutoSwap && newHistoryItems.length > 0 ? newHistoryItems[0].imageUrl : s.activeImage,
              livePreview: null,
              progressPercent: 100,
              metrics: { ...s.metrics, stage: 'Complete', totalTime: duration },
              history: [...newHistoryItems, ...s.history].slice(0, limit),
              galleryHistory: [...newHistoryItems, ...s.galleryHistory].slice(0, limit),
            }));

          } catch (e: any) {
            console.error('Queue job failure:', e);
            set((s) => ({
              metrics: {
                ...s.metrics,
                stage: `Error: ${e?.message || 'Generation aborted'}`,
              },
            }));
          }
        }

        set({
          isGenerating: false,
          activeJob: null,
          currentQueueBatchId: null,
          livePreview: null,
        });

        const currentSettings = get().settings;
        if (currentSettings.playCompletionSound) {
          try {
            if (currentSettings.completionSoundData) {
              new Audio(currentSettings.completionSoundData).play().catch(() => {});
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
          } catch {}
        }
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
        settings: {
          ...state.settings,
          maxHistoryCount: Math.max(1000, state.settings?.maxHistoryCount || 5000),
        },
        galleryHistory: state.galleryHistory,
        activeImage: state.activeImage,
      }),
    }
  )
);