import { create } from 'zustand';
import { swarmApi, ProgressPayload } from '../api/swarmClient';
import { danbooru } from '../api/danbooruService';

export interface Pill {
  id: string;
  tag: string;
  weight: number;
  category: string;
  target: 'positive' | 'negative';
  disabled?: boolean;
}

export interface PromptPillsSettings {
  useUnderscores: boolean;
  wheelSensitivity: number;
  zoomScale: number;
  showPostCount: boolean;
  hideNsfw: boolean;
}

export interface GenerationMetrics {
  stage: string;
  modelLoadTime: number | null;
  samplingTime: number | null;
  totalTime: number;
  speed: number | null;
  eta: number | null;
}

const MUTUAL_EXCLUSION_RULES: [RegExp, RegExp, string][] = [
  [/^solo$/i, /^(?:2girls|2boys|multiple girls|group|trio)$/i, 'Character count contradiction'],
  [/^short hair$/i, /^(?:long hair|very long hair|absurdly long hair)$/i, 'Hair length contradiction'],
  [/^day(?:time)?$/i, /^(?:night(?:time)?|night sky|midnight)$/i, 'Time of day contradiction'],
  [/^indoors?$/i, /^(?:outdoors?|landscape|nature)$/i, 'Environment contradiction'],
  [/^closed eyes$/i, /^(?:open eyes|wide eyes|staring)$/i, 'Eye state contradiction'],
  [/^small breasts$/i, /^(?:large breasts|huge breasts|gigantic breasts)$/i, 'Body proportion contradiction']
];

interface AppState {
  prompt: string;
  negativePrompt: string;
  model: string;
  vae: string;
  textEncoder: string;
  modelsList: string[];
  vaesList: string[];
  textEncodersList: string[];
  lorasList: string[];
  embeddingsList: string[];
  wildcardsList: string[];

  steps: number;
  cfgScale: number;
  width: number;
  height: number;
  seed: number;
  sampler: string;
  scheduler: string;

  currentStep: number;
  maxSteps: number;
  progressPercent: number;
  isGenerating: boolean;
  activeImage: string | null;
  livePreview: string | null;
  metrics: GenerationMetrics;

  positivePills: Pill[];
  negativePills: Pill[];
  activeTray: 'positive' | 'negative';
  activeMacroCategory: string;
  activeSubCategory: string;
  pillSearchQuery: string;
  settings: PromptPillsSettings;
  historyStack: { pos: Pill[]; neg: Pill[] }[];
  historyIndex: number;

  setPrompt: (p: string) => void;
  setNegativePrompt: (np: string) => void;
  setModel: (m: string) => void;
  setParams: (partial: Partial<AppState>) => void;
  loadAssets: () => Promise<void>;
  setActiveTray: (tray: 'positive' | 'negative') => void;
  setActiveMacroCategory: (cat: string) => void;
  setActiveSubCategory: (sub: string) => void;
  setPillSearchQuery: (q: string) => void;
  updateSettings: (partial: Partial<PromptPillsSettings>) => void;

  addPillToTray: (tag: string, target?: 'positive' | 'negative', weight?: number, category?: string) => void;
  removePill: (id: string, target: 'positive' | 'negative') => void;
  togglePillDisable: (id: string, target: 'positive' | 'negative') => void;
  adjustPillWeight: (id: string, target: 'positive' | 'negative', delta: number) => void;
  movePillBetweenTrays: (id: string, from: 'positive' | 'negative', to: 'positive' | 'negative') => void;

  insertOperatorPill: (op: '<break>' | 'AND' | 'OR') => void;
  sortPillsByWeight: (target: 'positive' | 'negative') => void;
  cleanAndDeduplicate: (target: 'positive' | 'negative') => void;
  clearActiveTray: () => void;
  undo: () => void;
  redo: () => void;
  getConflictingPillIds: (target: 'positive' | 'negative') => Set<string>;

  enqueueAndProcess: () => Promise<void>;
  cancelGeneration: () => void;
}

function compilePillsToText(pills: Pill[], useUnderscores: boolean): string {
  return pills
    .map((p) => {
      let t = p.tag;
      if (useUnderscores) t = t.replace(/\s+/g, '_');
      if (p.disabled) return `<comment:${t}>`;
      if (t === '<break>' || t === 'AND' || t === 'OR') return t;
      return p.weight === 1.0 ? t : `(${t}:${p.weight.toFixed(2)})`;
    })
    .join(', ');
}

let timerInterval: any = null;

