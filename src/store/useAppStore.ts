import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { swarmApi, ProgressPayload } from '../api/swarmClient';
import { danbooru, CategorizationMode } from '../api/danbooruService';
import { civitaiService } from '../api/civitaiService';

export interface ModelItem {
  name: string;
  previewUrl?: string;
  description?: string;
  triggerWords?: string[];
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
    batchCount?: number;
  };
  createdAt: string;
}

export interface AppSettings {
  accentColor: 'indigo' | 'purple' | 'emerald' | 'rose' | 'amber' | 'cyan';
  tagClickWeightStep: number;
  showTagPostCounts: boolean;
  showTagPlusPrefix: boolean;
  useUnderscores: boolean;
  autoInjectLoraTrigger: boolean;
  defaultLoraWeight: number;

  categorizationMode: CategorizationMode;
  tagSortOrder: 'alphabetical' | 'popularity'; // <--- ADD THIS
  activePreset: 'Default' | 'Prompt Engineer' | 'Studio Canvas' | 'Multi-ControlNet';
  bottomPanelHeight: number;
  preservePromptsOnReload: boolean;
  randomizeSeedOnGen: boolean;
  maxHistoryCount: number;
  autoSaveLayout: boolean;

  sectionScales: {
    pills: number;
    params: number;
    extranetworks: number;
    preview: number;
    controlnet: number;
    adetailer: number;
    history: number;
    imagesearch: number;
  };
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
  'normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'turbo', 'align_your_steps'
];

interface AppState {
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
  batchCount: number;

  controlNetUnits: ControlNetUnit[];
  aDetailerUnits: ADetailerUnit[];

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

  

  comparisonImage: string | null;
  isComparing: boolean;
  compareSplit: number;
  setIsComparing: (b: boolean) => void;
  setComparisonImage: (url: string | null) => void;
  setCompareSplit: (n: number) => void;

  history: HistoryItem[];
  activeMacroCategory: string;
  activeSubCategory: string;
  pillSearchQuery: string;

  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  setSectionScale: (section: keyof AppSettings['sectionScales'], scale: number) => void;
  setCategorizationMode: (mode: CategorizationMode) => Promise<void>;
  globalContextMenu: { x: number; y: number; title?: string; items: any[] } | null;
  setGlobalContextMenu: (menu: { x: number; y: number; title?: string; items: any[] } | null) => void;
  setPrompt: (p: string) => void;
  setNegativePrompt: (np: string) => void;
  setModel: (m: string) => void;
  setParams: (partial: Partial<AppState>) => void;
  useGenerationParams: (item: HistoryItem) => void;
  updateControlNet: (id: string, partial: Partial<ControlNetUnit>) => void;
  updateADetailer: (id: string, partial: Partial<ADetailerUnit>) => void;
  setActiveMacroCategory: (c: string) => void;
  setActiveSubCategory: (s: string) => void;
  setPillSearchQuery: (q: string) => void;

  loadAssets: () => Promise<void>;
  syncCivitaiMetadata: (
    category: 'all' | 'models' | 'loras' | 'embeddings',
    onProgress?: (current: number, total: number, name: string) => void
  ) => Promise<void>;
  enqueueAndProcess: () => Promise<void>;
  cancelGeneration: () => void;
}

