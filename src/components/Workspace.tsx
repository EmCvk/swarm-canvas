import React, { useEffect, useState } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  DockviewApi,
  IDockviewPanelProps
} from 'dockview-react';
import { useAppStore } from '../store/useAppStore';
import { danbooru } from '../api/danbooruService';
import {
  Wand2, Trash2, Plus, Sparkles, Clock, Cpu, Gauge,
  RotateCw, Search, Layers, Sparkle, LayoutGrid,
  AlertTriangle, Undo, Redo, Scale
} from 'lucide-react';

/* =========================================================================
   1. PROMPTPILLS WORKSPACE WITH DANBOORU METADATA & POPOVERS
   ========================================================================= */
const PromptPillsPanel: React.FC<IDockviewPanelProps> = () => {
  const {
    positivePills,
    negativePills,
    activeTray,
    activeMacroCategory,
    activeSubCategory,
    pillSearchQuery,
    settings,
    setActiveTray,
    setActiveMacroCategory,
    setActiveSubCategory,
    setPillSearchQuery,
    updateSettings,
    addPillToTray,
    removePill,
    togglePillDisable,
    adjustPillWeight,
    movePillBetweenTrays,
    insertOperatorPill,
    sortPillsByWeight,
    cleanAndDeduplicate,
    clearActiveTray,
    undo,
    redo,
    getConflictingPillIds
  } = useAppStore();

  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);

  const posConflicts = getConflictingPillIds('positive');
  const negConflicts = getConflictingPillIds('negative');

  const currentPills = activeTray === 'positive' ? positivePills : negativePills;
  const currentConflicts = activeTray === 'positive' ? posConflicts : negConflicts;

  const macroCategories = danbooru.getMacroCategories();
  const subCategories = danbooru.getSubCategories(activeMacroCategory);
  const danbooruTagList = danbooru.getTags(activeMacroCategory, activeSubCategory);

  const formatCount = (n: number | null) => {
    if (!n) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return n.toString();
  };

  const handleMouseEnter = (e: React.MouseEvent, tag: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopoverPos({ x: rect.left, y: rect.bottom + 6 });
    setHoveredTag(tag);
  };

  return (
    <div className="h-full flex flex-col bg-[#111317] select-none text-xs overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
      {/* Quick Actions & Formatting Toolbar */}
      <div className="h-9 border-b border-[#252a35] px-2 flex items-center justify-between bg-[#15181f] gap-1 shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => insertOperatorPill('<break>')} className="px-1.5 py-0.5 bg-amber-950/80 border border-amber-600 text-amber-300 rounded font-mono text-[10px] hover:bg-amber-900 cursor-pointer">
            &lt;break&gt;
          </button>
          <button onClick={() => insertOperatorPill('AND')} className="px-1.5 py-0.5 bg-cyan-950/80 border border-cyan-600 text-cyan-300 rounded font-mono text-[10px] hover:bg-cyan-900 cursor-pointer">
            AND
          </button>
          <button onClick={() => insertOperatorPill('OR')} className="px-1.5 py-0.5 bg-cyan-950/80 border border-cyan-600 text-cyan-300 rounded font-mono text-[10px] hover:bg-cyan-900 cursor-pointer">
            OR
          </button>

          <div className="h-4 w-px bg-[#2b2f3a] mx-1" />

          <button onClick={() => sortPillsByWeight(activeTray)} title="Auto-Sort by Weight (High to Low)" className="p-1 hover:bg-[#252a35] text-gray-300 rounded cursor-pointer">
            <Scale className="w-3.5 h-3.5 text-indigo-400" />
          </button>
          <button onClick={() => cleanAndDeduplicate(activeTray)} title="Deduplicate & Clean Trailing Whitespace" className="p-1 hover:bg-[#252a35] text-gray-300 rounded cursor-pointer">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          </button>
          <button onClick={undo} title="Undo (Ctrl+Z)" className="p-1 hover:bg-[#252a35] text-gray-300 rounded cursor-pointer">
            <Undo className="w-3.5 h-3.5" />
          </button>
          <button onClick={redo} title="Redo (Ctrl+Y)" className="p-1 hover:bg-[#252a35] text-gray-300 rounded cursor-pointer">
            <Redo className="w-3.5 h-3.5" />
          </button>
          <button onClick={clearActiveTray} title="Clear Active Tray" className="p-1 hover:bg-[#252a35] text-rose-400 rounded cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.useUnderscores}
              onChange={(e) => updateSettings({ useUnderscores: e.target.checked })}
              className="accent-indigo-500 rounded"
            />
            <span>underscores</span>
          </label>
        </div>
      </div>

      {/* Dual Synchronized Tray Tabs */}
      <div className="grid grid-cols-2 bg-[#0c0e12] border-b border-[#252a35] text-center font-medium cursor-pointer">
        <div
          onClick={() => setActiveTray('positive')}
          className={`py-1.5 border-b-2 flex items-center justify-center gap-2 ${
            activeTray === 'positive'
              ? 'border-indigo-500 text-indigo-300 bg-[#161821]'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <span>Positive Tray ({positivePills.length})</span>
          {posConflicts.size > 0 && (
            <span className="bg-rose-900/80 text-rose-300 px-1.5 py-0.2 rounded-full text-[10px] flex items-center gap-0.5 border border-rose-600">
              <AlertTriangle className="w-2.5 h-2.5" /> {posConflicts.size}
            </span>
          )}
        </div>
        <div
          onClick={() => setActiveTray('negative')}
          className={`py-1.5 border-b-2 flex items-center justify-center gap-2 ${
            activeTray === 'negative'
              ? 'border-rose-500 text-rose-300 bg-[#1e1518]'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <span>Negative Tray ({negativePills.length})</span>
          {negConflicts.size > 0 && (
            <span className="bg-rose-900/80 text-rose-300 px-1.5 py-0.2 rounded-full text-[10px] flex items-center gap-0.5 border border-rose-600">
              <AlertTriangle className="w-2.5 h-2.5" /> {negConflicts.size}
            </span>
          )}
        </div>
      </div>

      {/* Active Active Tray Badges */}
      <div className="h-28 p-2 overflow-y-auto content-start flex flex-wrap gap-1.5 border-b border-[#252a35] bg-[#0e1014]">
        {currentPills.length === 0 ? (
          <span className="text-gray-600 m-auto text-xs">Tray empty. Select Danbooru tags below.</span>
        ) : (
          currentPills.map((pill) => {
            const hasConflict = currentConflicts.has(pill.id);
            const isOperator = pill.tag === '<break>' || pill.tag === 'AND' || pill.tag === 'OR';

            return (
              <div
                key={pill.id}
                draggable
                onMouseEnter={(e) => handleMouseEnter(e, pill.tag)}
                onMouseLeave={() => setHoveredTag(null)}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer transition select-none ${
                  hasConflict
                    ? 'bg-[#450a0a] border-red-600 text-red-200 shadow-md ring-1 ring-red-500 animate-pulse'
                    : isOperator
                    ? 'bg-amber-950/70 border-amber-500 text-amber-200'
                    : pill.disabled
                    ? 'bg-[#181a20] border-neutral-700 text-neutral-500 line-through opacity-60'
                    : activeTray === 'positive'
                    ? 'bg-[#161a24] border-[#2e374d] text-indigo-200 hover:border-indigo-500'
                    : 'bg-[#221619] border-[#44282f] text-rose-200 hover:border-rose-500'
                }`}
                onClick={(e) => {
                  if (e.shiftKey) {
                    adjustPillWeight(pill.id, activeTray, 0.2);
                  } else {
                    togglePillDisable(pill.id, activeTray);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  movePillBetweenTrays(pill.id, activeTray, activeTray === 'positive' ? 'negative' : 'positive');
                }}
                onWheel={(e) => {
                  e.preventDefault();
                  adjustPillWeight(pill.id, activeTray, e.deltaY < 0 ? settings.wheelSensitivity : -settings.wheelSensitivity);
                }}
              >
                {hasConflict && <AlertTriangle className="w-3 h-3 text-red-400" />}
                <span className="font-medium">{pill.tag}</span>
                {!isOperator && (
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-black/40 text-indigo-300">
                    {pill.weight.toFixed(2)}
                  </span>
                )}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    removePill(pill.id, activeTray);
                  }}
                  className="text-[10px] text-gray-500 hover:text-red-400 ml-0.5"
                >
                  ×
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Two-Tier Danbooru Tag Browser */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#14161e]">
        {/* Tier 1: Macro Category Tabs */}
        <div className="flex gap-1 overflow-x-auto p-1.5 border-b border-[#252a35] scrollbar-none bg-[#12141a]">
          {macroCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveMacroCategory(cat)}
              className={`px-2.5 py-0.5 rounded text-[11px] whitespace-nowrap cursor-pointer ${
                activeMacroCategory === cat ? 'bg-indigo-600 text-white font-medium' : 'bg-[#1b1e26] text-gray-400 hover:text-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Tier 2: Subcategory Chips & Search */}
        <div className="flex items-center gap-2 p-1.5 border-b border-[#252a35] bg-[#161822]">
          <div className="relative w-44">
            <Search className="w-3 h-3 absolute left-2 top-2 text-gray-400" />
            <input
              type="text"
              value={pillSearchQuery}
              onChange={(e) => setPillSearchQuery(e.target.value)}
              placeholder="Search Danbooru tags..."
              className="w-full bg-[#1b1e26] border border-[#2b2f3a] rounded pl-7 pr-2 py-0.5 text-xs text-gray-200 outline-none"
            />
          </div>

          <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-none">
            {subCategories.map((sub) => (
              <button
                key={sub}
                onClick={() => setActiveSubCategory(sub)}
                className={`px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap cursor-pointer ${
                  activeSubCategory === sub
                    ? 'bg-indigo-950 text-indigo-300 border border-indigo-500'
                    : 'bg-[#1c202a] text-gray-400 hover:text-gray-200 border border-[#2b2f3a]'
                }`}
              >
                {sub}
              </button>
            ))}
          </div>
        </div>

        {/* Tag Grid with Post Count Badges */}
        <div className="flex-1 p-2 overflow-y-auto content-start flex flex-wrap gap-1.5">
          {danbooruTagList
            .filter((t) => !pillSearchQuery || t.toLowerCase().includes(pillSearchQuery.toLowerCase()))
            .map((tag) => {
              const count = danbooru.getPostCount(tag);
              return (
                <div
                  key={tag}
                  onMouseEnter={(e) => handleMouseEnter(e, tag)}
                  onMouseLeave={() => setHoveredTag(null)}
                  onClick={(e) => {
                    if (e.shiftKey) {
                      addPillToTray(tag, activeTray, 1.2, activeMacroCategory);
                    } else {
                      addPillToTray(tag, activeTray, 1.0, activeMacroCategory);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    addPillToTray(tag, 'negative', 1.0, activeMacroCategory);
                  }}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#1c202a] border border-[#2b2f3a] text-gray-300 hover:border-indigo-500 hover:text-white cursor-pointer transition text-xs"
                >
                  <span>{tag}</span>
                  {count && settings.showPostCount && (
                    <span className="text-[9px] font-mono text-gray-500 bg-[#121418] px-1 py-0.2 rounded">
                      {formatCount(count)}
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Floating Danbooru Wiki & Cheat Sheet Popover */}
      {hoveredTag && popoverPos && (
        <div
          className="fixed z-50 w-72 bg-[#181a22] border border-[#2e3344] rounded-lg shadow-2xl p-2.5 text-xs text-gray-200 pointer-events-none"
          style={{ left: Math.min(popoverPos.x, window.innerWidth - 300), top: popoverPos.y }}
        >
          <div className="flex justify-between items-center border-b border-[#2e3344] pb-1 mb-1.5">
            <span className="font-bold text-indigo-300">{hoveredTag}</span>
            {danbooru.getPostCount(hoveredTag) && (
              <span className="text-[10px] text-gray-400 font-mono">
                {danbooru.getPostCount(hoveredTag)?.toLocaleString()} posts
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-300 line-clamp-3 mb-2 leading-relaxed">
            {danbooru.getTagDescription(hoveredTag) || 'No local wiki definition available.'}
          </p>
          <div className="text-[9px] text-gray-500 border-t border-[#252a35] pt-1 flex justify-between font-mono">
            <span>Click: Add</span>
            <span>Shift+Click: (1.20)</span>
            <span>Right-Click: Add Neg</span>
          </div>
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   2. EXTRA NETWORKS PANEL (LoRAs, EMBEDDINGS, WILDCARDS)
   ========================================================================= */
const ExtraNetworksPanel: React.FC<IDockviewPanelProps> = () => {
  const { lorasList, embeddingsList, wildcardsList, loadAssets, addPillToTray } = useAppStore();
  const [tab, setTab] = useState<'lora' | 'embedding' | 'wildcard'>('lora');
  const [search, setSearch] = useState('');
  const [weight, setWeight] = useState(1.0);

  const getActiveList = () => {
    if (tab === 'lora') return lorasList;
    if (tab === 'embedding') return embeddingsList;
    return wildcardsList;
  };

  const filtered = getActiveList().filter((item) => item.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full p-3 bg-[#121418] flex flex-col gap-2.5 text-xs select-none overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#252a35] pb-1.5">
        <div className="flex gap-1">
          <button
            onClick={() => setTab('lora')}
            className={`px-2 py-0.5 rounded text-xs ${tab === 'lora' ? 'bg-indigo-600 text-white' : 'bg-[#181a20] text-gray-400'}`}
          >
            LoRAs ({lorasList.length})
          </button>
          <button
            onClick={() => setTab('embedding')}
            className={`px-2 py-0.5 rounded text-xs ${tab === 'embedding' ? 'bg-indigo-600 text-white' : 'bg-[#181a20] text-gray-400'}`}
          >
            Embeddings ({embeddingsList.length})
          </button>
          <button
            onClick={() => setTab('wildcard')}
            className={`px-2 py-0.5 rounded text-xs ${tab === 'wildcard' ? 'bg-indigo-600 text-white' : 'bg-[#181a20] text-gray-400'}`}
          >
            Wildcards ({wildcardsList.length})
          </button>
        </div>
        <button onClick={() => loadAssets()} className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer">
          <RotateCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-3 h-3 absolute left-2 top-2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${tab}...`}
            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded pl-7 pr-2 py-1 text-xs text-gray-200 outline-none"
          />
        </div>
        {tab === 'lora' && (
          <div className="flex items-center gap-1 bg-[#181a20] border border-[#2b2f3a] px-2 rounded">
            <span className="text-[10px] text-gray-400">Weight:</span>
            <input
              type="number"
              step="0.05"
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="w-10 bg-transparent text-xs text-indigo-400 font-mono outline-none"
            />
          </div>
        )}
      </div>

      <div className="flex-1 grid grid-cols-2 gap-2 overflow-y-auto content-start pr-1">
        {filtered.map((item) => (
          <div
            key={item}
            onClick={() => {
              if (tab === 'lora') addPillToTray(`<lora:${item}:${weight}>`, 'positive', 1.0, 'LoRA');
              else if (tab === 'embedding') addPillToTray(`embedding:${item}`, 'positive', 1.0, 'Embedding');
              else addPillToTray(`<wildcard:${item}>`, 'positive', 1.0, 'Wildcard');
            }}
            className="border border-[#282c37] bg-[#16181f] p-2 rounded hover:border-indigo-500 cursor-pointer flex flex-col justify-between h-16 transition"
          >
            <span className="font-semibold text-gray-300 truncate" title={item}>{item}</span>
            <span className="text-[10px] text-indigo-400 font-mono bg-indigo-950/50 self-start px-1 py-0.2 rounded border border-indigo-500/30">
              + Inject
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* =========================================================================
   3. PARAMETERS PANEL (MODEL, VAE, CLIP)
   ========================================================================= */
const ParamsPanel: React.FC<IDockviewPanelProps> = () => {
  const {
    steps, cfgScale, width, height, seed, sampler, scheduler,
    model, modelsList, vae, vaesList, textEncoder, textEncodersList,
    setParams, setModel, loadAssets
  } = useAppStore();

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  return (
    <div className="h-full p-3 bg-[#121418] flex flex-col gap-3 text-xs overflow-y-auto select-none">
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-gray-400 font-medium">Checkpoint Model</label>
          <button onClick={() => loadAssets()} className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer">
            <RotateCw className="w-3 h-3" />
          </button>
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 outline-none"
        >
          {modelsList.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-gray-400 block mb-1">VAE</label>
          <select
            value={vae}
            onChange={(e) => setParams({ vae: e.target.value })}
            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 outline-none"
          >
            {vaesList.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-gray-400 block mb-1">Text Encoder (CLIP)</label>
          <select
            value={textEncoder}
            onChange={(e) => setParams({ textEncoder: e.target.value })}
            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 outline-none"
          >
            {textEncodersList.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-gray-400 block mb-1">Width</label>
          <input
            type="number"
            value={width}
            step="64"
            onChange={(e) => setParams({ width: Number(e.target.value) })}
            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 font-mono"
          />
        </div>
        <div>
          <label className="text-gray-400 block mb-1">Height</label>
          <input
            type="number"
            value={height}
            step="64"
            onChange={(e) => setParams({ height: Number(e.target.value) })}
            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 font-mono"
          />
        </div>
      </div>

      <div>
        <label className="text-gray-400 flex justify-between">
          <span>Steps</span>
          <span className="font-mono text-indigo-400">{steps}</span>
        </label>
        <input
          type="range"
          min="1"
          max="60"
          value={steps}
          onChange={(e) => setParams({ steps: Number(e.target.value) })}
          className="w-full mt-1 accent-indigo-500"
        />
      </div>

      <div>
        <label className="text-gray-400 flex justify-between">
          <span>CFG Scale</span>
          <span className="font-mono text-indigo-400">{cfgScale}</span>
        </label>
        <input
          type="range"
          min="1"
          max="20"
          step="0.5"
          value={cfgScale}
          onChange={(e) => setParams({ cfgScale: Number(e.target.value) })}
          className="w-full mt-1 accent-indigo-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-gray-400 block mb-1">Sampler</label>
          <select
            value={sampler}
            onChange={(e) => setParams({ sampler: e.target.value })}
            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 outline-none"
          >
            <option value="ER-SDE-Solver">ER-SDE-Solver</option>
            <option value="euler">Euler</option>
            <option value="euler_ancestral">Euler A</option>
            <option value="dpmpp_2m">DPM++ 2M</option>
            <option value="dpmpp_2s_ancestral">DPM++ 2S A</option>
          </select>
        </div>
        <div>
          <label className="text-gray-400 block mb-1">Scheduler</label>
          <select
            value={scheduler}
            onChange={(e) => setParams({ scheduler: e.target.value })}
            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 outline-none"
          >
            <option value="Normal">Normal</option>
            <option value="Karras">Karras</option>
            <option value="Exponential">Exponential</option>
            <option value="SGM_Uniform">SGM Uniform</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-gray-400 block mb-1">Seed (-1 for random)</label>
        <input
          type="number"
          value={seed}
          onChange={(e) => setParams({ seed: Number(e.target.value) })}
          className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 font-mono"
        />
      </div>
    </div>
  );
};

/* =========================================================================
   4. VIEWPORT, PROMPT, CONTROLNET, ADETAILER
   ========================================================================= */
const PreviewPanel: React.FC<IDockviewPanelProps> = () => {
  const { activeImage, livePreview, isGenerating, currentStep, maxSteps, progressPercent, metrics } = useAppStore();
  const displayImage = livePreview || activeImage;

  return (
    <div className="h-full relative flex flex-col items-center justify-center bg-[#0a0b0e] overflow-hidden select-none">
      {displayImage ? (
        <div className="relative h-full w-full flex items-center justify-center p-2">
          <img
            src={displayImage}
            alt="Viewport Canvas"
            className={`max-h-full max-w-full object-contain select-none transition-all ${
              livePreview && isGenerating ? 'filter blur-[0.5px]' : ''
            }`}
          />
        </div>
      ) : (
        <span className="text-neutral-600 text-sm">No image rendered yet</span>
      )}

      {(isGenerating || metrics.totalTime > 0) && (
        <div className="absolute bottom-4 left-4 right-4 bg-[#121418]/95 border border-[#2b2f3a] p-3 rounded-lg shadow-2xl backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between text-xs text-gray-300 mb-2 gap-2">
            <div className="flex items-center gap-2 font-mono">
              <span className="bg-indigo-600/30 text-indigo-300 px-2 py-0.5 rounded text-[11px] font-semibold border border-indigo-500/30">
                {metrics.stage}
              </span>
              <span>{currentStep} / {maxSteps} steps ({progressPercent}%)</span>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-gray-400 font-mono">
              {metrics.modelLoadTime !== null && (
                <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5 text-cyan-400" /> Load: {metrics.modelLoadTime}s</span>
              )}
              {metrics.speed !== null && (
                <span className="flex items-center gap-1"><Gauge className="w-3.5 h-3.5 text-amber-400" /> {metrics.speed} it/s</span>
              )}
              {metrics.eta !== null && isGenerating && (
                <span className="flex items-center gap-1 text-indigo-400 font-semibold"><Clock className="w-3.5 h-3.5" /> ETA: ~{metrics.eta}s</span>
              )}
              <span className="flex items-center gap-1 text-gray-200 font-medium">Total: {metrics.totalTime}s</span>
            </div>
          </div>
          <div className="w-full bg-[#1a1d24] h-2 rounded-full overflow-hidden border border-neutral-800">
            <div className="bg-linear-to-r from-indigo-500 to-cyan-400 h-full transition-all duration-100 ease-out" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}
    </div>
  );
};

const PromptPanel: React.FC<IDockviewPanelProps> = () => {
  const { prompt, setPrompt, negativePrompt, setNegativePrompt, enqueueAndProcess, cancelGeneration, isGenerating, model } = useAppStore();
  return (
    <div className="h-full flex flex-col p-3 gap-2 bg-[#121418] select-none">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Positive prompt..."
        className="flex-1 w-full bg-[#181a20] border border-[#2b2f3a] rounded p-2 text-sm text-gray-200 resize-none outline-none focus:border-indigo-500"
      />
      <textarea
        value={negativePrompt}
        onChange={(e) => setNegativePrompt(e.target.value)}
        placeholder="Negative prompt..."
        className="h-16 w-full bg-[#181a20] border border-[#2b2f3a] rounded p-2 text-sm text-gray-200 resize-none outline-none focus:border-indigo-500"
      />
      {isGenerating ? (
        <button onClick={cancelGeneration} className="w-full bg-rose-600 hover:bg-rose-500 font-semibold py-2.5 rounded text-white text-sm cursor-pointer shadow-lg">
          Cancel Generation
        </button>
      ) : (
        <button disabled={!model} onClick={enqueueAndProcess} className="w-full bg-indigo-600 hover:bg-indigo-500 font-semibold py-2.5 rounded text-white text-sm cursor-pointer shadow-lg flex items-center justify-center gap-2">
          <Wand2 className="w-4 h-4" /> Generate Image
        </button>
      )}
    </div>
  );
};

const ControlNetPanel: React.FC<IDockviewPanelProps> = () => (
  <div className="h-full p-3 bg-[#121418] flex flex-col gap-3 text-xs overflow-y-auto select-none">
    <div className="flex justify-between items-center border-b border-[#252a35] pb-2">
      <span className="font-semibold text-gray-200 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-indigo-400" /> ControlNet</span>
      <input type="checkbox" className="accent-indigo-500 w-4 h-4" />
    </div>
    <select className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200">
      <option value="canny">Canny</option>
      <option value="depth">Depth</option>
      <option value="openpose">OpenPose</option>
    </select>
  </div>
);

const ADetailerPanel: React.FC<IDockviewPanelProps> = () => (
  <div className="h-full p-3 bg-[#121418] flex flex-col gap-3 text-xs overflow-y-auto select-none">
    <div className="flex justify-between items-center border-b border-[#252a35] pb-2">
      <span className="font-semibold text-gray-200 flex items-center gap-1.5"><Sparkle className="w-3.5 h-3.5 text-amber-400" /> ADetailer</span>
      <input type="checkbox" className="accent-indigo-500 w-4 h-4" />
    </div>
    <select className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200">
      <option value="face_yolov8n.pt">face_yolov8n.pt (Face)</option>
      <option value="hand_yolov8n.pt">hand_yolov8n.pt (Hand)</option>
    </select>
  </div>
);

/* =========================================================================
   5. DOCKVIEW WORKSPACE CONTAINER
   ========================================================================= */
const components = {
  prompt: PromptPanel,
  pills: PromptPillsPanel,
  preview: PreviewPanel,
  params: ParamsPanel,
  controlnet: ControlNetPanel,
  adetailer: ADetailerPanel,
  extranetworks: ExtraNetworksPanel
};

export const Workspace: React.FC = () => {
  const [dockApi, setDockApi] = useState<DockviewApi | null>(null);

  const onReady = (event: DockviewReadyEvent) => {
    setDockApi(event.api);

    event.api.addPanel({
      id: 'params_panel',
      component: 'params',
      title: 'Parameters',
      initialWidth: 300
    });

    event.api.addPanel({
      id: 'preview_panel',
      component: 'preview',
      title: 'Viewport',
      position: { referencePanel: 'params_panel', direction: 'right' }
    });

    event.api.addPanel({
      id: 'prompt_panel',
      component: 'prompt',
      title: 'Prompts & Run',
      position: { referencePanel: 'preview_panel', direction: 'below' },
      initialHeight: 200
    });

    event.api.addPanel({
      id: 'pills_panel',
      component: 'pills',
      title: 'PromptPills Workspace',
      position: { referencePanel: 'params_panel', direction: 'below' }
    });
  };

  const addPanel = (type: string, title: string) => {
    if (!dockApi) return;
    dockApi.addPanel({
      id: `${type}_${Date.now()}`,
      component: type,
      title,
      position: { referencePanel: 'preview_panel', direction: 'within' }
    });
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-[#0f1115]">
      <div className="h-10 bg-[#14161b] border-b border-[#252a35] px-3 flex items-center justify-between select-none">
        <span className="font-semibold text-sm text-gray-200 flex items-center gap-1.5">
          <LayoutGrid className="w-4 h-4 text-indigo-400" /> SwarmCanvas
        </span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => addPanel('extranetworks', 'Extra Networks')}
            className="flex items-center gap-1 bg-[#1c202a] hover:bg-indigo-600 hover:text-white border border-[#2b2f3a] text-gray-300 text-xs px-2.5 py-1 rounded cursor-pointer transition"
          >
            <Plus className="w-3 h-3" /> Extra Networks
          </button>
          <button
            onClick={() => addPanel('controlnet', 'ControlNet')}
            className="flex items-center gap-1 bg-[#1c202a] hover:bg-indigo-600 hover:text-white border border-[#2b2f3a] text-gray-300 text-xs px-2.5 py-1 rounded cursor-pointer transition"
          >
            <Plus className="w-3 h-3" /> ControlNet
          </button>
          <button
            onClick={() => addPanel('adetailer', 'ADetailer')}
            className="flex items-center gap-1 bg-[#1c202a] hover:bg-indigo-600 hover:text-white border border-[#2b2f3a] text-gray-300 text-xs px-2.5 py-1 rounded cursor-pointer transition"
          >
            <Plus className="w-3 h-3" /> ADetailer
          </button>
        </div>
      </div>

      <div className="flex-1 w-full h-full">
        <DockviewReact components={components} onReady={onReady} className="dockview-theme-dark h-full w-full" />
      </div>
    </div>
  );
};