export const useAppStore = create<AppState>((set, get) => {
  const commitHistory = (pos: Pill[], neg: Pill[]) => {
    const { historyStack, historyIndex, settings } = get();
    const cleanStack = historyStack.slice(0, historyIndex + 1);
    cleanStack.push({ pos: [...pos], neg: [...neg] });
    if (cleanStack.length > 30) cleanStack.shift();

    set({
      positivePills: pos,
      negativePills: neg,
      prompt: compilePillsToText(pos, settings.useUnderscores),
      negativePrompt: compilePillsToText(neg, settings.useUnderscores),
      historyStack: cleanStack,
      historyIndex: cleanStack.length - 1
    });
  };

  const initialPos: Pill[] = [
    { id: '1', tag: 'masterpiece', weight: 1.0, category: 'Quality', target: 'positive' },
    { id: '2', tag: 'best quality', weight: 1.0, category: 'Quality', target: 'positive' },
    { id: '3', tag: 'anime aesthetic', weight: 1.0, category: 'Style', target: 'positive' }
  ];
  const initialNeg: Pill[] = [
    { id: '4', tag: 'worst quality', weight: 1.0, category: 'Negative', target: 'negative' },
    { id: '5', tag: 'low quality', weight: 1.0, category: 'Negative', target: 'negative' },
    { id: '6', tag: 'blurry', weight: 1.0, category: 'Negative', target: 'negative' }
  ];

  return {
    prompt: compilePillsToText(initialPos, false),
    negativePrompt: compilePillsToText(initialNeg, false),
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
    sampler: 'ER-SDE-Solver',
    scheduler: 'Normal',

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

    positivePills: initialPos,
    negativePills: initialNeg,
    activeTray: 'positive',
    activeMacroCategory: 'All',
    activeSubCategory: 'All',
    pillSearchQuery: '',
    settings: {
      useUnderscores: false,
      wheelSensitivity: 0.05,
      zoomScale: 100,
      showPostCount: true,
      hideNsfw: false
    },
    historyStack: [{ pos: initialPos, neg: initialNeg }],
    historyIndex: 0,

    setPrompt: (prompt) => set({ prompt }),
    setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
    setModel: (model) => set({ model }),
    setParams: (partial) => set(partial),
    setActiveTray: (activeTray) => set({ activeTray }),
    setActiveMacroCategory: (activeMacroCategory) => set({ activeMacroCategory, activeSubCategory: 'All' }),
    setActiveSubCategory: (activeSubCategory) => set({ activeSubCategory }),
    setPillSearchQuery: (pillSearchQuery) => set({ pillSearchQuery }),

    updateSettings: (partial) => {
      const next = { ...get().settings, ...partial };
      set({
        settings: next,
        prompt: compilePillsToText(get().positivePills, next.useUnderscores),
        negativePrompt: compilePillsToText(get().negativePills, next.useUnderscores)
      });
    },

    loadAssets: async () => {
      await danbooru.init();
      const [models, vaes, loras, embeddings, textEncoders, wildcards] = await Promise.all([
        swarmApi.listModels(),
        swarmApi.listVAEs(),
        swarmApi.listLoRAs(),
        swarmApi.listEmbeddings(),
        swarmApi.listTextEncoders(),
        swarmApi.listWildcards()
      ]);

      set({
        modelsList: models,
        model: get().model || models[0] || '',
        vaesList: vaes,
        lorasList: loras,
        embeddingsList: embeddings,
        textEncodersList: textEncoders,
        wildcardsList: wildcards
      });
    },

    addPillToTray: (tag, target, weight = 1.0, category = 'Custom') => {
      const dest = target || get().activeTray;
      const cleanTag = tag.trim();
      if (!cleanTag) return;

      const newPill: Pill = {
        id: crypto.randomUUID(),
        tag: cleanTag,
        weight,
        category,
        target: dest
      };

      if (dest === 'positive') {
        commitHistory([...get().positivePills, newPill], get().negativePills);
      } else {
        commitHistory(get().positivePills, [...get().negativePills, newPill]);
      }
    },

    removePill: (id, target) => {
      if (target === 'positive') {
        commitHistory(get().positivePills.filter((p) => p.id !== id), get().negativePills);
      } else {
        commitHistory(get().positivePills, get().negativePills.filter((p) => p.id !== id));
      }
    },

    togglePillDisable: (id, target) => {
      const update = (pills: Pill[]) => pills.map((p) => (p.id === id ? { ...p, disabled: !p.disabled } : p));
      if (target === 'positive') {
        commitHistory(update(get().positivePills), get().negativePills);
      } else {
        commitHistory(get().positivePills, update(get().negativePills));
      }
    },

    adjustPillWeight: (id, target, delta) => {
      const update = (pills: Pill[]) =>
        pills.map((p) =>
          p.id === id ? { ...p, weight: Math.max(0.1, Math.min(2.5, Number((p.weight + delta).toFixed(2)))) } : p
        );
      if (target === 'positive') {
        commitHistory(update(get().positivePills), get().negativePills);
      } else {
        commitHistory(get().positivePills, update(get().negativePills));
      }
    },

    movePillBetweenTrays: (id, from, to) => {
      if (from === to) return;
      const sourceList = from === 'positive' ? get().positivePills : get().negativePills;
      const pill = sourceList.find((p) => p.id === id);
      if (!pill) return;

      const updatedPill: Pill = { ...pill, target: to };
      if (from === 'positive') {
        commitHistory(
          get().positivePills.filter((p) => p.id !== id),
          [...get().negativePills, updatedPill]
        );
      } else {
        commitHistory(
          [...get().positivePills, updatedPill],
          get().negativePills.filter((p) => p.id !== id)
        );
      }
    },

    insertOperatorPill: (op) => {
      get().addPillToTray(op, get().activeTray, 1.0, 'Operator');
    },

    sortPillsByWeight: (target) => {
      const list = [...(target === 'positive' ? get().positivePills : get().negativePills)];
      list.sort((a, b) => b.weight - a.weight);
      if (target === 'positive') {
        commitHistory(list, get().negativePills);
      } else {
        commitHistory(get().positivePills, list);
      }
    },

    cleanAndDeduplicate: (target) => {
      const list = target === 'positive' ? get().positivePills : get().negativePills;
      const seen = new Set<string>();
      const deduplicated: Pill[] = [];

      list.forEach((p) => {
        const lower = p.tag.toLowerCase();
        if (!seen.has(lower) || p.tag === '<break>' || p.tag === 'AND') {
          seen.add(lower);
          deduplicated.push(p);
        }
      });

      if (target === 'positive') {
        commitHistory(deduplicated, get().negativePills);
      } else {
        commitHistory(get().positivePills, deduplicated);
      }
    },

    clearActiveTray: () => {
      if (get().activeTray === 'positive') {
        commitHistory([], get().negativePills);
      } else {
        commitHistory(get().positivePills, []);
      }
    },

    undo: () => {
      const { historyStack, historyIndex, settings } = get();
      if (historyIndex > 0) {
        const prev = historyStack[historyIndex - 1];
        set({
          historyIndex: historyIndex - 1,
          positivePills: prev.pos,
          negativePills: prev.neg,
          prompt: compilePillsToText(prev.pos, settings.useUnderscores),
          negativePrompt: compilePillsToText(prev.neg, settings.useUnderscores)
        });
      }
    },

    redo: () => {
      const { historyStack, historyIndex, settings } = get();
      if (historyIndex < historyStack.length - 1) {
        const next = historyStack[historyIndex + 1];
        set({
          historyIndex: historyIndex + 1,
          positivePills: next.pos,
          negativePills: next.neg,
          prompt: compilePillsToText(next.pos, settings.useUnderscores),
          negativePrompt: compilePillsToText(next.neg, settings.useUnderscores)
        });
      }
    },

    getConflictingPillIds: (target) => {
      const pills = target === 'positive' ? get().positivePills : get().negativePills;
      const conflicts = new Set<string>();

      for (let i = 0; i < pills.length; i++) {
        for (let j = i + 1; j < pills.length; j++) {
          const t1 = pills[i].tag;
          const t2 = pills[j].tag;

          for (const [r1, r2] of MUTUAL_EXCLUSION_RULES) {
            if ((r1.test(t1) && r2.test(t2)) || (r2.test(t1) && r1.test(t2))) {
              conflicts.add(pills[i].id);
              conflicts.add(pills[j].id);
            }
          }
        }
      }
      return conflicts;
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
          set({
            activeImage: imageUrls[0] || null,
            livePreview: null,
            isGenerating: false,
            progressPercent: 100,
            metrics: { ...get().metrics, stage: 'Done', totalTime: totalSec, eta: 0 }
          });
        },
        () => {
          if (timerInterval) clearInterval(timerInterval);
          set({ isGenerating: false, metrics: { ...get().metrics, stage: 'Failed' } });
        }
      );
    }
  };
});