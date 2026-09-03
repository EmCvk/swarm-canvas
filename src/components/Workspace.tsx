import React, { useEffect, useState, useRef } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  DockviewApi,
  IDockviewPanelProps
} from 'dockview-react';
import { useAppStore, SWARM_VALID_SAMPLERS, SWARM_VALID_SCHEDULERS, ModelItem } from '../store/useAppStore';
import { danbooru, TagDetail } from '../api/danbooruService';
import { PromptAutosuggestTextarea } from './PromptAutosuggestTextarea';
import {
  Wand2, Plus, Clock, Cpu, Gauge,
  RotateCw, Search, Layers, Sparkle, LayoutGrid,
  Box, ZoomIn, ZoomOut, Maximize2,
  History as HistoryIcon, Image as ImageIcon,
  Grid, List, Sliders
} from 'lucide-react';

/* =========================================================================
   1. VIEWPORT CANVAS WITH PAN & ZOOM
   ========================================================================= */
const PreviewPanel: React.FC<IDockviewPanelProps> = () => {
  const { activeImage, livePreview, isGenerating, currentStep, maxSteps, progressPercent, metrics } = useAppStore();
  const displayImage = livePreview || activeImage;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoom((prev) => Math.max(0.1, Math.min(10, Number((prev + delta).toFixed(2)))));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      setIsDragging(true);
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div
      className="h-full w-full relative flex flex-col items-center justify-center bg-[#090a0d] overflow-hidden select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {displayImage ? (
        <div
          className="absolute transition-transform duration-75 cursor-grab active:cursor-grabbing"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center'
          }}
        >
          <img
            src={displayImage}
            alt="Viewport Output"
            draggable={false}
            className={`max-h-[85vh] max-w-[85vw] object-contain shadow-2xl pointer-events-none rounded ${
              livePreview && isGenerating ? 'filter blur-[0.5px]' : ''
            }`}
          />
        </div>
      ) : (
        <span className="text-neutral-600 text-xs">No image rendered yet</span>
      )}

      {/* Floating Viewport Toolset */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-[#14161f]/90 border border-[#2b2f3a] rounded-lg p-1 backdrop-blur-sm shadow-xl z-20">
        <button onClick={() => setZoom((z) => Math.min(10, z + 0.25))} className="p-1 hover:bg-[#252a36] text-gray-300 rounded" title="Zoom In">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-mono text-gray-400 px-1">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.max(0.1, z - 0.25))} className="p-1 hover:bg-[#252a36] text-gray-300 rounded" title="Zoom Out">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1 hover:bg-[#252a36] text-gray-300 rounded" title="Reset View">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress & Live Analytics */}
      {(isGenerating || metrics.totalTime > 0) && (
        <div className="absolute bottom-4 left-4 right-4 bg-[#121418]/95 border border-[#2b2f3a] p-3 rounded-lg shadow-2xl backdrop-blur-md z-20">
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

/* =========================================================================
   2. PROMPT & TWO-TIER DANBOORU BROWSER WORKSPACE
   ========================================================================= */
const PromptPillsPanel: React.FC<IDockviewPanelProps> = () => {
  const {
    prompt,
    negativePrompt,
    setPrompt,
    setNegativePrompt,
    activeMacroCategory,
    activeSubCategory,
    pillSearchQuery,
    setActiveMacroCategory,
    setActiveSubCategory,
    setPillSearchQuery,
    enqueueAndProcess,
    cancelGeneration,
    isGenerating,
    model
  } = useAppStore();

  const [activeTarget, setActiveTarget] = useState<'positive' | 'negative'>('positive');
  const [hoverDetail, setHoverDetail] = useState<TagDetail | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const parentCategories = danbooru.getParentCategories();

  // Set the first active parent category once loaded
  useEffect(() => {
    if (parentCategories.length > 0 && (!activeMacroCategory || !parentCategories.includes(activeMacroCategory))) {
      setActiveMacroCategory(parentCategories[0]);
      setActiveSubCategory('All');
    }
  }, [parentCategories, activeMacroCategory, setActiveMacroCategory, setActiveSubCategory]);

  const subCategories = danbooru.getSubCategories(activeMacroCategory);
  const currentTags = danbooru.getTags(activeMacroCategory, activeSubCategory, pillSearchQuery);

  const handleTagAction = (tag: string, e: React.MouseEvent) => {
    const clean = tag.replace(/_/g, ' ');
    let token = clean;

    if (e.shiftKey) {
      token = `(${clean}:1.2)`;
    }

    const targetBox = e.button === 2 ? (activeTarget === 'positive' ? 'negative' : 'positive') : activeTarget;

    if (targetBox === 'positive') {
      const current = prompt.trim();
      setPrompt(current ? `${current}, ${token}` : token);
    } else {
      const current = negativePrompt.trim();
      setNegativePrompt(current ? `${current}, ${token}` : token);
    }
  };

  const handleTagHover = (e: React.MouseEvent, tag: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: rect.left, y: rect.bottom + 6 });
    setHoverDetail(danbooru.getTagDetail(tag, activeMacroCategory, activeSubCategory));
  };

  const formatCount = (n: number | null) => {
    if (!n) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return n.toString();
  };

  return (
    <div className="h-full flex flex-col bg-[#0d0e12] select-none text-xs overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
      {/* Top Prompt Textboxes */}
      <div className="p-2 border-b border-[#232631] bg-[#12141a] flex flex-col gap-2 shrink-0">
        <div className="flex gap-2 h-20">
          <div className="flex-1 flex flex-col" onClick={() => setActiveTarget('positive')}>
            <div className="flex justify-between items-center mb-1">
              <span className={`font-mono text-[11px] font-semibold ${activeTarget === 'positive' ? 'text-indigo-400' : 'text-gray-400'}`}>
                Positive Prompt
              </span>
              <span className="text-[10px] text-gray-500 font-mono">{prompt.length} chars</span>
            </div>
            <PromptAutosuggestTextarea
              value={prompt}
              onChange={setPrompt}
              placeholder="Type prompt here..."
              target="positive"
            />
          </div>

          <div className="w-1/3 flex flex-col" onClick={() => setActiveTarget('negative')}>
            <div className="flex justify-between items-center mb-1">
              <span className={`font-mono text-[11px] font-semibold ${activeTarget === 'negative' ? 'text-rose-400' : 'text-gray-400'}`}>
                Negative Prompt
              </span>
              <span className="text-[10px] text-gray-500 font-mono">{negativePrompt.length} chars</span>
            </div>
            <PromptAutosuggestTextarea
              value={negativePrompt}
              onChange={setNegativePrompt}
              placeholder="low quality, blurry..."
              target="negative"
            />
          </div>

          <div className="w-28 flex flex-col justify-end">
            {isGenerating ? (
              <button
                onClick={cancelGeneration}
                className="w-full h-full max-h-14 bg-rose-600 hover:bg-rose-500 font-semibold rounded text-white text-xs cursor-pointer shadow-lg transition flex items-center justify-center gap-1"
              >
                Cancel
              </button>
            ) : (
              <button
                disabled={!model}
                onClick={enqueueAndProcess}
                className={`w-full h-full max-h-14 font-semibold rounded text-white text-xs cursor-pointer shadow-lg transition flex flex-col items-center justify-center gap-1 ${
                  !model
                    ? 'bg-neutral-700 cursor-not-allowed text-neutral-400'
                    : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Generate</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Two-Tier Browser (Matching Extension Screenshots) */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#0c0d12]">
        {/* Tier 1: Parent Categories */}
        <div className="flex gap-1 overflow-x-auto p-1.5 border-b border-[#20232c] scrollbar-none bg-[#111318]">
          {parentCategories.map((parent) => {
            const count = danbooru.getParentCount(parent);
            const isActive = activeMacroCategory === parent;
            return (
              <button
                key={parent}
                onClick={() => {
                  setActiveMacroCategory(parent);
                  setActiveSubCategory('All');
                }}
                className={`px-3 py-1 rounded text-xs whitespace-nowrap cursor-pointer transition ${
                  isActive
                    ? 'bg-[#4f46e5] text-white font-semibold shadow-md'
                    : 'bg-[#181a20] border border-[#252833] text-gray-400 hover:text-gray-200'
                }`}
              >
                <span>{parent}</span>
                <span className={`ml-1 text-[11px] ${isActive ? 'text-indigo-200' : 'text-gray-500'}`}>
                  ({count.toLocaleString()})
                </span>
              </button>
            );
          })}
        </div>

        {/* Tier 2: Subcategory Chips */}
        <div className="flex items-center gap-2 p-1.5 border-b border-[#20232c] bg-[#13151b]">
          <div className="relative w-44">
            <Search className="w-3 h-3 absolute left-2 top-2 text-gray-400" />
            <input
              type="text"
              value={pillSearchQuery}
              onChange={(e) => setPillSearchQuery(e.target.value)}
              placeholder="Filter category tags.."
              className="w-full bg-[#181a22] border border-[#262a36] rounded pl-6 pr-2 py-0.5 text-xs text-gray-200 outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-none">
            {subCategories.map((sub) => {
              const count = danbooru.getSubCount(activeMacroCategory, sub);
              const isActive = activeSubCategory === sub;
              return (
                <button
                  key={sub}
                  onClick={() => setActiveSubCategory(sub)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition ${
                    isActive
                      ? 'bg-[#7c3aed] text-white font-medium shadow-sm'
                      : 'bg-[#181a20] border border-[#252833] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <span>{sub}</span>
                  <span className={`ml-1 ${isActive ? 'text-purple-200' : 'text-gray-500'}`}>
                    ({count.toLocaleString()})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tier 3: `+ tag` Pills Grid */}
        <div className="flex-1 p-2 overflow-y-auto content-start flex flex-wrap gap-1.5 bg-[#0a0b0e]">
          {currentTags.length === 0 ? (
            <span className="text-gray-600 m-auto text-xs">
              No tags found under {activeMacroCategory} → {activeSubCategory}.
            </span>
          ) : (
            currentTags.map((tag) => {
              const count = danbooru.getPostCount(tag);
              return (
                <div
                  key={tag}
                  onMouseEnter={(e) => handleTagHover(e, tag)}
                  onMouseLeave={() => setHoverDetail(null)}
                  onClick={(e) => handleTagAction(tag, e)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    handleTagAction(tag, e);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#16181f] border border-[#232733] text-gray-300 hover:border-indigo-500 hover:text-white cursor-pointer transition text-xs select-none"
                >
                  <span className="text-gray-500 text-[11px]">+</span>
                  <span>{tag.replace(/_/g, ' ')}</span>
                  {count && (
                    <span className="text-[10px] font-mono text-gray-500 bg-[#0f1015] px-1 rounded">
                      {formatCount(count)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Floating Extension-Style Wiki Popover */}
      {hoverDetail && tooltipPos && (
        <div
          className="fixed z-50 w-72 bg-[#15161d] border border-[#2c303f] rounded-lg shadow-2xl p-3 text-xs text-gray-200 pointer-events-none"
          style={{
            left: Math.min(tooltipPos.x, window.innerWidth - 300),
            top: Math.min(tooltipPos.y, window.innerHeight - 170)
          }}
        >
          <div className="font-bold text-sm text-gray-100 mb-1">{hoverDetail.tag.replace(/_/g, ' ')}</div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] bg-[#1e2029] text-gray-300 px-1.5 py-0.5 rounded font-mono">
              {hoverDetail.subCategory}
            </span>
            {hoverDetail.postCount && (
              <span className="text-[10px] bg-[#1c2035] text-indigo-300 px-1.5 py-0.5 rounded font-mono">
                {hoverDetail.postCount.toLocaleString()} posts
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-300 leading-relaxed mb-3 max-h-24 overflow-y-auto">
            {hoverDetail.description || 'No wiki definition available.'}
          </p>
          <div className="text-[10px] text-gray-400 border-t border-[#232633] pt-1.5 flex flex-col gap-0.5 font-mono">
            <span><b>Click:</b> Add to Active</span>
            <span><b>Shift+Click:</b> (1.2x)</span>
            <span><b>Right-Click:</b> Negative</span>
          </div>
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   3. EXTRA NETWORKS PANEL
   ========================================================================= */
const ExtraNetworksPanel: React.FC<IDockviewPanelProps> = () => {
  const { lorasList, embeddingsList, wildcardsList, loadAssets, prompt, setPrompt } = useAppStore();
  const [tab, setTab] = useState<'lora' | 'embedding' | 'wildcard'>('lora');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [search, setSearch] = useState('');
  const [weight, setWeight] = useState(1.0);

  const getActiveList = (): ModelItem[] => {
    if (tab === 'lora') return lorasList;
    if (tab === 'embedding') return embeddingsList;
    return wildcardsList.map((w) => ({ name: w, previewUrl: undefined }));
  };

  const filtered = getActiveList().filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));

  const injectAsset = (name: string) => {
    let token = '';
    if (tab === 'lora') token = `<lora:${name}:${weight}>`;
    else if (tab === 'embedding') token = `embedding:${name}`;
    else token = `<wildcard:${name}>`;

    setPrompt(prompt.trim() ? `${prompt.trim()}, ${token}` : token);
  };

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
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode(viewMode === 'cards' ? 'list' : 'cards')}
            className="p-1 hover:bg-[#202430] text-gray-300 rounded cursor-pointer"
            title="Toggle View"
          >
            {viewMode === 'cards' ? <List className="w-3.5 h-3.5" /> : <Grid className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => loadAssets()} className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer">
            <RotateCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-gray-400" />
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

      <div className={`flex-1 overflow-y-auto pr-1 ${viewMode === 'cards' ? 'grid grid-cols-3 gap-2' : 'flex flex-col gap-1'}`}>
        {filtered.map((item) => (
          <div
            key={item.name}
            onClick={() => injectAsset(item.name)}
            className={`border border-[#282c37] bg-[#16181f] rounded hover:border-indigo-500 cursor-pointer transition flex ${
              viewMode === 'cards' ? 'flex-col h-40 overflow-hidden' : 'items-center justify-between p-2'
            }`}
          >
            {viewMode === 'cards' ? (
              <>
                <div className="h-28 w-full bg-[#0d0e12] overflow-hidden flex items-center justify-center relative">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <Box className="w-8 h-8 text-neutral-700" />
                  )}
                  <span className="absolute bottom-1 right-1 text-[9px] bg-black/60 font-mono text-indigo-300 px-1 py-0.2 rounded">
                    {tab}
                  </span>
                </div>
                <div className="p-1.5 flex flex-col justify-center">
                  <span className="font-semibold text-gray-300 text-[11px] truncate" title={item.name}>{item.name}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 truncate">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="thumb" className="w-7 h-7 rounded object-cover" />
                  ) : (
                    <Box className="w-5 h-5 text-neutral-600" />
                  )}
                  <span className="font-medium text-gray-300 text-xs truncate">{item.name}</span>
                </div>
                <span className="text-[10px] text-indigo-400 font-mono bg-indigo-950/50 px-1.5 py-0.5 rounded border border-indigo-500/30">
                  + Insert
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/* =========================================================================
   4. GENERATION HISTORY
   ========================================================================= */
const HistoryPanel: React.FC<IDockviewPanelProps> = () => {
  const { history, setParams } = useAppStore();
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

  return (
    <div className="h-full p-3 bg-[#121418] flex flex-col gap-2.5 overflow-hidden select-none text-xs">
      <div className="flex items-center justify-between border-b border-[#252a35] pb-1.5">
        <span className="font-semibold text-gray-300 flex items-center gap-1">
          <HistoryIcon className="w-3.5 h-3.5 text-indigo-400" /> Output History ({history.length})
        </span>
        <button
          onClick={() => setViewMode(viewMode === 'cards' ? 'list' : 'cards')}
          className="p-1 hover:bg-[#202430] text-gray-300 rounded cursor-pointer"
          title="Toggle View"
        >
          {viewMode === 'cards' ? <List className="w-3.5 h-3.5" /> : <Grid className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto pr-1 ${viewMode === 'cards' ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'}`}>
        {history.length === 0 ? (
          <span className="text-gray-600 m-auto">No generations recorded.</span>
        ) : (
          history.map((item) => (
            <div
              key={item.id}
              onClick={() => setParams({ activeImage: item.imageUrl })}
              className={`border border-[#252a35] bg-[#161821] rounded hover:border-indigo-500 cursor-pointer transition flex ${
                viewMode === 'cards' ? 'flex-col p-1.5 gap-1.5' : 'items-center gap-2 p-2'
              }`}
            >
              <img
                src={item.imageUrl}
                alt="thumb"
                className={`rounded object-cover ${viewMode === 'cards' ? 'w-full h-32' : 'w-14 h-14'}`}
              />
              <div className="flex-1 flex flex-col overflow-hidden">
                <span className="text-[11px] text-gray-300 truncate" title={item.prompt}>{item.prompt}</span>
                <div className="flex flex-wrap gap-1 font-mono text-[9px] text-gray-500 mt-1">
                  <span>{item.params.model.split('/').pop()}</span>
                  <span>•</span>
                  <span>{item.params.steps} steps</span>
                  <span>•</span>
                  <span>{item.createdAt}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   5. IMAGE SEARCH PANEL
   ========================================================================= */
const ImageSearchPanel: React.FC<IDockviewPanelProps> = () => {
  const { history, setParams } = useAppStore();
  const [query, setQuery] = useState('');

  const filtered = history.filter(
    (h) => h.prompt.toLowerCase().includes(query.toLowerCase()) || h.params.model.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="h-full p-3 bg-[#121418] flex flex-col gap-2.5 text-xs select-none overflow-hidden">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search metadata across generated history..."
          className="w-full bg-[#181a20] border border-[#2b2f3a] rounded pl-8 pr-2 py-1 text-xs text-gray-200 outline-none focus:border-indigo-500"
        />
      </div>

      <div className="flex-1 grid grid-cols-2 gap-2 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <span className="text-gray-600 m-auto col-span-2">No matching items found.</span>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setParams({ activeImage: item.imageUrl })}
              className="border border-[#252a35] bg-[#161821] p-1.5 rounded hover:border-indigo-500 cursor-pointer flex flex-col gap-1"
            >
              <img src={item.imageUrl} alt="search thumb" className="w-full h-24 object-cover rounded" />
              <span className="text-[10px] text-gray-300 truncate">{item.prompt}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   6. CONTROLNET PANEL
   ========================================================================= */
const ControlNetPanel: React.FC<IDockviewPanelProps> = () => {
  const { controlNetUnits, updateControlNet } = useAppStore();
  const [activeUnitId, setActiveUnitId] = useState('1');

  const activeUnit = controlNetUnits.find((u) => u.id === activeUnitId) || controlNetUnits[0];

  return (
    <div className="h-full p-3 bg-[#121418] flex flex-col gap-3 text-xs overflow-y-auto select-none">
      <div className="flex gap-1 border-b border-[#252a35] pb-2">
        {controlNetUnits.map((unit) => (
          <button
            key={unit.id}
            onClick={() => setActiveUnitId(unit.id)}
            className={`px-2.5 py-1 rounded text-xs flex items-center gap-1.5 cursor-pointer ${
              activeUnitId === unit.id ? 'bg-indigo-600 text-white font-medium' : 'bg-[#181a20] text-gray-400'
            }`}
          >
            <span>Unit {unit.id}</span>
            {unit.enabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center bg-[#181a20] p-2 rounded border border-[#2b2f3a]">
        <label className="font-semibold text-gray-200 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-indigo-400" /> Enable Unit {activeUnit.id}
        </label>
        <input
          type="checkbox"
          checked={activeUnit.enabled}
          onChange={(e) => updateControlNet(activeUnit.id, { enabled: e.target.checked })}
          className="accent-indigo-500 w-4 h-4 cursor-pointer"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-gray-400 block mb-1">Preprocessor</label>
          <select
            value={activeUnit.preprocessor}
            onChange={(e) => updateControlNet(activeUnit.id, { preprocessor: e.target.value })}
            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 outline-none"
          >
            <option value="canny">Canny Edge</option>
            <option value="depth">Depth</option>
            <option value="openpose">OpenPose</option>
            <option value="lineart">LineArt</option>
          </select>
        </div>
        <div>
          <label className="text-gray-400 block mb-1">Control Mode</label>
          <select
            value={activeUnit.controlMode}
            onChange={(e) => updateControlNet(activeUnit.id, { controlMode: e.target.value as any })}
            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 outline-none"
          >
            <option value="balanced">Balanced</option>
            <option value="prompt_priority">Prompt Priority</option>
            <option value="controlnet_priority">ControlNet Priority</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-gray-400 flex justify-between">
          <span>Weight</span>
          <span className="font-mono text-indigo-400">{activeUnit.weight}</span>
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.05"
          value={activeUnit.weight}
          onChange={(e) => updateControlNet(activeUnit.id, { weight: Number(e.target.value) })}
          className="w-full mt-1 accent-indigo-500"
        />
      </div>
    </div>
  );
};

/* =========================================================================
   7. ADETAILER PANEL
   ========================================================================= */
const ADetailerPanel: React.FC<IDockviewPanelProps> = () => {
  const { aDetailerUnits, updateADetailer } = useAppStore();
  const [activeId, setActiveId] = useState('1');

  const unit = aDetailerUnits.find((u) => u.id === activeId) || aDetailerUnits[0];

  return (
    <div className="h-full p-3 bg-[#121418] flex flex-col gap-3 text-xs overflow-y-auto select-none">
      <div className="flex gap-1 border-b border-[#252a35] pb-2">
        {aDetailerUnits.map((u) => (
          <button
            key={u.id}
            onClick={() => setActiveId(u.id)}
            className={`px-2.5 py-1 rounded text-xs flex items-center gap-1.5 cursor-pointer ${
              activeId === u.id ? 'bg-indigo-600 text-white font-medium' : 'bg-[#181a20] text-gray-400'
            }`}
          >
            <span>Pass {u.id}</span>
            {u.enabled && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center bg-[#181a20] p-2 rounded border border-[#2b2f3a]">
        <label className="font-semibold text-gray-200 flex items-center gap-1.5">
          <Sparkle className="w-3.5 h-3.5 text-amber-400" /> Enable Pass {unit.id}
        </label>
        <input
          type="checkbox"
          checked={unit.enabled}
          onChange={(e) => updateADetailer(unit.id, { enabled: e.target.checked })}
          className="accent-indigo-500 w-4 h-4 cursor-pointer"
        />
      </div>

      <div>
        <label className="text-gray-400 block mb-1">Model Target</label>
        <select
          value={unit.model}
          onChange={(e) => updateADetailer(unit.id, { model: e.target.value })}
          className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 outline-none"
        >
          <option value="face_yolov8n.pt">face_yolov8n.pt (Face Detection)</option>
          <option value="hand_yolov8n.pt">hand_yolov8n.pt (Hand Detection)</option>
          <option value="person_yolov8n.pt">person_yolov8n.pt (Whole Body)</option>
        </select>
      </div>

      <div>
        <label className="text-gray-400 flex justify-between">
          <span>Confidence Threshold</span>
          <span className="font-mono text-indigo-400">{unit.confidence}</span>
        </label>
        <input
          type="range"
          min="0.1"
          max="0.9"
          step="0.05"
          value={unit.confidence}
          onChange={(e) => updateADetailer(unit.id, { confidence: Number(e.target.value) })}
          className="w-full mt-1 accent-indigo-500"
        />
      </div>

      <div>
        <label className="text-gray-400 flex justify-between">
          <span>Denoising Strength</span>
          <span className="font-mono text-indigo-400">{unit.denoiseStrength}</span>
        </label>
        <input
          type="range"
          min="0.1"
          max="0.8"
          step="0.05"
          value={unit.denoiseStrength}
          onChange={(e) => updateADetailer(unit.id, { denoiseStrength: Number(e.target.value) })}
          className="w-full mt-1 accent-indigo-500"
        />
      </div>
    </div>
  );
};

/* =========================================================================
   8. PARAMETERS PANEL
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
            <option key={m.name} value={m.name}>{m.name}</option>
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
            {SWARM_VALID_SAMPLERS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-gray-400 block mb-1">Scheduler</label>
          <select
            value={scheduler}
            onChange={(e) => setParams({ scheduler: e.target.value })}
            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 outline-none"
          >
            {SWARM_VALID_SCHEDULERS.map((sc) => (
              <option key={sc} value={sc}>{sc}</option>
            ))}
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
   9. WORKSPACE CONTAINER
   ========================================================================= */
const components = {
  params: ParamsPanel,
  preview: PreviewPanel,
  extranetworks: ExtraNetworksPanel,
  controlnet: ControlNetPanel,
  adetailer: ADetailerPanel,
  history: HistoryPanel,
  imagesearch: ImageSearchPanel
};

export const Workspace: React.FC = () => {
  const { uiScale, setUiScale } = useAppStore();
  const [dockApi, setDockApi] = useState<DockviewApi | null>(null);
  const [isTopBarCollapsed, setIsTopBarCollapsed] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const [triggerPos, setTriggerPos] = useState({ x: 12, y: 12 });
  const isDraggingTrigger = useRef(false);
  const dragTriggerOffset = useRef({ x: 0, y: 0 });

  const [bottomHeight, setBottomHeight] = useState(340);
  const isResizingBottom = useRef(false);

  const onReady = (event: DockviewReadyEvent) => {
    setDockApi(event.api);

    event.api.addPanel({
      id: 'params_panel',
      component: 'params',
      title: 'Parameters',
      initialWidth: 320
    });

    event.api.addPanel({
      id: 'preview_panel',
      component: 'preview',
      title: 'Viewport',
      position: { referencePanel: 'params_panel', direction: 'right' }
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
    setShowAddMenu(false);
  };

  const handleTriggerMouseDown = (e: React.MouseEvent) => {
    isDraggingTrigger.current = true;
    dragTriggerOffset.current = {
      x: e.clientX - triggerPos.x,
      y: e.clientY - triggerPos.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingTrigger.current) {
        setTriggerPos({
          x: Math.max(0, Math.min(window.innerWidth - 40, e.clientX - dragTriggerOffset.current.x)),
          y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragTriggerOffset.current.y))
        });
      }
      if (isResizingBottom.current) {
        const newHeight = window.innerHeight - e.clientY;
        setBottomHeight(Math.max(160, Math.min(window.innerHeight - 150, newHeight)));
      }
    };

    const handleMouseUp = () => {
      isDraggingTrigger.current = false;
      isResizingBottom.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [triggerPos]);

  return (
    <div
      className="w-screen h-screen flex flex-col bg-[#0f1115] overflow-hidden"
      style={{ zoom: `${uiScale}%` }}
    >
      {!isTopBarCollapsed ? (
        <div className="h-9 bg-[#13151b] border-b border-[#252a35] px-3 flex items-center justify-between select-none shrink-0 z-30">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsTopBarCollapsed(true)}
              title="Click to collapse header into movable trigger"
              className="p-1 hover:bg-[#202430] rounded cursor-pointer transition text-indigo-400 hover:text-white"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <span className="font-semibold text-xs text-gray-200">SwarmCanvas</span>
          </div>

          <div className="flex items-center gap-2 bg-[#181b24] border border-[#2b2f3a] px-2.5 py-0.5 rounded-md">
            <Sliders className="w-3 h-3 text-gray-400" />
            <span className="text-[10px] text-gray-400 font-mono">UI Scale:</span>
            <input
              type="range"
              min="75"
              max="150"
              step="5"
              value={uiScale}
              onChange={(e) => setUiScale(Number(e.target.value))}
              className="w-24 h-1 bg-[#252a36] rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <span className="text-[10px] text-indigo-400 font-mono w-8 text-right">{uiScale}%</span>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="p-1 bg-[#1a1d26] hover:bg-indigo-600 hover:text-white border border-[#2b2f3a] text-gray-300 rounded cursor-pointer transition flex items-center gap-1 text-xs px-2"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            {showAddMenu && (
              <div className="absolute right-0 top-7 w-48 bg-[#181a22] border border-[#2b2f3a] rounded-lg shadow-2xl py-1 z-50 flex flex-col text-xs text-gray-200">
                <button onClick={() => addPanel('adetailer', 'ADetailer')} className="px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center gap-2 cursor-pointer">
                  <Sparkle className="w-3.5 h-3.5 text-amber-400" /> ADetailer
                </button>
                <button onClick={() => addPanel('controlnet', 'ControlNet')} className="px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center gap-2 cursor-pointer">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" /> ControlNet
                </button>
                <button onClick={() => addPanel('extranetworks', 'Extra Networks')} className="px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center gap-2 cursor-pointer">
                  <Box className="w-3.5 h-3.5 text-emerald-400" /> Extra Networks
                </button>
                <button onClick={() => addPanel('history', 'Output History')} className="px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center gap-2 cursor-pointer">
                  <HistoryIcon className="w-3.5 h-3.5 text-cyan-400" /> Output History
                </button>
                <button onClick={() => addPanel('imagesearch', 'Image Search')} className="px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center gap-2 cursor-pointer">
                  <ImageIcon className="w-3.5 h-3.5 text-purple-400" /> Image Search
                </button>
                <div className="h-px bg-[#252a35] my-1" />
                <button onClick={() => addPanel('params', 'Parameters')} className="px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white cursor-pointer">
                  Parameters
                </button>
                <button onClick={() => addPanel('preview', 'Viewport')} className="px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white cursor-pointer">
                  Viewport
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          onMouseDown={handleTriggerMouseDown}
          onClick={() => {
            if (!isDraggingTrigger.current) setIsTopBarCollapsed(false);
          }}
          style={{ left: `${triggerPos.x}px`, top: `${triggerPos.y}px` }}
          title="Drag to reposition / Click to restore top bar"
          className="fixed z-50 p-2 bg-[#14161f]/90 border border-[#3b4254] text-indigo-400 hover:text-white rounded-xl shadow-2xl backdrop-blur-md cursor-move active:scale-95 transition-transform"
        >
          <LayoutGrid className="w-4 h-4 pointer-events-none" />
        </div>
      )}

      <div className="flex-1 w-full min-h-0">
        <DockviewReact components={components} onReady={onReady} className="dockview-theme-dark h-full w-full" />
      </div>

      <div
        onMouseDown={() => (isResizingBottom.current = true)}
        className="h-1.5 w-full bg-[#181b24] hover:bg-indigo-500 cursor-row-resize shrink-0 transition-colors z-20 border-t border-[#252a35]"
      />

      <div style={{ height: `${bottomHeight}px` }} className="w-full shrink-0 flex flex-col bg-[#0f1115]">
        <PromptPillsPanel
          api={{} as any}
          containerApi={{} as any}
          params={{}}
        />
      </div>
    </div>
  );
};