let timerInterval: ReturnType<typeof setInterval> | null = null;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
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
      batchCount: 1,

      controlNetUnits: [
        { id: '1', enabled: false, preprocessor: 'canny', model: 'controlnet-canny-sdxl', weight: 1.0, guidanceStart: 0, guidanceEnd: 1, controlMode: 'balanced', image: null },
        { id: '2', enabled: false, preprocessor: 'depth', model: 'controlnet-depth-sdxl', weight: 1.0, guidanceStart: 0, guidanceEnd: 1, controlMode: 'balanced', image: null },
        { id: '3', enabled: false, preprocessor: 'openpose', model: 'controlnet-openpose-sdxl', weight: 1.0, guidanceStart: 0, guidanceEnd: 1, controlMode: 'balanced', image: null }
      ],

      aDetailerUnits: [
        { id: '1', enabled: false, model: 'face_yolov8n.pt', confidence: 0.3, maskBlur: 4, denoiseStrength: 0.4, maskDilation: 4, inpaintWidth: 512, inpaintHeight: 512, prompt: '' },
        { id: '2', enabled: false, model: 'hand_yolov8n.pt', confidence: 0.4, maskBlur: 4, denoiseStrength: 0.4, maskDilation: 4, inpaintWidth: 512, inpaintHeight: 512, prompt: '' }
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
      globalContextMenu: null,
      setGlobalContextMenu: (globalContextMenu) => set({ globalContextMenu }),
      comparisonImage: null,
      isComparing: false,
      compareSplit: 50,
      setIsComparing: (isComparing) => set({ isComparing }),
      setComparisonImage: (comparisonImage) => set({ comparisonImage, isComparing: !!comparisonImage }),
      setCompareSplit: (compareSplit) => set({ compareSplit }),

      history: [],
      activeMacroCategory: 'All',
      activeSubCategory: 'All',
      pillSearchQuery: '',

      settings: {
        accentColor: 'indigo',
        tagClickWeightStep: 0.2,
        showTagPostCounts: true,
        showTagPlusPrefix: true,
        useUnderscores: false,
        autoInjectLoraTrigger: true,
        defaultLoraWeight: 1.0,

        categorizationMode: 'prompt_flow', // <--- CHANGE FROM 'curated' TO 'prompt_flow'
        tagSortOrder: 'alphabetical',
        activePreset: 'Default',
        bottomPanelHeight: 340,
        preservePromptsOnReload: true,
        randomizeSeedOnGen: true,
        maxHistoryCount: 60,
        autoSaveLayout: true,

        sectionScales: {
          pills: 100,
          params: 100,
          extranetworks: 100,
          preview: 100,
          controlnet: 100,
          adetailer: 100,
          history: 100,
          imagesearch: 100
        }
      },

      updateSettings: (partial) => set((s) => ({ settings: { ...s.settings, ...partial } })),

      setSectionScale: (section, scale) =>
        set((s) => ({
          settings: {
            ...s.settings,
            sectionScales: { ...s.settings.sectionScales, [section]: scale }
          }
        })),

      setCategorizationMode: async (mode) => {
        await danbooru.setCategorizationMode(mode);
        set((s) => ({
          settings: { ...s.settings, categorizationMode: mode },
          activeMacroCategory: 'All',
          activeSubCategory: 'All'
        }));
      },

      setPrompt: (prompt) => set({ prompt }),
      setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
      setModel: (model) => set({ model }),
      setParams: (partial) => set(partial),

      useGenerationParams: (item) => {
        set({
          prompt: item.prompt,
          negativePrompt: item.negativePrompt,
          model: item.params.model || get().model,
          sampler: item.params.sampler || get().sampler,
          scheduler: item.params.scheduler || get().scheduler,
          steps: item.params.steps || get().steps,
          cfgScale: item.params.cfgScale || get().cfgScale,
          seed: item.params.seed !== undefined ? item.params.seed : get().seed,
          width: item.params.width || get().width,
          height: item.params.height || get().height,
          batchCount: item.params.batchCount || get().batchCount
        });
      },

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
        await danbooru.init(get().settings.categorizationMode || 'curated');
        const [rawModels, vaes, rawLoras, rawEmbeddings, textEncoders, wildcards] = await Promise.all([
          swarmApi.listModelsDetailed('Stable-Diffusion'),
          swarmApi.listVAEs(),
          swarmApi.listModelsDetailed('LoRA'),
          swarmApi.listModelsDetailed('Embedding'),
          swarmApi.listTextEncoders(),
          swarmApi.listWildcards()
        ]);

        const mergeWithExisting = (newList: ModelItem[], existingList: ModelItem[]) => {
          const map = new Map(existingList.map((i) => [i.name, i]));
          return newList.map((item) => {
            const cached = map.get(item.name);
            return {
              ...item,
              previewUrl: item.previewUrl || cached?.previewUrl,
              triggerWords: item.triggerWords || cached?.triggerWords,
              description: item.description || cached?.description
            };
          });
        };

        set({
          modelsList: mergeWithExisting(rawModels, get().modelsList),
          model: get().model || (rawModels[0]?.name ?? ''),
          vaesList: vaes,
          lorasList: mergeWithExisting(rawLoras, get().lorasList),
          embeddingsList: mergeWithExisting(rawEmbeddings, get().embeddingsList),
          textEncodersList: textEncoders,
          wildcardsList: wildcards
        });
      },

      syncCivitaiMetadata: async (category, onProgress) => {
        const s = get();
        const targets: { type: 'model' | 'lora' | 'embedding'; item: ModelItem; idx: number }[] = [];

        if (category === 'all' || category === 'models') {
          s.modelsList.forEach((m, idx) => {
            if (!m.previewUrl) targets.push({ type: 'model', item: m, idx });
          });
        }
        if (category === 'all' || category === 'loras') {
          s.lorasList.forEach((l, idx) => {
            if (!l.previewUrl) targets.push({ type: 'lora', item: l, idx });
          });
        }
        if (category === 'all' || category === 'embeddings') {
          s.embeddingsList.forEach((e, idx) => {
            if (!e.previewUrl) targets.push({ type: 'embedding', item: e, idx });
          });
        }

        const total = targets.length;
        if (total === 0) return;

        for (let i = 0; i < total; i++) {
          const target = targets[i];
          if (onProgress) onProgress(i + 1, total, target.item.name);

          const meta = await civitaiService.fetchMetadata(target.item.name, target.type);
          if (meta) {
            if (target.type === 'model') {
              const updated = [...get().modelsList];
              updated[target.idx] = {
                ...updated[target.idx],
                previewUrl: meta.previewUrl || updated[target.idx].previewUrl,
                triggerWords: meta.triggerWords,
                description: meta.description || updated[target.idx].description
              };
              set({ modelsList: updated });
            } else if (target.type === 'lora') {
              const updated = [...get().lorasList];
              updated[target.idx] = {
                ...updated[target.idx],
                previewUrl: meta.previewUrl || updated[target.idx].previewUrl,
                triggerWords: meta.triggerWords,
                description: meta.description || updated[target.idx].description
              };
              set({ lorasList: updated });
            } else if (target.type === 'embedding') {
              const updated = [...get().embeddingsList];
              updated[target.idx] = {
                ...updated[target.idx],
                previewUrl: meta.previewUrl || updated[target.idx].previewUrl,
                triggerWords: meta.triggerWords,
                description: meta.description || updated[target.idx].description
              };
              set({ embeddingsList: updated });
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
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

        const effectiveSeed = s.settings.randomizeSeedOnGen && s.seed === -1
          ? Math.floor(Math.random() * 2147483647)
          : s.seed;

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
            seed: effectiveSeed,
            sampler: s.sampler,
            scheduler: s.scheduler,
            images: s.batchCount || 1
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
              const newItems: HistoryItem[] = imageUrls.map((url) => ({
                id: crypto.randomUUID(),
                imageUrl: url,
                prompt: s.prompt,
                negativePrompt: s.negativePrompt,
                params: {
                  model: s.model,
                  sampler: s.sampler,
                  scheduler: s.scheduler,
                  steps: s.steps,
                  cfgScale: s.cfgScale,
                  seed: effectiveSeed,
                  width: s.width,
                  height: s.height,
                  batchCount: s.batchCount
                },
                createdAt: new Date().toLocaleTimeString()
              }));

              set((state) => ({
                history: [...newItems, ...state.history].slice(0, state.settings.maxHistoryCount)
              }));
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
    }),
    {
      name: 'swarm_canvas_persisted_store',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        prompt: s.settings.preservePromptsOnReload ? s.prompt : '',
        negativePrompt: s.settings.preservePromptsOnReload ? s.negativePrompt : '',
        model: s.model,
        vae: s.vae,
        textEncoder: s.textEncoder,
        steps: s.steps,
        cfgScale: s.cfgScale,
        width: s.width,
        height: s.height,
        seed: s.seed,
        sampler: s.sampler,
        scheduler: s.scheduler,
        batchCount: s.batchCount,
        controlNetUnits: s.controlNetUnits,
        aDetailerUnits: s.aDetailerUnits,
        activeMacroCategory: s.activeMacroCategory,
        activeSubCategory: s.activeSubCategory,
        settings: s.settings,
        modelsList: s.modelsList,
        lorasList: s.lorasList,
        embeddingsList: s.embeddingsList,
        history: s.history.slice(0, 40)
      })
    }
  )
);