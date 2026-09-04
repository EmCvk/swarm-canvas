import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  DockviewApi,
  IDockviewPanelProps
} from 'dockview-react';
import {
  useAppStore,
  SWARM_VALID_SAMPLERS,
  SWARM_VALID_SCHEDULERS,
  ModelItem,
  AppSettings,
  HistoryItem
} from '../store/useAppStore';
import { danbooru, TagDetail } from '../api/danbooruService';
import { PromptAutosuggestTextarea } from './PromptAutosuggestTextarea';
import { CustomContextMenu, ContextMenuItem } from './CustomContextMenu';
import { ModelPlaceholder } from './ModelPlaceholder';
import {
  Wand2, Plus, Clock, Cpu, Gauge,
  RotateCw, Search, Layers, Sparkle, LayoutGrid,
  Box, ZoomIn, ZoomOut, Maximize2, Minimize2,
  History as HistoryIcon, Image as ImageIcon,
  Grid, List, Sliders, ChevronLeft, ChevronRight,
  Settings, Copy, Trash2, ExternalLink, Download, ArrowUpRight,
  SplitSquareVertical, Globe, Check,
  Dices, Lock, Unlock, AlertTriangle, Zap, Eye, EyeOff, Terminal, Star, Info, Volume2, Play, Sparkles, Crop, Type
} from 'lucide-react';

/* =========================================================================
   STAGE COLOR MAP & CONTEXT CO-OCCURRENCE DICTIONARY
   ========================================================================= */
const STAGE_COLOR_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  '1. Subject & Count': { border: 'border-cyan-500/40', bg: 'bg-cyan-500/10', text: 'text-cyan-400' },
  '2. Characters & Series': { border: 'border-orange-500/40', bg: 'bg-orange-500/10', text: 'text-orange-400' },
  '3. Animals & Creatures': { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  '4. Face & Hair': { border: 'border-purple-500/40', bg: 'bg-purple-500/10', text: 'text-purple-400' },
  '5. Body & Physiology': { border: 'border-rose-500/40', bg: 'bg-rose-500/10', text: 'text-rose-400' },
  '6. Wardrobe & Outfit': { border: 'border-teal-500/40', bg: 'bg-teal-500/10', text: 'text-teal-400' },
  '7. Pose & Action': { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  '8. Props & Weapons': { border: 'border-blue-500/40', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  '9. Environment & Setting': { border: 'border-lime-500/40', bg: 'bg-lime-500/10', text: 'text-lime-400' },
  '10. Camera & Composition': { border: 'border-indigo-500/40', bg: 'bg-indigo-500/10', text: 'text-indigo-400' },
  '11. Style & Aesthetics': { border: 'border-fuchsia-500/40', bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-400' },
  '12. Artists': { border: 'border-violet-500/40', bg: 'bg-violet-500/10', text: 'text-violet-400' },
  '13. Themes, Lore & Adult': { border: 'border-slate-500/40', bg: 'bg-slate-500/10', text: 'text-slate-400' }
};

const CONFLICT_LINTER_RULES = [
  {
    setA: ['closed_eyes', 'eyes_closed', 'blindfold'],
    setB: ['looking_at_viewer', 'looking_away', 'looking_back', 'blue_eyes', 'red_eyes', 'heterochromia'],
    message: 'Closed eyes / blindfold conflicts with visible eye colors or gaze'
  },
  {
    setA: ['short_hair', 'very_short_hair'],
    setB: ['long_hair', 'very_long_hair', 'absurdly_long_hair'],
    message: 'Short hair conflicts with long hair'
  },
  {
    setA: ['indoors', 'indoor'],
    setB: ['outdoors', 'outdoor', 'sky', 'cloudy_sky', 'blue_sky', 'sunlight'],
    message: 'Indoors conflicts with outdoor sky or weather'
  },
  {
    setA: ['day', 'sunlight'],
    setB: ['night', 'moonlight', 'starry_sky'],
    message: 'Daylight conflicts with nighttime/moonlight'
  },
  {
    setA: ['standing'],
    setB: ['sitting', 'lying', 'kneeling', 'squatting'],
    message: 'Standing conflicts with sitting or lying'
  },
  {
    setA: ['monochrome', 'greyscale'],
    setB: ['colorful', 'rainbow', 'multicolored_hair'],
    message: 'Monochrome/greyscale conflicts with colorful tags'
  }
];

const CO_OCCURRENCE_RULES: { triggers: string[]; suggestions: string[] }[] = [
  { triggers: ['swimsuit', 'bikini', 'barefoot'], suggestions: ['beach', 'poolside', 'water', 'sunlight', 'ocean', 'wet'] },
  { triggers: ['school_uniform', 'serafuku', 'blazer'], suggestions: ['classroom', 'school', 'desk', 'pleated_skirt', 'loafers'] },
  { triggers: ['kimono', 'yukata', 'haori'], suggestions: ['geta', 'torii', 'shrine', 'cherry_blossoms', 'tatami'] },
  { triggers: ['maid', 'apron', 'maid_headdress'], suggestions: ['tray', 'tea', 'kitchen', 'indoors', 'serving'] },
  { triggers: ['sitting', 'lying', 'kneeling'], suggestions: ['chair', 'bed', 'couch', 'grass', 'floor'] },
  { triggers: ['sword', 'katana', 'blade'], suggestions: ['holding_sword', 'sheath', 'fighting_stance', 'battlefield'] },
  { triggers: ['gun', 'pistol', 'rifle'], suggestions: ['holding_gun', 'pointing_gun', 'trigger', 'muzzle_flash'] },
  { triggers: ['rain', 'wet'], suggestions: ['umbrella', 'puddle', 'wet_clothes', 'droplets'] },
  { triggers: ['night', 'dark'], suggestions: ['moonlight', 'stars', 'night_sky', 'glowing'] },
  { triggers: ['cat_ears', 'cat_girl'], suggestions: ['cat_tail', 'cat', 'meowing', 'paws'] },
  { triggers: ['fox_ears', 'kitsune'], suggestions: ['fox_tail', 'fox', 'shrine', 'torii'] },
  { triggers: ['dragon', 'dragon_girl'], suggestions: ['dragon_horns', 'dragon_wings', 'dragon_tail', 'fire', 'claws'] }
];

export const resolveImageUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  const serverUrl = useAppStore.getState().serverUrl || 'http://localhost:7801';
  const cleanServer = serverUrl.replace(/\/+$/, '');
  const cleanPath = url.replace(/^\/+/, '');

  if (!cleanPath.startsWith('View/')) {
    return `${cleanServer}/View/${cleanPath}`;
  }

  return `${cleanServer}/${cleanPath}`;
};

/* =========================================================================
   1. VIEWPORT CANVAS
   ========================================================================= */
const PreviewPanel: React.FC<IDockviewPanelProps> = () => {
  const store = useAppStore() as any;
  const {
    activeImage, livePreview, isGenerating, currentStep, maxSteps,
    progressPercent, metrics, setParams, comparisonImage, isComparing,
    compareSplit, setIsComparing, setComparisonImage, setCompareSplit, history,
    cancelGeneration, settings, updateSettings, enqueueAndProcess,
    setActiveContextMenu
  } = store;

  const queue: any[] = store.queue || [];
  const activeJob: any = store.activeJob || null;
  const displayImage = livePreview || activeImage;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  const [isCropMode, setIsCropMode] = useState(false);
  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const cropStart = useRef<{ x: number; y: number } | null>(null);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoom((prev) => Math.max(0.1, Math.min(10, Number((prev + delta).toFixed(2)))));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isDraggingSlider) return;
    if (isCropMode && e.button === 0) {
      const rect = canvasContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      cropStart.current = { x, y };
      setCropBox({ x, y, width: 0, height: 0 });
      return;
    }
    if (e.button === 0 || e.button === 1) {
      setIsDragging(true);
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isCropMode && cropStart.current && canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      const x = Math.min(cropStart.current.x, currentX);
      const y = Math.min(cropStart.current.y, currentY);
      const width = Math.abs(currentX - cropStart.current.x);
      const height = Math.abs(currentY - cropStart.current.y);

      setCropBox({ x, y, width, height });
      return;
    }
    if (isDraggingSlider && canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (relativeX / rect.width) * 100));
      setCompareSplit(Math.round(pct));
      return;
    }
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsDraggingSlider(false);
    cropStart.current = null;
  };

  const resetTransform = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleViewportContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        label: 'Reset Zoom & Center',
        icon: <Maximize2 className="w-3.5 h-3.5" />,
        action: resetTransform
      },
      {
        label: isCropMode ? 'Exit Regional Crop Mode' : 'Enter Regional Guidance Box Mode',
        icon: <Crop className="w-3.5 h-3.5 text-cyan-400" />,
        action: () => {
          setIsCropMode(!isCropMode);
          setCropBox(null);
        }
      }
    ];

    if (displayImage) {
      items.push(
        {
          label: isComparing ? 'Exit A/B Comparison' : 'Enter A/B Split Comparison',
          icon: <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />,
          action: () => {
            if (!isComparing && !comparisonImage && history.length > 0) {
              setComparisonImage(history[0].imageUrl);
            }
            setIsComparing(!isComparing);
          }
        },
        {
          label: 'Send to ControlNet Unit 1',
          icon: <Layers className="w-3.5 h-3.5 text-emerald-400" />,
          action: () => {
            useAppStore.getState().updateControlNet('1', { enabled: true, image: displayImage });
          }
        },
        {
          label: 'Open Full Image in New Tab',
          icon: <ExternalLink className="w-3.5 h-3.5" />,
          action: () => window.open(displayImage, '_blank')
        },
        {
          label: 'Download Rendered PNG',
          icon: <Download className="w-3.5 h-3.5" />,
          action: () => {
            const a = document.createElement('a');
            a.href = displayImage;
            a.download = `Swarm_${Date.now()}.png`;
            a.click();
          }
        },
        {
          separator: true,
          label: 'Clear Canvas Output',
          icon: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,
          danger: true,
          action: () => setParams({ activeImage: null, livePreview: null })
        }
      );
    }

    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: 'Viewport Actions', items });
  };

  const totalInQueue = queue.length + (isGenerating || activeJob ? 1 : 0);

  return (
    <div
      ref={canvasContainerRef}
      className="h-full w-full relative flex flex-col items-center justify-center bg-[#090a0d] overflow-hidden select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={handleViewportContextMenu}
    >
      {displayImage ? (
        <div
          className="absolute transition-transform duration-75 cursor-grab active:cursor-grabbing flex items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center'
          }}
        >
          <div className="relative max-h-[85vh] max-w-[85vw]">
            <img
              src={displayImage}
              alt="Viewport Output (A)"
              draggable={false}
              className={`max-h-[85vh] max-w-[85vw] object-contain shadow-2xl pointer-events-none rounded ${
                livePreview && isGenerating ? 'filter blur-[0.5px]' : ''
              }`}
            />

            {isComparing && comparisonImage && (
              <>
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-none rounded"
                  style={{ clipPath: `inset(0 0 0 ${compareSplit}%)` }}
                >
                  <img
                    src={comparisonImage}
                    alt="Comparison View (B)"
                    draggable={false}
                    className="w-full h-full object-contain"
                  />
                </div>

                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsDraggingSlider(true);
                  }}
                  style={{ left: `${compareSplit}%` }}
                  className="absolute top-0 bottom-0 w-1 bg-indigo-500 cursor-ew-resize z-30 shadow-[0_0_12px_rgba(99,102,241,0.8)]"
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-indigo-600 border-2 border-white shadow-xl flex items-center justify-center text-[9px] font-mono text-white font-bold cursor-ew-resize">
                    ↔
                  </div>
                </div>

                <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-cyan-300 border border-cyan-500/30 z-20 pointer-events-none">
                  A (Current)
                </div>
                <div className="absolute top-2 right-2 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-purple-300 border border-purple-500/30 z-20 pointer-events-none">
                  B (Compare)
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <span className="text-neutral-600 text-xs">No image rendered yet</span>
      )}

      {/* In-Canvas Regional Guidance Box */}
      {isCropMode && cropBox && cropBox.width > 5 && cropBox.height > 5 && (
        <div
          style={{
            left: `${cropBox.x}px`,
            top: `${cropBox.y}px`,
            width: `${cropBox.width}px`,
            height: `${cropBox.height}px`,
          }}
          className="absolute border-2 border-cyan-400 bg-cyan-500/15 pointer-events-none z-30 shadow-[0_0_12px_rgba(6,182,212,0.4)]"
        >
          <div className="absolute -top-6 left-0 bg-cyan-900/90 border border-cyan-400/50 text-cyan-200 px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap">
            Region: {Math.round(cropBox.width)} × {Math.round(cropBox.height)}
          </div>
        </div>
      )}

      {/* Top-Right Toolbar */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-[#14161f]/90 border border-[#2b2f3a] rounded-lg p-1 backdrop-blur-sm shadow-xl z-20">
        <button
          onClick={() => setIsQueueOpen((prev) => !prev)}
          className={`p-1 px-1.5 rounded cursor-pointer transition flex items-center gap-1 text-[11px] ${
            isQueueOpen
              ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
              : 'hover:bg-[#252a36] text-gray-300'
          }`}
          title="Toggle Viewport Queue Manager"
        >
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-mono text-[10px] font-semibold">{totalInQueue}</span>
        </button>

        <button
          onClick={() => updateSettings({ hideProgressBar: !settings.hideProgressBar })}
          className={`p-1 rounded cursor-pointer transition ${
            !settings.hideProgressBar ? 'text-indigo-400 hover:bg-[#252a36]' : 'text-gray-500 hover:bg-[#252a36]'
          }`}
          title={settings.hideProgressBar ? 'Show Progress Bar' : 'Hide Progress Bar'}
        >
          {settings.hideProgressBar ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={() => {
            setIsCropMode(!isCropMode);
            setCropBox(null);
          }}
          className={`p-1 rounded cursor-pointer transition ${
            isCropMode ? 'bg-cyan-600 text-white' : 'hover:bg-[#252a36] text-gray-300'
          }`}
          title="Toggle In-Canvas Regional Crop & Guidance Box"
        >
          <Crop className="w-3.5 h-3.5" />
        </button>

        <div className="h-3 w-px bg-[#2b2f3a] mx-0.5" />

        <button
          onClick={() => {
            if (!isComparing && !comparisonImage && history.length > 0) {
              setComparisonImage(history[0].imageUrl);
            }
            setIsComparing(!isComparing);
          }}
          className={`p-1 rounded cursor-pointer transition ${
            isComparing ? 'bg-indigo-600 text-white' : 'hover:bg-[#252a36] text-gray-300'
          }`}
          title="Toggle A/B Split-Slider Comparison"
        >
          <SplitSquareVertical className="w-3.5 h-3.5" />
        </button>

        <div className="h-3 w-px bg-[#2b2f3a] mx-0.5" />

        <button onClick={() => setZoom((z) => Math.min(10, z + 0.25))} className="p-1 hover:bg-[#252a36] text-gray-300 rounded cursor-pointer" title="Zoom In">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-mono text-gray-400 px-1">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.max(0.1, z - 0.25))} className="p-1 hover:bg-[#252a36] text-gray-300 rounded cursor-pointer" title="Zoom Out">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button onClick={resetTransform} className="p-1 hover:bg-[#252a36] text-gray-300 rounded cursor-pointer" title="Reset View">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Execution Buttons Moved to Bottom Right with Space */}
      <div className="absolute bottom-5 right-5 flex items-center gap-1.5 p-1.5 bg-[#13151f]/90 border border-[#2d3246] rounded-xl shadow-2xl backdrop-blur-md z-30 select-none">
        {isGenerating ? (
          <button
            type="button"
            onClick={cancelGeneration}
            className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 font-semibold rounded-lg text-white text-xs cursor-pointer shadow-lg shadow-rose-900/40 transition flex items-center gap-1.5"
          >
            <span>Cancel</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={enqueueAndProcess}
            className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 font-semibold rounded-lg text-white text-xs cursor-pointer shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Generate</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => useAppStore.getState().enqueueAndProcess()}
          className="px-3 py-1.5 bg-[#1e2230] hover:bg-[#282d3e] border border-[#343a4e] font-mono text-[11px] text-amber-300 hover:text-amber-200 rounded-lg cursor-pointer transition flex items-center gap-1"
          title="Add current prompt to queue"
        >
          <Plus className="w-3 h-3" />
          <span>Queue</span>
        </button>
      </div>

      {/* Floating Viewport Queue Manager Modal */}
      {isQueueOpen && (
        <div className="absolute top-12 right-3 w-72 max-h-80 bg-[#12141c]/95 border border-[#2b2f3a] rounded-xl shadow-2xl backdrop-blur-md flex flex-col z-30 overflow-hidden text-xs">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#252a35] bg-[#161822]">
            <div className="flex items-center gap-1.5 font-semibold text-gray-200">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Viewport Queue</span>
              <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[10px] font-mono rounded-full">
                {totalInQueue}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {queue.length > 0 && store.clearQueue && (
                <button
                  onClick={() => store.clearQueue()}
                  className="p-1 text-gray-400 hover:text-rose-400 rounded cursor-pointer"
                  title="Clear Queue"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => setIsQueueOpen(false)}
                className="p-1 text-gray-400 hover:text-white rounded cursor-pointer"
                title="Close"
              >
                <Minimize2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 divide-y divide-[#202432] space-y-2">
            {isGenerating || activeJob ? (
              <div className="pb-1.5">
                <div className="flex items-center justify-between text-[10px] font-semibold text-indigo-300 mb-1">
                  <span className="flex items-center gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    RUNNING {currentStep ? `(${currentStep}/${maxSteps})` : ''}
                  </span>
                  <button
                    onClick={() => cancelGeneration && cancelGeneration()}
                    className="px-1.5 py-0.5 rounded bg-rose-600/30 hover:bg-rose-600 text-rose-200 text-[9px] font-mono cursor-pointer transition"
                  >
                    Interrupt
                  </button>
                </div>
                <p className="text-[11px] text-gray-300 truncate font-mono">
                  {activeJob?.prompt || store.prompt || 'Current Task'}
                </p>
              </div>
            ) : null}

            {queue.length === 0 && !isGenerating && !activeJob ? (
              <div className="py-6 text-center text-gray-500 text-[11px] flex flex-col items-center justify-center gap-1">
                <Sparkle className="w-4 h-4 text-gray-600" />
                <span>No jobs in queue</span>
              </div>
            ) : (
              queue.map((item: any, idx: number) => (
                <div key={item.id || idx} className="pt-1.5 flex items-center justify-between gap-1 text-[11px]">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-amber-400 text-[10px] mr-1">#{idx + 1}</span>
                    <span className="text-gray-300 truncate font-mono inline-block max-w-[170px] align-bottom">
                      {item.prompt || 'Queued generation'}
                    </span>
                  </div>
                  {store.cancelQueuedJob && (
                    <button
                      onClick={() => store.cancelQueuedJob(item.id)}
                      className="p-1 text-gray-500 hover:text-rose-400 cursor-pointer"
                      title="Remove from queue"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Live Analytics Progress Bar */}
      {(isGenerating || metrics.totalTime > 0) && !settings.hideProgressBar && (
        <div className="absolute bottom-20 left-4 right-4 bg-[#121418]/95 border border-[#2b2f3a] p-3 rounded-lg shadow-2xl backdrop-blur-md z-20">
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
              <button
                onClick={() => updateSettings({ hideProgressBar: true })}
                className="p-1 hover:bg-[#202430] text-gray-400 hover:text-white rounded cursor-pointer transition ml-1"
                title="Hide Progress Bar"
              >
                <Minimize2 className="w-3 h-3" />
              </button>
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
   2. PROMPT & PROMPT-FLOW PIPELINE PANEL
   ========================================================================= */
const PromptPillsPanel: React.FC<IDockviewPanelProps> = () => {
  const {
    prompt, negativePrompt, setPrompt, setNegativePrompt, activeMacroCategory,
    activeSubCategory, pillSearchQuery, setActiveMacroCategory, setActiveSubCategory,
    setPillSearchQuery, settings, setActiveContextMenu
  } = useAppStore();

  const [activeTarget, setActiveTarget] = useState<'positive' | 'negative'>('positive');
  const [currentTags, setCurrentTags] = useState<string[]>([]);
  const [tagDisplayLimit, setTagDisplayLimit] = useState(300);
  const [hoverDetail, setHoverDetail] = useState<TagDetail | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [lockedStages, setLockedStages] = useState<Record<string, boolean>>({});

  // Prompt View Modes (Pills View vs Raw Textarea Mode)
  const [positiveViewMode, setPositiveViewMode] = useState<'pills' | 'text'>('pills');
  const [negativeViewMode, setNegativeViewMode] = useState<'pills' | 'text'>('pills');

  // Synchronized Resizable Split & Height
  const [promptBoxHeight, setPromptBoxHeight] = useState(140);
  const [positiveWidthPercent, setPositiveWidthPercent] = useState(65);
  const promptContainerRef = useRef<HTMLDivElement>(null);

  // Collapse / Full-Height Mode
  const [isTagBrowserCollapsed, setIsTagBrowserCollapsed] = useState(false);

  // Interactive Prompt Pill State (Editing, Reordering, Disabling)
  const [editingIndex, setEditingIndex] = useState<{ target: 'positive' | 'negative'; index: number } | null>(null);
  const [editingText, setEditingText] = useState('');
  const [draggedPill, setDraggedPill] = useState<{ target: 'positive' | 'negative'; index: number } | null>(null);
  const [newTagInput, setNewTagInput] = useState<{ positive: string; negative: string }>({ positive: '', negative: '' });

  const pillClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reliable Global Window Drag Handlers
  const handleVerticalResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = promptBoxHeight;

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      setPromptBoxHeight(Math.max(70, Math.min(window.innerHeight - 150, startHeight + deltaY)));
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleHorizontalSplitStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!promptContainerRef.current) return;
    const rect = promptContainerRef.current.getBoundingClientRect();

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const relativeX = moveEvent.clientX - rect.left;
      const pct = Math.max(15, Math.min(85, (relativeX / rect.width) * 100));
      setPositiveWidthPercent(pct);
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const [, setTagLoadTick] = useState(0);

  useEffect(() => {
    const unsub = danbooru.onLoaded ? danbooru.onLoaded(() => {
      setTagLoadTick((t) => t + 1);
      danbooru.getTags(activeMacroCategory, activeSubCategory, pillSearchQuery, tagDisplayLimit).then((tags: string[]) => {
        if (tags && tags.length > 0) setCurrentTags(tags);
      });
    }) : () => {};

    return () => unsub();
  }, [activeMacroCategory, activeSubCategory, pillSearchQuery, tagDisplayLimit]);

  const parentScrollRef = useRef<HTMLDivElement>(null);
  const subScrollRef = useRef<HTMLDivElement>(null);

  const parentCategories = useMemo(() => danbooru.getParentCategories(), [activeMacroCategory, tagDisplayLimit]);
  const subCategories = useMemo(() => danbooru.getSubCategories(activeMacroCategory), [activeMacroCategory]);

  useEffect(() => {
    setTagDisplayLimit(300);
  }, [activeMacroCategory, activeSubCategory, pillSearchQuery]);

  useEffect(() => {
    let active = true;
    danbooru.getTags(activeMacroCategory, activeSubCategory, pillSearchQuery, tagDisplayLimit).then((tags: string[]) => {
      if (active) setCurrentTags(tags || []);
    });
    return () => {
      active = false;
    };
  }, [activeMacroCategory, activeSubCategory, pillSearchQuery, tagDisplayLimit, settings.categorizationMode, settings.tagSortOrder]);

  const appendTag = (tag: string, target = activeTarget, weight = 1.0) => {
    const clean = settings.useUnderscores ? tag.toLowerCase().replace(/\s+/g, '_') : tag.replace(/_/g, ' ');
    const token = weight !== 1.0 ? `(${clean}:${weight.toFixed(2)})` : clean;

    if (target === 'positive') {
      const current = prompt.trim();
      setPrompt(current ? `${current}, ${token}` : token);
    } else {
      const current = negativePrompt.trim();
      setNegativePrompt(current ? `${current}, ${token}` : token);
    }
  };

  const insertOperator = (op: string) => {
    const targetVal = activeTarget === 'positive' ? prompt : negativePrompt;
    const setter = activeTarget === 'positive' ? setPrompt : setNegativePrompt;
    const trimmed = targetVal.trim();

    if (!trimmed) {
      setter(op.trim());
      return;
    }

    if (op === ',') {
      setter(trimmed.endsWith(',') ? trimmed : `${trimmed}, `);
    } else if (op === 'AND' || op === 'BREAK') {
      setter(`${trimmed} ${op} `);
    } else if (op === '()') {
      setter(`${trimmed}, ()`);
    } else if (op === 'LORA') {
      setter(`${trimmed}, <lora:filename:1.0>`);
    }
  };

  const cleanAndDeduplicatePrompt = (text: string): string => {
    if (!text.trim()) return '';

    const tokens = text
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const seen = new Set<string>();
    const cleanedTokens: string[] = [];

    tokens.forEach((token) => {
      const baseToken = token
        .replace(/^\(+|\)+$/g, '')
        .split(':')[0]
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '_');

      if (!seen.has(baseToken)) {
        seen.add(baseToken);
        cleanedTokens.push(token);
      }
    });

    return cleanedTokens.join(', ');
  };

  const removeTokenFromPrompt = (tokenToRemove: string) => {
    const tokens = prompt.split(',').map((t: string) => t.trim()).filter(Boolean);
    const filtered = tokens.filter((t: string) => !t.toLowerCase().includes(tokenToRemove.toLowerCase().replace(/_/g, ' ')));
    setPrompt(filtered.join(', '));
  };

  const detectedConflicts = useMemo(() => {
    const lowerPrompt = prompt.toLowerCase();
    const found: { message: string; tagA: string; tagB: string }[] = [];

    CONFLICT_LINTER_RULES.forEach((rule) => {
      const matchedA = rule.setA.find((a) => lowerPrompt.includes(a.replace(/_/g, ' ')));
      const matchedB = rule.setB.find((b) => lowerPrompt.includes(b.replace(/_/g, ' ')));

      if (matchedA && matchedB) {
        found.push({ message: rule.message, tagA: matchedA, tagB: matchedB });
      }
    });

    return found;
  }, [prompt]);

  const suggestedNextTags = useMemo(() => {
    const lowerPrompt = prompt.toLowerCase();
    const suggestions = new Set<string>();

    CO_OCCURRENCE_RULES.forEach((rule) => {
      if (rule.triggers.some((tr) => lowerPrompt.includes(tr))) {
        rule.suggestions.forEach((sg) => {
          if (!lowerPrompt.includes(sg.replace(/_/g, ' '))) {
            suggestions.add(sg);
          }
        });
      }
    });

    return Array.from(suggestions).slice(0, 8);
  }, [prompt]);

  const handleRollStageRandomTags = async (stage: string) => {
    if (lockedStages[stage]) return;
    const picked = await danbooru.getRandomTags(stage, 2);
    if (picked && picked.length > 0) {
      picked.forEach((t: string) => appendTag(t, 'positive', 1.0));
    }
  };

  const handleApplyStageWeight = (stage: string, weightMult: number) => {
    const tokens = prompt.split(',').map((t: string) => t.trim()).filter(Boolean);
    const updated = tokens.map((token: string) => {
      const clean = token.replace(/[\(\):0-9.]/g, '').trim();
      return `(${clean}:${weightMult.toFixed(2)})`;
    });
    setPrompt(updated.join(', '));
  };

  const toggleLockStage = (stage: string) => {
    setLockedStages((prev) => ({ ...prev, [stage]: !prev[stage] }));
  };

  /* =========================================================================
     IN-PROMPTBOX PILL CLICK (EDIT) & DOUBLE-CLICK (DISABLE/ENABLE) LOGIC
     ========================================================================= */
  const getPromptTokens = (target: 'positive' | 'negative') => {
    const text = target === 'positive' ? prompt : negativePrompt;
    return text.split(',').map((t) => t.trim()).filter(Boolean);
  };

  const setPromptTokens = (target: 'positive' | 'negative', tokens: string[]) => {
    const text = tokens.join(', ');
    if (target === 'positive') setPrompt(text);
    else setNegativePrompt(text);
  };

  const handlePromptboxPillClick = (target: 'positive' | 'negative', index: number, currentText: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (pillClickTimeoutRef.current) {
      // Double Click: Toggle disable / comment out with /* ... */
      clearTimeout(pillClickTimeoutRef.current);
      pillClickTimeoutRef.current = null;

      const tokens = getPromptTokens(target);
      const token = tokens[index];
      const isMuted = token.startsWith('/*') && token.endsWith('*/');

      if (isMuted) {
        tokens[index] = token.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').trim();
      } else {
        tokens[index] = `/* ${token} */`;
      }
      setPromptTokens(target, tokens);
    } else {
      // Single Click: Inline text edit
      pillClickTimeoutRef.current = setTimeout(() => {
        pillClickTimeoutRef.current = null;
        setEditingIndex({ target, index });
        setEditingText(currentText);
      }, 230);
    }
  };

  const submitPromptboxEdit = (target: 'positive' | 'negative', index: number) => {
    const tokens = getPromptTokens(target);
    if (editingText.trim()) {
      tokens[index] = editingText.trim();
    } else {
      tokens.splice(index, 1);
    }
    setPromptTokens(target, tokens);
    setEditingIndex(null);
  };

  const handlePromptboxPillContextMenu = (target: 'positive' | 'negative', index: number, tokenText: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const isMuted = tokenText.startsWith('/*') && tokenText.endsWith('*/');
    const clean = tokenText.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').trim();
    const tokens = getPromptTokens(target);

    const items: ContextMenuItem[] = [
      {
        label: isMuted ? `Enable '${clean}'` : `Disable / Comment out '${clean}'`,
        action: () => {
          tokens[index] = isMuted ? clean : `/* ${clean} */`;
          setPromptTokens(target, tokens);
        }
      },
      {
        label: `Increase Weight (+0.10)`,
        action: () => {
          const match = clean.match(/^\((.*):([0-9.]+)\)$/);
          if (match) {
            const nextW = (parseFloat(match[2]) + 0.1).toFixed(2);
            tokens[index] = `(${match[1]}:${nextW})`;
          } else {
            tokens[index] = `(${clean}:1.10)`;
          }
          setPromptTokens(target, tokens);
        }
      },
      {
        label: `Decrease Weight (-0.10)`,
        action: () => {
          const match = clean.match(/^\((.*):([0-9.]+)\)$/);
          if (match) {
            const nextW = Math.max(0.1, parseFloat(match[2]) - 0.1).toFixed(2);
            tokens[index] = `(${match[1]}:${nextW})`;
          } else {
            tokens[index] = `(${clean}:0.90)`;
          }
          setPromptTokens(target, tokens);
        }
      },
      {
        label: target === 'positive' ? 'Move to Negative' : 'Move to Positive',
        action: () => {
          tokens.splice(index, 1);
          setPromptTokens(target, tokens);
          if (target === 'positive') {
            setNegativePrompt(negativePrompt.trim() ? `${negativePrompt.trim()}, ${clean}` : clean);
          } else {
            setPrompt(prompt.trim() ? `${prompt.trim()}, ${clean}` : clean);
          }
        }
      },
      {
        separator: true,
        label: `Delete Token`,
        danger: true,
        icon: <Trash2 className="w-3.5 h-3.5" />,
        action: () => {
          tokens.splice(index, 1);
          setPromptTokens(target, tokens);
        }
      }
    ];

    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: `Token: ${clean}`, items });
  };

  /* =========================================================================
     TAG SECTION (LOWER BROWSER): CLEAN CLICKS & NON-BLOCKING POPOVER
     ========================================================================= */
  const handleBrowserPillClick = (tag: string, e: React.MouseEvent) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoverDetail(null);

    if (e.shiftKey) {
      appendTag(tag, activeTarget, 1.0 + settings.tagClickWeightStep);
    } else {
      appendTag(tag, activeTarget, 1.0);
    }
  };

  const handleTagMouseEnter = (e: React.MouseEvent, tag: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

    hoverTimeoutRef.current = setTimeout(async () => {
      setTooltipPos({ x: rect.left, y: rect.bottom + 8 });
      const detail = await danbooru.getTagDetail(tag, activeMacroCategory, activeSubCategory);
      setHoverDetail(detail);
    }, 320);
  };

  const handleTagMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoverDetail(null);
  };

  const handleTagRightClick = (e: React.MouseEvent, tag: string) => {
    e.preventDefault();
    e.stopPropagation();

    const clean = settings.useUnderscores ? tag.replace(/\s+/g, '_') : tag.replace(/_/g, ' ');

    const items: ContextMenuItem[] = [
      {
        label: `Append to Positive (+1.0)`,
        icon: <Plus className="w-3.5 h-3.5 text-indigo-400" />,
        action: () => appendTag(tag, 'positive', 1.0)
      },
      {
        label: `Append with High Emphasis (+${(1.0 + settings.tagClickWeightStep).toFixed(2)}x)`,
        icon: <Sparkles className="w-3.5 h-3.5 text-cyan-400" />,
        action: () => appendTag(tag, 'positive', 1.0 + settings.tagClickWeightStep)
      },
      {
        label: `Send to Negative Prompt`,
        icon: <ChevronRight className="w-3.5 h-3.5 text-rose-400" />,
        action: () => appendTag(tag, 'negative', 1.0)
      },
      {
        label: `Copy Raw Tag Name`,
        icon: <Copy className="w-3.5 h-3.5" />,
        action: () => navigator.clipboard.writeText(clean)
      }
    ];

    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: `Tag: ${clean}`, items });
  };

  const handleWheelHorizontal = (ref: React.RefObject<HTMLDivElement | null>, e: React.WheelEvent) => {
    if (ref.current) ref.current.scrollLeft += e.deltaY;
  };

  const formatCount = (n: number | null) => {
    if (!n) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return n.toString();
  };

  const totalCategoryCount = danbooru.getSubCount(activeMacroCategory, activeSubCategory);

  // Render Promptbox Body (Interactive Pills vs Raw Textarea)
  const renderPromptBoxBody = (target: 'positive' | 'negative') => {
    const isPositive = target === 'positive';
    const viewMode = isPositive ? positiveViewMode : negativeViewMode;
    const textVal = isPositive ? prompt : negativePrompt;
    const tokens = getPromptTokens(target);

    if (viewMode === 'text') {
      return (
        <PromptAutosuggestTextarea
          value={textVal}
          onChange={isPositive ? setPrompt : setNegativePrompt}
          placeholder={isPositive ? "Type positive tags here..." : "low quality, blurry..."}
          target={target}
        />
      );
    }

    return (
      <div className="flex-1 flex flex-wrap content-start gap-1 p-1 overflow-y-auto bg-[#10121a] rounded border border-[#1e2230] select-none min-h-[60px]">
        {tokens.map((token, idx) => {
          const isMuted = token.startsWith('/*') && token.endsWith('*/');
          const isCurrentlyEditing = editingIndex?.target === target && editingIndex?.index === idx;

          return (
            <div
              key={`${token}-${idx}`}
              draggable={!isCurrentlyEditing}
              onDragStart={() => setDraggedPill({ target, index: idx })}
              onDragOver={(e) => {
                e.preventDefault();
                if (!draggedPill || draggedPill.target !== target || draggedPill.index === idx) return;
                const updated = [...tokens];
                const [moved] = updated.splice(draggedPill.index, 1);
                updated.splice(idx, 0, moved);
                setPromptTokens(target, updated);
                setDraggedPill({ target, index: idx });
              }}
              onDragEnd={() => setDraggedPill(null)}
              onClick={(e) => handlePromptboxPillClick(target, idx, token, e)}
              onContextMenu={(e) => handlePromptboxPillContextMenu(target, idx, token, e)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition shrink-0 flex items-center gap-1 border ${
                isMuted
                  ? 'opacity-35 line-through bg-black border-neutral-800 text-neutral-500'
                  : isPositive
                  ? 'bg-[#181d2c] border-[#29344f] text-indigo-300 hover:border-indigo-400 hover:text-white'
                  : 'bg-[#26151c] border-[#42202c] text-rose-300 hover:border-rose-400 hover:text-white'
              }`}
              title="Left click: Edit tag • Double click: Disable/Enable tag • Drag: Reorder"
            >
              {isCurrentlyEditing ? (
                <input
                  type="text"
                  autoFocus
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitPromptboxEdit(target, idx);
                    if (e.key === 'Escape') setEditingIndex(null);
                  }}
                  onBlur={() => submitPromptboxEdit(target, idx)}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-black text-white px-1.5 py-0.2 rounded outline-none border border-indigo-400 text-[10px] min-w-[50px]"
                />
              ) : (
                <span>{token}</span>
              )}
            </div>
          );
        })}

        {/* Quick inline adder input at the end of pills */}
        <input
          type="text"
          placeholder="+ Add tag..."
          value={newTagInput[target]}
          onChange={(e) => setNewTagInput({ ...newTagInput, [target]: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              const tagToAdd = newTagInput[target].replace(/,/g, '').trim();
              if (tagToAdd) {
                appendTag(tagToAdd, target, 1.0);
                setNewTagInput({ ...newTagInput, [target]: '' });
              }
            }
          }}
          className="bg-transparent text-gray-300 text-[11px] font-mono px-1.5 py-0.5 rounded outline-none placeholder:text-gray-600 min-w-[75px] shrink-0"
        />
      </div>
    );
  };

  return (
    <div
      className="h-full flex flex-col bg-[#0d0e12] select-none text-xs overflow-hidden"
      style={{ zoom: `${settings.sectionScales.pills}%` }}
    >
      {/* Top Prompt Section */}
      <div className={`p-2 bg-[#12141a] flex flex-col shrink-0 gap-1.5 ${isTagBrowserCollapsed ? 'flex-1' : 'border-b border-[#232631]'}`}>
        <div
          ref={promptContainerRef}
          style={{ height: isTagBrowserCollapsed ? '100%' : `${promptBoxHeight}px` }}
          className="flex w-full overflow-hidden select-none gap-1 flex-1 min-h-[90px]"
        >
          {/* Positive Prompt Box */}
          <div
            style={{ width: `${positiveWidthPercent}%` }}
            className={`h-full flex flex-col bg-[#161822] border rounded-md p-1.5 overflow-hidden transition-colors ${
              activeTarget === 'positive' ? 'border-indigo-500/80 shadow-[0_0_8px_rgba(99,102,241,0.2)]' : 'border-[#25293d]'
            }`}
            onClick={() => setActiveTarget('positive')}
          >
            <div className="flex justify-between items-center mb-1 shrink-0">
              <span className={`font-mono text-[11px] font-semibold flex items-center gap-1.5 ${activeTarget === 'positive' ? 'text-indigo-400' : 'text-gray-400'}`}>
                Positive Prompt
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPrompt(cleanAndDeduplicatePrompt(prompt));
                  }}
                  className="px-1.5 py-0.2 bg-[#202434] hover:bg-indigo-600 text-indigo-300 hover:text-white rounded text-[9px] font-mono border border-[#31374d] cursor-pointer transition flex items-center gap-1"
                  title="Deduplicate tags"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Clean</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPositiveViewMode(positiveViewMode === 'pills' ? 'text' : 'pills');
                  }}
                  className="px-1.5 py-0.2 bg-[#202434] hover:bg-[#2e344d] text-gray-400 hover:text-gray-200 rounded text-[9px] font-mono border border-[#31374d] cursor-pointer transition flex items-center gap-1"
                  title="Toggle between interactive pills and raw textarea"
                >
                  <Type className="w-2.5 h-2.5" />
                  <span>{positiveViewMode === 'pills' ? 'Raw Text' : 'Pills'}</span>
                </button>
              </span>
              <span className="text-[10px] text-gray-500 font-mono">{prompt.length} chars</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
              {renderPromptBoxBody('positive')}
            </div>
          </div>

          {/* Horizontal Split Divider */}
          <div
            onMouseDown={handleHorizontalSplitStart}
            className="w-1.5 bg-[#181b26] hover:bg-indigo-500 active:bg-indigo-400 cursor-col-resize rounded-full transition-colors shrink-0"
            title="Drag horizontally to adjust Positive/Negative split"
          />

          {/* Negative Prompt Box */}
          <div
            style={{ width: `${100 - positiveWidthPercent}%` }}
            className={`h-full flex flex-col bg-[#161822] border rounded-md p-1.5 overflow-hidden transition-colors ${
              activeTarget === 'negative' ? 'border-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.2)]' : 'border-[#25293d]'
            }`}
            onClick={() => setActiveTarget('negative')}
          >
            <div className="flex justify-between items-center mb-1 shrink-0">
              <span className={`font-mono text-[11px] font-semibold flex items-center gap-1.5 ${activeTarget === 'negative' ? 'text-rose-400' : 'text-gray-400'}`}>
                Negative Prompt
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNegativePrompt(cleanAndDeduplicatePrompt(negativePrompt));
                  }}
                  className="px-1.5 py-0.2 bg-[#202434] hover:bg-rose-900/60 text-rose-300 hover:text-white rounded text-[9px] font-mono border border-[#31374d] cursor-pointer transition flex items-center gap-1"
                  title="Deduplicate tags"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Clean</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNegativeViewMode(negativeViewMode === 'pills' ? 'text' : 'pills');
                  }}
                  className="px-1.5 py-0.2 bg-[#202434] hover:bg-[#2e344d] text-gray-400 hover:text-gray-200 rounded text-[9px] font-mono border border-[#31374d] cursor-pointer transition flex items-center gap-1"
                  title="Toggle between interactive pills and raw textarea"
                >
                  <Type className="w-2.5 h-2.5" />
                  <span>{negativeViewMode === 'pills' ? 'Raw Text' : 'Pills'}</span>
                </button>
              </span>
              <span className="text-[10px] text-gray-500 font-mono">{negativePrompt.length} chars</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
              {renderPromptBoxBody('negative')}
            </div>
          </div>
        </div>

        {/* Quick Operators & Expand/Collapse Toggle */}
        <div className="flex items-center justify-between pt-0.5 shrink-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] font-mono text-gray-500 mr-1">Insert:</span>
            <button
              type="button"
              onClick={() => insertOperator(',')}
              className="px-2 py-0.5 bg-[#1a1d27] hover:bg-indigo-600 hover:text-white border border-[#2d3244] text-gray-300 rounded font-mono text-[10px] transition cursor-pointer"
            >
              , Comma
            </button>
            <button
              type="button"
              onClick={() => insertOperator('AND')}
              className="px-2 py-0.5 bg-[#1a1d27] hover:bg-indigo-600 hover:text-white border border-[#2d3244] text-cyan-300 rounded font-mono text-[10px] transition cursor-pointer"
            >
              AND
            </button>
            <button
              type="button"
              onClick={() => insertOperator('BREAK')}
              className="px-2 py-0.5 bg-[#1a1d27] hover:bg-indigo-600 hover:text-white border border-[#2d3244] text-amber-300 rounded font-mono text-[10px] transition cursor-pointer"
            >
              BREAK
            </button>
            <button
              type="button"
              onClick={() => insertOperator('()')}
              className="px-2 py-0.5 bg-[#1a1d27] hover:bg-indigo-600 hover:text-white border border-[#2d3244] text-gray-300 rounded font-mono text-[10px] transition cursor-pointer"
            >
              ( )
            </button>
            <button
              type="button"
              onClick={() => insertOperator('LORA')}
              className="px-2 py-0.5 bg-[#1a1d27] hover:bg-indigo-600 hover:text-white border border-[#2d3244] text-purple-300 rounded font-mono text-[10px] transition cursor-pointer"
            >
              + &lt;lora:&gt;
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsTagBrowserCollapsed(!isTagBrowserCollapsed)}
            className="px-2.5 py-0.5 bg-[#181a24] hover:bg-[#25293a] border border-[#2e3346] text-indigo-300 rounded font-mono text-[10px] transition cursor-pointer shrink-0 ml-2"
            title={isTagBrowserCollapsed ? 'Show Tag Browser & Stepper' : 'Expand Prompt Boxes to Cover Full Bottom Area'}
          >
            <span>{isTagBrowserCollapsed ? '▲ Show Tags' : '▼ Cover with Prompts'}</span>
          </button>
        </div>

        {/* Vertical Resize Separator with Prominent Grab Line */}
        {!isTagBrowserCollapsed && (
          <div
            onMouseDown={handleVerticalResizeStart}
            className="h-2.5 w-full flex items-center justify-center cursor-row-resize hover:bg-indigo-600/30 rounded-full transition-colors mt-0.5 shrink-0"
            title="Drag up/down to adjust prompt box vs tag browser height"
          >
            <div className="w-8 h-1 bg-[#3a4155] rounded-full" />
          </div>
        )}
      </div>

      {/* Real-time Conflict Linter Banner */}
      {detectedConflicts.length > 0 && (
        <div className="mx-2 mt-2 px-2.5 py-1 bg-amber-950/40 border border-amber-600/50 rounded flex items-center justify-between text-[11px] text-amber-300 shrink-0">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{detectedConflicts[0].message}:</span>
            <span className="font-mono underline font-semibold">"{detectedConflicts[0].tagA}"</span>
            <span>vs</span>
            <span className="font-mono underline font-semibold">"{detectedConflicts[0].tagB}"</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => removeTokenFromPrompt(detectedConflicts[0].tagA)}
              className="px-1.5 py-0.2 bg-amber-900/60 hover:bg-amber-800 rounded font-mono text-[10px] text-white cursor-pointer"
            >
              Remove {detectedConflicts[0].tagA}
            </button>
            <button
              onClick={() => removeTokenFromPrompt(detectedConflicts[0].tagB)}
              className="px-1.5 py-0.2 bg-amber-900/60 hover:bg-amber-800 rounded font-mono text-[10px] text-white cursor-pointer"
            >
              Remove {detectedConflicts[0].tagB}
            </button>
          </div>
        </div>
      )}

      {/* Suggested Next Tags */}
      {suggestedNextTags.length > 0 && (
        <div className="mx-2 mt-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 shrink-0">
          <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-0.5 shrink-0 font-semibold">
            <Zap className="w-3 h-3 text-cyan-400" /> Suggested Next:
          </span>
          {suggestedNextTags.map((sug) => (
            <button
              key={sug}
              onClick={() => appendTag(sug, 'positive', 1.0)}
              className="px-2 py-0.5 rounded-full bg-cyan-950/50 border border-cyan-500/30 text-cyan-300 text-[10px] hover:bg-cyan-900 hover:text-white cursor-pointer transition shrink-0"
            >
              + {sug.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      {/* Lower Tag Browser (Clean One-Click Insert, Passive Non-Blocking Popover) */}
      {!isTagBrowserCollapsed && (
        <div className="flex-1 flex flex-col min-h-0 bg-[#0c0d12] mt-2">
          {/* Tier 1: Macro Categories */}
          <div className="flex items-center bg-[#111318] border-b border-[#20232c] px-1">
            <button
              onClick={() => parentScrollRef.current && (parentScrollRef.current.scrollLeft -= 220)}
              className="p-1 text-gray-400 hover:text-white cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div
              ref={parentScrollRef}
              onWheel={(e) => handleWheelHorizontal(parentScrollRef, e)}
              className="flex-1 flex gap-1.5 overflow-x-auto p-1.5 scrollbar-none scroll-smooth"
            >
              {parentCategories.map((parent: string) => {
                const count = danbooru.getParentCount(parent);
                const isActive = activeMacroCategory === parent;
                const style = STAGE_COLOR_STYLES[parent] || { border: 'border-indigo-500/30', bg: 'bg-indigo-600', text: 'text-indigo-300' };

                return (
                  <button
                    key={parent}
                    onClick={() => {
                      setActiveMacroCategory(parent);
                      setActiveSubCategory('All');
                    }}
                    className={`px-3 py-1 rounded-md text-xs whitespace-nowrap cursor-pointer transition shrink-0 flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-indigo-600 text-white font-semibold shadow-md'
                        : 'bg-[#181a20] border border-[#252833] text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white' : style.text.replace('text-', 'bg-')}`} />
                    <span>{parent}</span>
                    <span className={`ml-0.5 text-[11px] ${isActive ? 'text-indigo-200' : 'text-gray-500'}`}>
                      ({count.toLocaleString()})
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => parentScrollRef.current && (parentScrollRef.current.scrollLeft -= 220)}
              className="p-1 text-gray-400 hover:text-white cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Tier 2: Subcategories */}
          <div className="flex items-center gap-2 p-1.5 border-b border-[#20232c] bg-[#13151b]">
            <div className="relative w-44 shrink-0">
              <Search className="w-3 h-3 absolute left-2 top-2 text-gray-400" />
              <input
                type="text"
                value={pillSearchQuery}
                onChange={(e) => setPillSearchQuery(e.target.value)}
                placeholder="Filter category tags.."
                className="w-full bg-[#181a22] border border-[#262a36] rounded pl-6 pr-2 py-0.5 text-xs text-gray-200 outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1 shrink-0 border-r border-[#262a36] pr-2">
              <button
                onClick={() => handleRollStageRandomTags(activeMacroCategory)}
                disabled={lockedStages[activeMacroCategory]}
                className={`p-1 rounded cursor-pointer transition flex items-center gap-1 text-[10px] ${
                  lockedStages[activeMacroCategory]
                    ? 'opacity-40 cursor-not-allowed bg-neutral-800 text-neutral-500'
                    : 'bg-[#1c1f2b] hover:bg-indigo-600 text-indigo-300 hover:text-white border border-[#2e3346]'
                }`}
                title="Roll random tag from this stage"
              >
                <Dices className="w-3 h-3" />
                <span>Roll</span>
              </button>

              <button
                onClick={() => toggleLockStage(activeMacroCategory)}
                className={`p-1 rounded cursor-pointer transition border border-[#2e3346] ${
                  lockedStages[activeMacroCategory]
                    ? 'bg-amber-600 text-white'
                    : 'bg-[#1c1f2b] hover:bg-[#282d3e] text-gray-400'
                }`}
                title={lockedStages[activeMacroCategory] ? 'Stage is Locked' : 'Stage is Unlocked'}
              >
                {lockedStages[activeMacroCategory] ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              </button>

              <button
                onClick={() => handleApplyStageWeight(activeMacroCategory, 1.15)}
                className="px-1.5 py-0.5 bg-[#1c1f2b] hover:bg-indigo-600 hover:text-white text-gray-300 border border-[#2e3346] rounded text-[10px] font-mono cursor-pointer transition"
                title="Wrap stage tags with 1.15x weight"
              >
                1.15x
              </button>
            </div>

            <button
              onClick={() => subScrollRef.current && (subScrollRef.current.scrollLeft -= 220)}
              className="p-0.5 text-gray-400 hover:text-white cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div
              ref={subScrollRef}
              onWheel={(e) => handleWheelHorizontal(subScrollRef, e)}
              className="flex-1 flex gap-1 overflow-x-auto scrollbar-none scroll-smooth"
            >
              {subCategories.map((sub: string) => {
                const count = danbooru.getSubCount(activeMacroCategory, sub);
                const isActive = activeSubCategory === sub;
                return (
                  <button
                    key={sub}
                    onClick={() => setActiveSubCategory(sub)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition shrink-0 ${
                      isActive
                        ? 'bg-purple-600 text-white font-medium shadow-sm'
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

            <button
              onClick={() => subScrollRef.current && (subScrollRef.current.scrollLeft -= 220)}
              className="p-0.5 text-gray-400 hover:text-white cursor-pointer shrink-0"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tier 3: Tags Grid */}
          <div className="flex-1 p-2 overflow-y-auto content-start flex flex-wrap gap-1.5 bg-[#0a0b0e]">
            {currentTags.length === 0 ? (
              <span className="text-gray-600 m-auto text-xs">
                No tags found under {activeMacroCategory} → {activeSubCategory}.
              </span>
            ) : (
              <>
                {currentTags.map((tag: string) => {
                  const count = danbooru.getPostCount(tag);

                  return (
                    <div
                      key={tag}
                      onMouseEnter={(e) => handleTagMouseEnter(e, tag)}
                      onMouseLeave={handleTagMouseLeave}
                      onClick={(e) => handleBrowserPillClick(tag, e)}
                      onContextMenu={(e) => handleTagRightClick(e, tag)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded border bg-[#16181f] border-[#232733] text-gray-300 hover:border-indigo-500 hover:text-white transition text-xs select-none cursor-pointer"
                    >
                      {settings.showTagPlusPrefix && <span className="text-gray-500 text-[11px]">+</span>}
                      <span>{settings.useUnderscores ? tag.replace(/\s+/g, '_') : tag.replace(/_/g, ' ')}</span>
                      {settings.showTagPostCounts && count && (
                        <span className="text-[10px] font-mono text-gray-500 bg-[#0f1015] px-1 rounded">
                          {formatCount(count)}
                        </span>
                      )}
                    </div>
                  );
                })}

                {totalCategoryCount > currentTags.length && (
                  <div className="w-full py-2 flex justify-center">
                    <button
                      onClick={() => setTagDisplayLimit((prev) => prev + 300)}
                      className="px-4 py-1 bg-[#1a1d28] hover:bg-indigo-600 hover:text-white border border-[#2e3346] text-gray-300 rounded font-mono text-[11px] transition cursor-pointer"
                    >
                      + Load More Tags (Showing {currentTags.length} of {totalCategoryCount.toLocaleString()})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Popover Definition Card (pointer-events-none ensures it never catches or blocks clicks) */}
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
            <span><b>Click:</b> Add tag to active prompt</span>
            <span><b>Shift+Click:</b> Add with (+{(1.0 + settings.tagClickWeightStep).toFixed(2)}x) weight</span>
            <span><b>Right-Click:</b> More Options</span>
          </div>
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   3. EXTRA NETWORKS
   ========================================================================= */
const ExtraNetworksPanel: React.FC<IDockviewPanelProps> = () => {
  const {
    modelsList, lorasList, embeddingsList, wildcardsList, loadAssets,
    prompt, setPrompt, setModel, settings, syncCivitaiMetadata, setActiveContextMenu
  } = useAppStore();

  const [tab, setTab] = useState<'model' | 'lora' | 'embedding' | 'wildcard'>('model');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [search, setSearch] = useState('');
  const [weight, setWeight] = useState(settings.defaultLoraWeight || 1.0);

  const [showCivitaiModal, setShowCivitaiModal] = useState(false);
  const [selectedCivitaiCategory, setSelectedCivitaiCategory] = useState<'all' | 'models' | 'loras' | 'embeddings'>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; name: string } | null>(null);

  const getActiveList = (): ModelItem[] => {
    if (tab === 'model') return modelsList;
    if (tab === 'lora') return lorasList;
    if (tab === 'embedding') return embeddingsList;
    return wildcardsList.map((w) => ({ name: w, previewUrl: undefined }));
  };

  const filtered = getActiveList().filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));

  const handleItemClick = (item: ModelItem) => {
    if (tab === 'model') {
      setModel(item.name);
      return;
    }

    let token = '';
    if (tab === 'lora') {
      token = `<lora:${item.name}:${weight}>`;
      if (settings.autoInjectLoraTrigger && item.triggerWords && item.triggerWords.length > 0) {
        token = `${token}, ${item.triggerWords.join(', ')}`;
      }
    } else if (tab === 'embedding') {
      token = `embedding:${item.name}`;
    } else {
      token = `<wildcard:${item.name}>`;
    }

    setPrompt(prompt.trim() ? `${prompt.trim()}, ${token}` : token);
  };

  const handleCardContextMenu = (e: React.MouseEvent, item: ModelItem) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [];

    if (tab === 'model') {
      items.push({
        label: `Set as Active Model`,
        icon: <Check className="w-3.5 h-3.5 text-emerald-400" />,
        action: () => setModel(item.name)
      });
    } else {
      items.push({
        label: `Insert ${item.name}`,
        icon: <ArrowUpRight className="w-3.5 h-3.5" />,
        action: () => handleItemClick(item)
      });
    }

    if (item.triggerWords && item.triggerWords.length > 0) {
      items.push({
        label: `Copy Trigger Words`,
        icon: <Copy className="w-3.5 h-3.5" />,
        action: () => navigator.clipboard.writeText(item.triggerWords!.join(', '))
      });
    }

    items.push({
      label: `Copy File Name`,
      icon: <Copy className="w-3.5 h-3.5" />,
      action: () => navigator.clipboard.writeText(item.name)
    });

    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: `${tab.toUpperCase()}: ${item.name}`, items });
  };

  const handleStartCivitaiSync = async () => {
    setIsSyncing(true);
    setSyncProgress(null);
    await syncCivitaiMetadata(selectedCivitaiCategory, (current, total, name) => {
      setSyncProgress({ current, total, name });
    });
    setIsSyncing(false);
    setShowCivitaiModal(false);
  };

  return (
    <div
      className="h-full p-3 bg-[#121418] flex flex-col gap-2.5 text-xs select-none overflow-hidden"
      style={{ zoom: `${settings.sectionScales.extranetworks}%` }}
    >
      <div className="flex items-center justify-between border-b border-[#252a35] pb-1.5">
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setTab('model')}
            className={`px-2.5 py-0.5 rounded text-xs cursor-pointer ${tab === 'model' ? 'bg-indigo-600 text-white font-medium' : 'bg-[#181a20] text-gray-400'}`}
          >
            Models ({modelsList.length})
          </button>
          <button
            onClick={() => setTab('lora')}
            className={`px-2.5 py-0.5 rounded text-xs cursor-pointer ${tab === 'lora' ? 'bg-indigo-600 text-white font-medium' : 'bg-[#181a20] text-gray-400'}`}
          >
            LoRAs ({lorasList.length})
          </button>
          <button
            onClick={() => setTab('embedding')}
            className={`px-2.5 py-0.5 rounded text-xs cursor-pointer ${tab === 'embedding' ? 'bg-indigo-600 text-white font-medium' : 'bg-[#181a20] text-gray-400'}`}
          >
            Embeddings ({embeddingsList.length})
          </button>
          <button
            onClick={() => setTab('wildcard')}
            className={`px-2.5 py-0.5 rounded text-xs cursor-pointer ${tab === 'wildcard' ? 'bg-indigo-600 text-white font-medium' : 'bg-[#181a20] text-gray-400'}`}
          >
            Wildcards ({wildcardsList.length})
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowCivitaiModal(true)}
            className="px-2 py-0.5 bg-[#1f2330] hover:bg-indigo-600 hover:text-white border border-[#2d3245] text-indigo-300 rounded text-[11px] flex items-center gap-1 cursor-pointer transition shadow-sm"
            title="Search Civitai for missing previews and trigger words"
          >
            <Globe className="w-3 h-3" />
            <span>Civitai Meta</span>
          </button>

          <button
            onClick={() => setViewMode(viewMode === 'cards' ? 'list' : 'cards')}
            className="p-1 hover:bg-[#202430] text-gray-300 rounded cursor-pointer"
            title="Toggle Card / List View"
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
            placeholder={`Search ${tab}s...`}
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
            onClick={() => handleItemClick(item)}
            onContextMenu={(e) => handleCardContextMenu(e, item)}
            className={`border border-[#282c37] bg-[#16181f] rounded hover:border-indigo-500 cursor-pointer transition flex ${
              viewMode === 'cards' ? 'flex-col h-40 overflow-hidden' : 'items-center justify-between p-2'
            }`}
          >
            {viewMode === 'cards' ? (
              <>
                <div className="h-28 w-full overflow-hidden flex items-center justify-center relative">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <ModelPlaceholder name={item.name} type={tab === 'model' ? ('model' as any) : tab} />
                  )}
                  <span className="absolute bottom-1 right-1 text-[9px] bg-black/70 font-mono text-indigo-300 px-1 py-0.2 rounded border border-white/5">
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
                  <div className="w-7 h-7 rounded overflow-hidden shrink-0">
                    {item.previewUrl ? (
                      <img src={item.previewUrl} alt="thumb" className="w-full h-full object-cover" />
                    ) : (
                      <ModelPlaceholder name={item.name} type={tab === 'model' ? ('model' as any) : tab} />
                    )}
                  </div>
                  <span className="font-medium text-gray-300 text-xs truncate">{item.name}</span>
                </div>
                <span className="text-[10px] text-indigo-400 font-mono bg-indigo-950/50 px-1.5 py-0.5 rounded border border-indigo-500/30">
                  {tab === 'model' ? 'Select' : '+ Insert'}
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      {showCivitaiModal && (
        <div className="fixed inset-0 z-999999 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-96 bg-[#161822] border border-[#2d3246] rounded-xl shadow-2xl p-4 text-xs text-gray-200 flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-[#252a38] pb-2 font-semibold text-sm text-indigo-400">
              <span className="flex items-center gap-2"><Globe className="w-4 h-4" /> Civitai Metadata Search</span>
              {!isSyncing && (
                <button onClick={() => setShowCivitaiModal(false)} className="text-gray-500 hover:text-white">✕</button>
              )}
            </div>

            <p className="text-gray-400 text-[11px] leading-relaxed">
              Scan Civitai by clean model name to download preview images, trained trigger words, and descriptions for models missing covers.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-gray-400">Select Category to Search:</label>
              <select
                disabled={isSyncing}
                value={selectedCivitaiCategory}
                onChange={(e) => setSelectedCivitaiCategory(e.target.value as any)}
                className="w-full bg-[#12141c] border border-[#292e3f] rounded p-1.5 text-gray-200 outline-none"
              >
                <option value="all">All Categories (Models, LoRAs, Embeddings)</option>
                <option value="models">Checkpoints Only ({modelsList.length} items)</option>
                <option value="loras">LoRAs Only ({lorasList.length} items)</option>
                <option value="embeddings">Embeddings Only ({embeddingsList.length} items)</option>
              </select>
            </div>

            {isSyncing && syncProgress && (
              <div className="p-2.5 bg-[#12141c] border border-indigo-500/30 rounded flex flex-col gap-1.5">
                <div className="flex justify-between font-mono text-[10px] text-gray-400">
                  <span className="truncate pr-2">Scanning: {syncProgress.name}</span>
                  <span>{syncProgress.current}/{syncProgress.total}</span>
                </div>
                <div className="w-full bg-[#1e2230] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full transition-all duration-150"
                    style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#252a38]">
              <button
                disabled={isSyncing}
                onClick={() => setShowCivitaiModal(false)}
                className="px-3 py-1 bg-[#1a1d26] text-gray-400 rounded hover:bg-[#252a36]"
              >
                Cancel
              </button>
              <button
                disabled={isSyncing}
                onClick={handleStartCivitaiSync}
                className="px-4 py-1 bg-indigo-600 hover:bg-indigo-500 font-semibold text-white rounded cursor-pointer transition shadow-md"
              >
                {isSyncing ? 'Fetching...' : 'Start Search'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   METADATA & GENERATION INFO INSPECTOR MODAL
   ========================================================================= */
const MetadataModal: React.FC<{ item: HistoryItem | null; onClose: () => void }> = ({ item, onClose }) => {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-999999 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-130 max-h-[85vh] bg-[#141622] border border-[#2d3246] rounded-xl shadow-2xl flex flex-col text-xs text-gray-300 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-[#191b2a] border-b border-[#252a38]">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
            <Info className="w-4 h-4" />
            <span>Generation Parameters & Metadata</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-base cursor-pointer">✕</button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3 font-mono">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Prompt</label>
            <div className="bg-[#0e0f17] p-2.5 rounded border border-[#25293d] text-gray-200 select-text wrap-break-word">
              {item.prompt}
            </div>
          </div>

          {item.negativePrompt && (
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Negative Prompt</label>
              <div className="bg-[#0e0f17] p-2.5 rounded border border-[#25293d] text-gray-400 select-text wrap-break-word">
                {item.negativePrompt}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-[#0e0f17] p-2 rounded border border-[#25293d]">
              <span className="text-gray-500 block text-[10px]">Model</span>
              <span className="text-indigo-300 break-all">{item.params.model}</span>
            </div>
            <div className="bg-[#0e0f17] p-2 rounded border border-[#25293d]">
              <span className="text-gray-500 block text-[10px]">Seed</span>
              <span className="text-amber-400">{item.params.seed}</span>
            </div>
            <div className="bg-[#0e0f17] p-2 rounded border border-[#25293d]">
              <span className="text-gray-500 block text-[10px]">Steps / CFG</span>
              <span className="text-gray-200">{item.params.steps} steps • CFG {item.params.cfgScale ?? 6.5}</span>
            </div>
            <div className="bg-[#0e0f17] p-2 rounded border border-[#25293d]">
              <span className="text-gray-500 block text-[10px]">Dimensions</span>
              <span className="text-gray-200">{item.params.width} × {item.params.height}</span>
            </div>
            <div className="bg-[#0e0f17] p-2 rounded border border-[#25293d]">
              <span className="text-gray-500 block text-[10px]">Sampler</span>
              <span className="text-gray-200">{item.params.sampler ?? 'euler_ancestral'}</span>
            </div>
            <div className="bg-[#0e0f17] p-2 rounded border border-[#25293d]">
              <span className="text-gray-500 block text-[10px]">Scheduler</span>
              <span className="text-gray-200">{item.params.scheduler ?? 'normal'}</span>
            </div>
          </div>
        </div>

        <div className="px-4 py-2.5 bg-[#191b2a] border-t border-[#252a38] flex justify-end">
          <button
            onClick={() => {
              const fullParams = `${item.prompt}\nNegative prompt: ${item.negativePrompt || ''}\nSteps: ${item.params.steps}, Sampler: ${item.params.sampler}, CFG scale: ${item.params.cfgScale}, Seed: ${item.params.seed}, Size: ${item.params.width}x${item.params.height}, Model: ${item.params.model}`;
              navigator.clipboard.writeText(fullParams);
            }}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded text-xs cursor-pointer transition flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Full Parameters</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   4. HISTORY PANEL
   ========================================================================= */
const HistoryPanel: React.FC<IDockviewPanelProps> = () => {
  const { history, sessionStartTime, setParams, useGenerationParams, setComparisonImage, settings, updateSettings, deleteHistoryItem, setActiveContextMenu } = useAppStore();
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);

  const [selectedMetaItem, setSelectedMetaItem] = useState<HistoryItem | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);

  const sessionHistory = useMemo(() => {
    return history
      .filter((item: any) => {
        const itemTime = item.timestamp || Number(item.id.split('-')[1]) || 0;
        return itemTime === 0 || itemTime >= sessionStartTime - 5000;
      })
      .filter((item) => (!showFavoritesOnly ? true : item.isFavorite));
  }, [history, sessionStartTime, showFavoritesOnly]);

  const batchedHistory = useMemo(() => {
    if (!settings.separateBatches) {
      return sessionHistory.map((item) => ({ batchId: item.id, items: [item] }));
    }

    const groups: { batchId: string; items: typeof sessionHistory }[] = [];
    const batchMap = new Map<string, typeof sessionHistory>();

    sessionHistory.forEach((item) => {
      const bId = item.batchId || `time-${Math.floor((item.timestamp || 0) / 2500)}`;
      if (!batchMap.has(bId)) {
        const list: typeof sessionHistory = [];
        batchMap.set(bId, list);
        groups.push({ batchId: bId, items: list });
      }
      batchMap.get(bId)!.push(item);
    });

    return groups;
  }, [sessionHistory, settings.separateBatches]);

  const handleHistoryContextMenu = (e: React.MouseEvent, item: HistoryItem) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        label: 'Inspect Generation Info',
        icon: <Info className="w-3.5 h-3.5 text-cyan-400" />,
        action: () => setSelectedMetaItem(item)
      },
      {
        label: 'Use generation params',
        icon: <Check className="w-3.5 h-3.5 text-emerald-400" />,
        action: () => useGenerationParams(item)
      },
      {
        label: 'Set as Comparison Image (B)',
        icon: <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />,
        action: () => setComparisonImage(resolveImageUrl(item.imageUrl))
      },
      {
        label: 'View in Viewport Canvas',
        icon: <Maximize2 className="w-3.5 h-3.5" />,
        action: () => setParams({ activeImage: resolveImageUrl(item.imageUrl) })
      },
      {
        label: 'Copy Positive Prompt',
        icon: <Copy className="w-3.5 h-3.5" />,
        action: () => navigator.clipboard.writeText(item.prompt)
      },
      {
        separator: true,
        label: 'Remove from session history',
        icon: <Trash2 className="w-3.5 h-3.5 text-amber-400" />,
        action: () => deleteHistoryItem(item.id)
      },
      {
        label: 'Delete permanently',
        danger: true,
        icon: <Trash2 className="w-3.5 h-3.5" />,
        action: () => deleteHistoryItem(item.id)
      }
    ];

    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: 'Session History Entry', items });
  };

  return (
    <div
      className="h-full p-3 bg-[#121418] flex flex-col gap-2.5 overflow-hidden select-none text-xs relative"
      style={{ zoom: `${settings.sectionScales.history}%` }}
    >
      <div className="flex items-center justify-between border-b border-[#252a35] pb-1.5">
        <span className="font-semibold text-gray-300 flex items-center gap-1">
          <HistoryIcon className="w-3.5 h-3.5 text-indigo-400" /> Current Session ({sessionHistory.length})
        </span>
        <div className="flex items-center gap-1.5 relative">
          <button
            onClick={() => setShowFavoritesOnly((prev) => !prev)}
            className={`p-1 rounded cursor-pointer border border-[#2b2f3a] transition flex items-center gap-1 text-[10px] ${
              showFavoritesOnly ? 'bg-amber-600/30 text-amber-300 border-amber-500/50' : 'bg-[#181a20] text-gray-400'
            }`}
            title="Filter Favorites"
          >
            <Star className={`w-3.5 h-3.5 ${showFavoritesOnly ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>

          <button
            onClick={() => setShowSettingsPopover((prev) => !prev)}
            className="p-1 hover:bg-[#202430] text-gray-300 rounded cursor-pointer transition flex items-center gap-1 bg-[#181a20] border border-[#2b2f3a] px-2 text-[10px]"
            title="History Settings"
          >
            <Sliders className="w-3 h-3 text-indigo-400" />
            <span>Options</span>
          </button>

          <button
            onClick={() => setViewMode(viewMode === 'cards' ? 'list' : 'cards')}
            className="p-1 hover:bg-[#202430] text-gray-300 rounded cursor-pointer border border-[#2b2f3a] bg-[#181a20]"
            title="Toggle View Mode"
          >
            {viewMode === 'cards' ? <List className="w-3.5 h-3.5" /> : <Grid className="w-3.5 h-3.5" />}
          </button>

          {showSettingsPopover && (
            <div className="absolute right-0 top-8 w-64 bg-[#161822] border border-[#2d3246] rounded-xl shadow-2xl p-3 z-50 flex flex-col gap-2.5 text-xs text-gray-200">
              <div className="flex items-center justify-between border-b border-[#252a38] pb-1.5 font-semibold text-indigo-400">
                <span>Session History Options</span>
                <button onClick={() => setShowSettingsPopover(false)} className="text-gray-500 hover:text-white">✕</button>
              </div>

              <label className="flex items-center justify-between cursor-pointer gap-2">
                <div>
                  <span className="text-[11px] font-medium text-gray-200">Separate Batches</span>
                  <p className="text-[9px] text-gray-500">Split multi-image batch into separate history entries</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.separateBatches}
                  onChange={(e) => updateSettings({ separateBatches: e.target.checked })}
                  className="accent-indigo-500 w-4 h-4 cursor-pointer shrink-0"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer gap-2 pt-2 border-t border-[#252a38]">
                <div>
                  <span className="text-[11px] font-medium text-gray-200">Auto Swap to Latest Image</span>
                  <p className="text-[9px] text-gray-500">Automatically switch viewport to newly generated images</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoSwapToLatest}
                  onChange={(e) => updateSettings({ autoSwapToLatest: e.target.checked })}
                  className="accent-indigo-500 w-4 h-4 cursor-pointer shrink-0"
                />
              </label>

              <div className="pt-2 border-t border-[#252a38]">
                <button
                  onClick={() => {
                    const currentIds = new Set(sessionHistory.map((h: any) => h.id));
                    const remaining = history.filter((h: any) => !currentIds.has(h.id));
                    useAppStore.setState({ history: remaining });
                    setShowSettingsPopover(false);
                  }}
                  className="w-full py-1.5 bg-rose-950/40 border border-rose-800/60 hover:bg-rose-900 text-rose-300 rounded font-medium transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Current Session History</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
        {batchedHistory.length === 0 ? (
          <span className="text-gray-600 m-auto">No generations in this session yet.</span>
        ) : (
          batchedHistory.map((batch, groupIdx) => (
            <div
              key={batch.batchId || groupIdx}
              className="bg-[#14161f] border border-[#262b3c] rounded-xl p-2.5 flex flex-col gap-2 shadow-lg relative"
            >
              {settings.separateBatches && batchedHistory.length > 1 && (
                <div className="flex items-center justify-between pb-1 border-b border-[#202432] text-[10px] font-mono text-indigo-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    Batch #{batchedHistory.length - groupIdx} ({batch.items.length} images)
                  </span>
                  <span className="text-gray-500">{batch.items[0]?.createdAt}</span>
                </div>
              )}

              <div className={`grid ${viewMode === 'cards' ? 'grid-cols-2 gap-2' : 'flex flex-col gap-2'} items-start`}>
                {batch.items.map((item, index) => {
                  const finalImageUrl = resolveImageUrl(item.imageUrl);
                  return (
                    <div
                      key={item.id || index}
                      onClick={() => setParams({ activeImage: finalImageUrl })}
                      onContextMenu={(e) => handleHistoryContextMenu(e, item)}
                      className={`border border-[#252a35] bg-[#161821] rounded hover:border-indigo-500 cursor-pointer transition flex relative group shrink-0 ${
                        viewMode === 'cards' ? 'flex-col p-1.5 gap-1.5 h-auto' : 'items-center gap-2 p-2'
                      }`}
                    >
                      <div className="relative w-full">
                        <img
                          src={finalImageUrl}
                          alt="thumb"
                          className={`rounded object-cover ${viewMode === 'cards' ? 'w-full h-28' : 'w-14 h-14'}`}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(item.id);
                          }}
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-black/80 text-gray-400 hover:text-amber-400 transition cursor-pointer z-10"
                          title={item.isFavorite ? 'Remove from favorites' : 'Star as favorite'}
                        >
                          <Star className={`w-3 h-3 ${item.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>
                      </div>
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <span className="text-[11px] text-gray-300 truncate" title={item.prompt}>{item.prompt}</span>
                        <div className="flex flex-wrap gap-1 font-mono text-[9px] text-gray-500 mt-1">
                          <span>{item.params.model.split('/').pop()}</span>
                          <span>•</span>
                          <span>Seed: {item.params.seed}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <MetadataModal
        item={selectedMetaItem}
        onClose={() => setSelectedMetaItem(null)}
      />
    </div>
  );
};

/* =========================================================================
   NEW GALLERY PANEL
   ========================================================================= */
const GalleryPanel: React.FC<IDockviewPanelProps> = () => {
  const { history, setParams, useGenerationParams, setComparisonImage, deleteHistoryItem, setActiveContextMenu } = useAppStore();
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

  const [selectedMetaItem, setSelectedMetaItem] = useState<HistoryItem | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => (!showFavoritesOnly ? true : item.isFavorite));
  }, [history, showFavoritesOnly]);

  const handleGalleryContextMenu = (e: React.MouseEvent, item: HistoryItem) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        label: 'Inspect Generation Info',
        icon: <Info className="w-3.5 h-3.5 text-cyan-400" />,
        action: () => setSelectedMetaItem(item)
      },
      {
        label: 'Use generation params',
        icon: <Check className="w-3.5 h-3.5 text-emerald-400" />,
        action: () => useGenerationParams(item)
      },
      {
        label: 'Set as Comparison Image (B)',
        icon: <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />,
        action: () => setComparisonImage(resolveImageUrl(item.imageUrl))
      },
      {
        label: 'View in Viewport Canvas',
        icon: <Maximize2 className="w-3.5 h-3.5" />,
        action: () => setParams({ activeImage: resolveImageUrl(item.imageUrl) })
      },
      {
        separator: true,
        label: 'Delete permanently',
        danger: true,
        icon: <Trash2 className="w-3.5 h-3.5" />,
        action: () => deleteHistoryItem(item.id)
      }
    ];

    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: 'Gallery Entry', items });
  };

  return (
    <div className="h-full p-3 bg-[#121418] flex flex-col gap-2.5 overflow-hidden select-none text-xs">
      <div className="flex items-center justify-between border-b border-[#252a35] pb-1.5">
        <span className="font-semibold text-gray-300 flex items-center gap-1">
          <ImageIcon className="w-3.5 h-3.5 text-purple-400" /> Full Gallery ({filteredHistory.length})
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowFavoritesOnly((prev) => !prev)}
            className={`p-1 rounded cursor-pointer border border-[#2b2f3a] transition flex items-center gap-1 text-[10px] ${
              showFavoritesOnly ? 'bg-amber-600/30 text-amber-300 border-amber-500/50' : 'bg-[#181a20] text-gray-400'
            }`}
            title="Filter Favorites"
          >
            <Star className={`w-3.5 h-3.5 ${showFavoritesOnly ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'cards' ? 'list' : 'cards')}
            className="p-1 hover:bg-[#202430] text-gray-300 rounded cursor-pointer border border-[#2b2f3a] bg-[#181a20]"
            title="Toggle View Mode"
          >
            {viewMode === 'cards' ? <List className="w-3.5 h-3.5" /> : <Grid className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto pr-1 items-start ${viewMode === 'cards' ? 'grid grid-cols-3 gap-2' : 'flex flex-col gap-2'}`}>
        {filteredHistory.length === 0 ? (
          <span className="text-gray-600 m-auto">No gallery images found.</span>
        ) : (
          filteredHistory.map((item, index) => {
            const finalImageUrl = resolveImageUrl(item.imageUrl);
            return (
              <div
                key={item.id || index}
                onClick={() => setParams({ activeImage: finalImageUrl })}
                onContextMenu={(e) => handleGalleryContextMenu(e, item)}
                className={`border border-[#252a35] bg-[#161821] rounded hover:border-purple-500 cursor-pointer transition flex relative group shrink-0 ${
                  viewMode === 'cards' ? 'flex-col p-1.5 gap-1.5 h-auto' : 'items-center gap-2 p-2'
                }`}
              >
                <div className="relative w-full">
                  <img
                    src={finalImageUrl}
                    alt="thumb"
                    className={`rounded object-cover ${viewMode === 'cards' ? 'w-full h-28' : 'w-14 h-14'}`}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(item.id);
                    }}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-black/80 text-gray-400 hover:text-amber-400 transition cursor-pointer z-10"
                    title={item.isFavorite ? 'Remove from favorites' : 'Star as favorite'}
                  >
                    <Star className={`w-3 h-3 ${item.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                  </button>
                </div>
                <div className="flex-1 flex flex-col overflow-hidden">
                  <span className="text-[11px] text-gray-300 truncate" title={item.prompt}>{item.prompt}</span>
                  <span className="text-[9px] text-gray-500 font-mono mt-0.5">{item.createdAt}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <MetadataModal
        item={selectedMetaItem}
        onClose={() => setSelectedMetaItem(null)}
      />
    </div>
  );
};

/* =========================================================================
   5. IMAGE SEARCH, CONTROLNET, ADETAILER, PARAMS
   ========================================================================= */
const ImageSearchPanel: React.FC<IDockviewPanelProps> = () => {
  const { history, setParams, useGenerationParams, setComparisonImage, settings, setActiveContextMenu } = useAppStore();
  const [query, setQuery] = useState('');

  const filtered = history.filter(
    (h) => h.prompt.toLowerCase().includes(query.toLowerCase()) || h.params.model.toLowerCase().includes(query.toLowerCase())
  );

  const handleSearchContextMenu = (e: React.MouseEvent, item: HistoryItem) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        label: 'Use generation params',
        icon: <Check className="w-3.5 h-3.5 text-emerald-400" />,
        action: () => useGenerationParams(item)
      },
      {
        label: 'Set as Comparison Image (B)',
        icon: <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />,
        action: () => setComparisonImage(item.imageUrl)
      },
      {
        label: 'View in Viewport Canvas',
        icon: <Maximize2 className="w-3.5 h-3.5" />,
        action: () => setParams({ activeImage: item.imageUrl })
      },
      {
        label: 'Copy Positive Prompt',
        icon: <Copy className="w-3.5 h-3.5" />,
        action: () => navigator.clipboard.writeText(item.prompt)
      }
    ];

    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: 'Image Metadata', items });
  };

  return (
    <div
      className="h-full p-3 bg-[#121418] flex flex-col gap-2.5 text-xs select-none overflow-hidden"
      style={{ zoom: `${settings.sectionScales.imagesearch}%` }}
    >
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
              onContextMenu={(e) => handleSearchContextMenu(e, item)}
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

const ControlNetPanel: React.FC<IDockviewPanelProps> = () => {
  const { controlNetUnits, updateControlNet, settings } = useAppStore();
  const [activeUnitId, setActiveUnitId] = useState('1');

  const activeUnit = controlNetUnits.find((u) => u.id === activeUnitId) || controlNetUnits[0];

  return (
    <div
      className="h-full p-3 bg-[#121418] flex flex-col gap-3 text-xs overflow-y-auto select-none"
      style={{ zoom: `${settings.sectionScales.controlnet}%` }}
    >
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

const ADetailerPanel: React.FC<IDockviewPanelProps> = () => {
  const { aDetailerUnits, updateADetailer, settings } = useAppStore();
  const [activeId, setActiveId] = useState('1');

  const unit = aDetailerUnits.find((u) => u.id === activeId) || aDetailerUnits[0];

  return (
    <div
      className="h-full p-3 bg-[#121418] flex flex-col gap-3 text-xs overflow-y-auto select-none"
      style={{ zoom: `${settings.sectionScales.adetailer}%` }}
    >
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

const ParamsPanel: React.FC<IDockviewPanelProps> = () => {
  const {
    steps, cfgScale, width, height, seed, sampler, scheduler, batchCount,
    model, modelsList, vae, vaesList, textEncoder, textEncodersList,
    setParams, setModel, loadAssets, settings
  } = useAppStore();

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  return (
    <div
      className="h-full p-3 bg-[#121418] flex flex-col gap-3 text-xs overflow-y-auto select-none"
      style={{ zoom: `${settings.sectionScales.params}%` }}
    >
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

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-gray-400 block mb-1">Seed (-1 = Random)</label>
          <input
            type="number"
            value={seed}
            onChange={(e) => setParams({ seed: Number(e.target.value) })}
            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 font-mono"
          />
        </div>
        <div>
          <label className="text-gray-400 block mb-1">Batch Count</label>
          <input
            type="number"
            min="1"
            max="16"
            value={batchCount}
            onChange={(e) => setParams({ batchCount: Math.max(1, Number(e.target.value)) })}
            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 font-mono"
          />
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   6. MAIN WORKSPACE CONTAINER
   ========================================================================= */
const components = {
  params: ParamsPanel,
  preview: PreviewPanel,
  extranetworks: ExtraNetworksPanel,
  controlnet: ControlNetPanel,
  adetailer: ADetailerPanel,
  history: HistoryPanel,
  gallery: GalleryPanel,
  imagesearch: ImageSearchPanel
};

export const Workspace: React.FC = () => {
  const {
    settings,
    updateSettings,
    setSectionScale,
    setPrompt,
    setNegativePrompt,
    activeContextMenu,
    setActiveContextMenu
  } = useAppStore();

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    bottomTray: false,
  });

  const toggleSectionCollapse = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const [showConsole, setShowConsole] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<Array<{ time: string; type: 'log' | 'warn' | 'error'; msg: string }>>([]);

  useEffect(() => {
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    const pushLog = (type: 'log' | 'warn' | 'error', args: any[]) => {
      const formatted = args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
        .join(' ');
      setConsoleLogs((prev) => [
        ...prev.slice(-150),
        {
          time: new Date().toLocaleTimeString(),
          type,
          msg: formatted,
        },
      ]);
    };

    console.log = (...args: any[]) => { pushLog('log', args); origLog(...args); };
    console.warn = (...args: any[]) => { pushLog('warn', args); origWarn(...args); };
    console.error = (...args: any[]) => { pushLog('error', args); origError(...args); };

    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    };
  }, []);

  const [dockApi, setDockApi] = useState<DockviewApi | null>(null);
  const [isTopBarCollapsed, setIsTopBarCollapsed] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeScaleSection, setActiveScaleSection] = useState<keyof AppSettings['sectionScales']>('pills');

  const [triggerPos, setTriggerPos] = useState({ x: 12, y: 12 });
  const isDraggingTrigger = useRef(false);
  const dragTriggerOffset = useRef({ x: 0, y: 0 });

  const [bottomHeight, setBottomHeight] = useState(settings.bottomPanelHeight || 340);
  const isResizingBottom = useRef(false);

  useEffect(() => {
    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const items: ContextMenuItem[] = [
        {
          label: 'Clear Positive Prompt',
          icon: <Trash2 className="w-3.5 h-3.5" />,
          action: () => setPrompt('')
        },
        {
          label: 'Clear Negative Prompt',
          icon: <Trash2 className="w-3.5 h-3.5" />,
          action: () => setNegativePrompt('')
        },
        {
          separator: true,
          label: 'Reload Asset Catalogs',
          icon: <RotateCw className="w-3.5 h-3.5" />,
          action: () => useAppStore.getState().loadAssets()
        }
      ];
      setActiveContextMenu({ x: e.clientX, y: e.clientY, title: 'Workspace Actions', items });
    };

    window.addEventListener('contextmenu', handleGlobalContextMenu);
    return () => window.removeEventListener('contextmenu', handleGlobalContextMenu);
  }, [setPrompt, setNegativePrompt, setActiveContextMenu]);

  const onReady = (event: DockviewReadyEvent) => {
    setDockApi(event.api);

    if (settings.autoSaveLayout) {
      const savedLayout = localStorage.getItem('swarm_dockview_layout');
      if (savedLayout) {
        try {
          event.api.fromJSON(JSON.parse(savedLayout));
          return;
        } catch {}
      }
    }

    applyLayoutPreset(settings.activePreset, event.api);
  };

  const applyLayoutPreset = (presetName: AppSettings['activePreset'], api = dockApi) => {
    if (!api) return;
    api.clear();

    if (presetName === 'Prompt Engineer') {
      setBottomHeight(520);
      const params = api.addPanel({ id: 'params_panel', component: 'params', title: 'Parameters', initialWidth: 280 });
      api.addPanel({ id: 'preview_panel', component: 'preview', title: 'Viewport', position: { referencePanel: params, direction: 'right' } });
      api.addPanel({ id: 'extranetworks_panel', component: 'extranetworks', title: 'Extra Networks', position: { referencePanel: params, direction: 'within' } });
    } else if (presetName === 'Studio Canvas') {
      setBottomHeight(220);
      const preview = api.addPanel({ id: 'preview_panel', component: 'preview', title: 'Viewport' });
      api.addPanel({ id: 'params_panel', component: 'params', title: 'Parameters', position: { referencePanel: preview, direction: 'left' }, initialWidth: 300 });
    } else if (presetName === 'Multi-ControlNet') {
      setBottomHeight(300);
      const params = api.addPanel({ id: 'params_panel', component: 'params', title: 'Parameters', initialWidth: 300 });
      const cnet = api.addPanel({ id: 'controlnet_panel', component: 'controlnet', title: 'ControlNet', position: { referencePanel: params, direction: 'right' }, initialWidth: 320 });
      api.addPanel({ id: 'preview_panel', component: 'preview', title: 'Viewport', position: { referencePanel: cnet, direction: 'right' } });
    } else {
      setBottomHeight(340);
      const params = api.addPanel({ id: 'params_panel', component: 'params', title: 'Parameters', initialWidth: 320 });
      api.addPanel({ id: 'preview_panel', component: 'preview', title: 'Viewport', position: { referencePanel: params, direction: 'right' } });
    }

    updateSettings({ activePreset: presetName, bottomPanelHeight: bottomHeight });
  };

  useEffect(() => {
    if (!dockApi) return;
    const disposable = dockApi.onDidLayoutChange(() => {
      if (settings.autoSaveLayout) {
        try {
          localStorage.setItem('swarm_dockview_layout', JSON.stringify(dockApi.toJSON()));
        } catch {}
      }
    });
    return () => disposable.dispose();
  }, [dockApi, settings.autoSaveLayout]);

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
        const clamped = Math.max(160, Math.min(window.innerHeight - 150, newHeight));
        setBottomHeight(clamped);
        updateSettings({ bottomPanelHeight: clamped });
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
  }, [triggerPos, updateSettings]);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#0f1115] overflow-hidden">
      {!isTopBarCollapsed ? (
        <div className="h-9 bg-[#13151b] border-b border-[#252a35] px-3 flex items-center justify-between select-none shrink-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsTopBarCollapsed(true)}
              title="Click to collapse header"
              className="p-1 hover:bg-[#202430] rounded cursor-pointer transition text-indigo-400 hover:text-white"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <span className="font-semibold text-xs text-gray-200">SwarmCanvas</span>

            <div className="flex items-center gap-1 bg-[#181b24] border border-[#2b2f3a] px-1.5 py-0.5 rounded text-[11px]">
              <span className="text-gray-400 font-mono text-[10px]">Preset:</span>
              {(['Default', 'Prompt Engineer', 'Studio Canvas', 'Multi-ControlNet'] as const).map((pr) => (
                <button
                  key={pr}
                  onClick={() => applyLayoutPreset(pr)}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
                    settings.activePreset === pr ? 'bg-indigo-600 text-white font-medium' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {pr}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#181b24] border border-[#2b2f3a] px-2 py-0.5 rounded-md">
              <Sliders className="w-3 h-3 text-gray-400" />
              <select
                value={String(activeScaleSection)}
                onChange={(e) => setActiveScaleSection(e.target.value as any)}
                className="bg-transparent text-[10px] text-gray-300 font-mono outline-none cursor-pointer"
              >
                <option value="pills">Pills Zoom</option>
                <option value="params">Params Zoom</option>
                <option value="extranetworks">ExtraNet Zoom</option>
                <option value="history">History Zoom</option>
                <option value="controlnet">ControlNet Zoom</option>
                <option value="adetailer">ADetailer Zoom</option>
              </select>
              <input
                type="range"
                min="75"
                max="150"
                step="5"
                value={settings.sectionScales[activeScaleSection] || 100}
                onChange={(e) => setSectionScale(activeScaleSection, Number(e.target.value))}
                className="w-16 h-1 bg-[#252a36] rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <span className="text-[10px] text-indigo-400 font-mono w-7 text-right">
                {settings.sectionScales[activeScaleSection] || 100}%
              </span>
            </div>

            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-1 bg-[#1a1d26] hover:bg-[#252a36] text-gray-300 rounded border border-[#2b2f3a] cursor-pointer"
              title="Full App & State Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setShowConsole(true)}
              className="p-1 bg-[#1a1d26] hover:bg-[#252a36] text-indigo-400 hover:text-white rounded border border-[#2b2f3a] cursor-pointer"
              title="Open Debug Console">
              <Terminal className="w-3.5 h-3.5" />
            </button>

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
                  <button onClick={() => addPanel('gallery', 'Gallery')} className="px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center gap-2 cursor-pointer">
                    <ImageIcon className="w-3.5 h-3.5 text-purple-400" /> Gallery
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

      {/* Main Grid */}
      <div className="flex-1 w-full min-h-0">
        <DockviewReact components={components} onReady={onReady} className="dockview-theme-dark h-full w-full" />
      </div>

      <div
        onMouseDown={() => (isResizingBottom.current = true)}
        className="h-1.5 w-full bg-[#181b24] hover:bg-indigo-500 cursor-row-resize shrink-0 transition-colors z-20 border-t border-[#252a35]"
      />

      {/* Bottom Tray */}
      <div className="relative shrink-0 flex flex-col bg-[#0f1115] border-t border-[#252a35]">
        <button
          type="button"
          onClick={() => toggleSectionCollapse('bottomTray')}
          className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 px-3 py-0.5 bg-[#181b24] border border-[#3b4254] hover:bg-indigo-600 hover:text-white rounded-full text-[10px] font-mono text-gray-300 shadow-md cursor-pointer transition flex items-center gap-1"
          title={collapsedSections.bottomTray ? 'Expand Prompt Panel' : 'Collapse Prompt Panel'}
        >
          <span>{collapsedSections.bottomTray ? '▲ Expand Prompts' : '▼ Collapse Prompts'}</span>
        </button>

        {!collapsedSections.bottomTray && (
          <div style={{ height: `${bottomHeight}px` }} className="w-full flex flex-col">
            <PromptPillsPanel api={{} as any} containerApi={{} as any} params={{}} />
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-999999 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-120 max-h-[85vh] overflow-y-auto bg-[#161822] border border-[#2d3246] rounded-xl shadow-2xl p-4 text-xs text-gray-200 flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-[#252a38] pb-2 font-semibold text-sm text-indigo-400">
              <span className="flex items-center gap-2"><Settings className="w-4 h-4" /> Preferences & Customization</span>
              <button onClick={() => setShowSettingsModal(false)} className="text-gray-500 hover:text-white text-base">✕</button>
            </div>

            {/* Categorization Engine Selection */}
            <div className="flex flex-col gap-2 p-2.5 bg-[#12141c] border border-indigo-500/30 rounded">
              <span className="font-semibold text-indigo-300">Categorization Engine</span>

              <select
                value={settings.categorizationMode || 'prompt_flow'}
                onChange={async (e) => {
                  const mode = e.target.value as any;
                  updateSettings({ categorizationMode: mode });
                  await danbooru.setCategorizationMode(mode);
                  useAppStore.getState().setActiveMacroCategory('All');
                  useAppStore.getState().setActiveSubCategory('All');
                }}
                className="bg-[#1a1d28] border border-[#2e3346] rounded p-1.5 text-xs text-gray-200 font-semibold outline-none cursor-pointer"
              >
                <option value="prompt_flow">Prompt-Flow Pipeline (Workflow-Centric) — Recommended</option>
                <option value="danbooru_types">Danbooru Official Types (General, Character, Copyright, Artist, Meta)</option>
                <option value="danbooru_groups">Danbooru Wiki Tag Groups (Extension Standard)</option>
              </select>

              <div className="flex items-center justify-between pt-1 border-t border-[#252a38]">
                <span className="text-gray-300 text-[11px]">Tag Sorting Order:</span>
                <select
                  value={settings.tagSortOrder || 'alphabetical'}
                  onChange={async (e) => {
                    const sort = e.target.value as any;
                    updateSettings({ tagSortOrder: sort });
                    await danbooru.setSortMode(sort);
                  }}
                  className="bg-[#1a1d28] border border-[#2e3346] rounded px-2 py-0.5 text-[11px] text-gray-200 outline-none cursor-pointer font-mono"
                >
                  <option value="alphabetical">A–Z Alphabetical</option>
                  <option value="popularity">Popularity (Post Count)</option>
                </select>
              </div>
            </div>

            {/* Audio Notifications */}
            <div className="flex flex-col gap-2 border-t border-[#252a38] pt-2">
              <span className="font-mono text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                Audio Notifications
              </span>

              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">
                <span className="flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Play sound when batch generation completes</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.playCompletionSound}
                  onChange={(e) => updateSettings({ playCompletionSound: e.target.checked })}
                  className="accent-indigo-500 w-4 h-4 cursor-pointer"
                />
              </label>

              {settings.playCompletionSound && (
                <div className="p-2.5 bg-[#12141c] border border-[#252938] rounded flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-[11px]">Completion Sound:</span>
                    <span className="font-mono text-[10px] text-indigo-300">
                      {settings.completionSoundData ? 'Custom Audio File' : 'Default Chime'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex-1 px-3 py-1.5 bg-[#1a1d28] hover:bg-[#252a36] border border-[#2e3346] text-gray-300 rounded text-center cursor-pointer transition text-xs truncate">
                      <span>{settings.completionSoundData ? 'Change Audio File (.mp3, .wav)' : 'Upload Sound File (.mp3, .wav)'}</span>
                      <input
                        type="file"
                        accept="audio/mp3,audio/wav,audio/ogg,audio/mpeg"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = () => {
                              updateSettings({ completionSoundData: reader.result as string });
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        if (settings.completionSoundData) {
                          const testAudio = new Audio(settings.completionSoundData);
                          testAudio.play();
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
                      }}
                      className="px-2.5 py-1.5 bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-200 rounded cursor-pointer transition flex items-center gap-1 shrink-0"
                      title="Test current sound"
                    >
                      <Play className="w-3 h-3" />
                      <span>Test</span>
                    </button>

                    {settings.completionSoundData && (
                      <button
                        type="button"
                        onClick={() => updateSettings({ completionSoundData: null })}
                        className="p-1.5 hover:bg-rose-900/50 text-gray-400 hover:text-rose-300 rounded border border-[#2e3346] cursor-pointer transition"
                        title="Reset to default chime"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Tag Customization */}
            <div className="flex flex-col gap-2 border-t border-[#252a38] pt-2">
              <span className="font-mono text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Prompt & Tag Customization</span>

              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">
                <span>Auto-inject LoRA activation words on insert</span>
                <input
                  type="checkbox"
                  checked={settings.autoInjectLoraTrigger}
                  onChange={(e) => updateSettings({ autoInjectLoraTrigger: e.target.checked })}
                  className="accent-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">
                <span>Display '+' prefix before tag labels</span>
                <input
                  type="checkbox"
                  checked={settings.showTagPlusPrefix}
                  onChange={(e) => updateSettings({ showTagPlusPrefix: e.target.checked })}
                  className="accent-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">
                <span>Display post count badges on pills</span>
                <input
                  type="checkbox"
                  checked={settings.showTagPostCounts}
                  onChange={(e) => updateSettings({ showTagPostCounts: e.target.checked })}
                  className="accent-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">
                <span>Format tags with underscores instead of spaces</span>
                <input
                  type="checkbox"
                  checked={settings.useUnderscores}
                  onChange={(e) => updateSettings({ useUnderscores: e.target.checked })}
                  className="accent-indigo-500 w-4 h-4"
                />
              </label>

              <div className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded">
                <span>Shift-Click weight increment step</span>
                <select
                  value={settings.tagClickWeightStep}
                  onChange={(e) => updateSettings({ tagClickWeightStep: Number(e.target.value) })}
                  className="bg-[#1a1d28] border border-[#2e3346] rounded px-2 py-0.5 text-xs text-gray-200 outline-none"
                >
                  <option value="0.05">+0.05</option>
                  <option value="0.10">+0.10</option>
                  <option value="0.15">+0.15</option>
                  <option value="0.20">+0.20 (Default)</option>
                  <option value="0.25">+0.25</option>
                </select>
              </div>
            </div>

            {/* State Settings */}
            <div className="flex flex-col gap-2 border-t border-[#252a38] pt-2">
              <span className="font-mono text-[10px] text-gray-400 uppercase tracking-wider font-semibold">State & Persistence</span>

              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">
                <span>Preserve prompts & parameters across browser reloads</span>
                <input
                  type="checkbox"
                  checked={settings.preservePromptsOnReload}
                  onChange={(e) => updateSettings({ preservePromptsOnReload: e.target.checked })}
                  className="accent-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">
                <span>Randomize seed automatically when set to -1</span>
                <input
                  type="checkbox"
                  checked={settings.randomizeSeedOnGen}
                  onChange={(e) => updateSettings({ randomizeSeedOnGen: e.target.checked })}
                  className="accent-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">
                <span>Auto-save Dockview panel arrangements</span>
                <input
                  type="checkbox"
                  checked={settings.autoSaveLayout}
                  onChange={(e) => updateSettings({ autoSaveLayout: e.target.checked })}
                  className="accent-indigo-500 w-4 h-4"
                />
              </label>

              <div className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded">
                <span>Maximum history records kept in memory</span>
                <input
                  type="number"
                  min="10"
                  max="200"
                  step="10"
                  value={settings.maxHistoryCount}
                  onChange={(e) => updateSettings({ maxHistoryCount: Number(e.target.value) })}
                  className="w-16 bg-[#1a1d28] border border-[#2e3346] rounded px-2 py-0.5 text-xs text-gray-200 font-mono outline-none"
                />
              </div>

              <button
                onClick={() => {
                  localStorage.removeItem('swarm_canvas_persisted_store');
                  localStorage.removeItem('swarm_dockview_layout');
                  window.location.reload();
                }}
                className="w-full py-1.5 bg-rose-950/50 border border-rose-700/80 text-rose-300 rounded hover:bg-rose-900 transition cursor-pointer mt-2"
              >
                Reset All Stored State & Layout to Default
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Unified Context Menu */}
      {activeContextMenu && (
        <CustomContextMenu
          x={activeContextMenu.x}
          y={activeContextMenu.y}
          title={activeContextMenu.title}
          items={activeContextMenu.items}
          onClose={() => setActiveContextMenu(null)}
        />
      )}

      {/* In-App Debug Console Modal */}
      {showConsole && (
        <div className="fixed inset-0 z-999999 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-180 h-120 bg-[#0c0d12] border border-[#2d3246] rounded-xl shadow-2xl flex flex-col text-xs text-zinc-300 font-mono overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[#141620] border-b border-[#252a38]">
              <div className="flex items-center gap-2 text-indigo-400 font-semibold">
                <Terminal className="w-4 h-4" />
                <span>SwarmCanvas Debug Console</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConsoleLogs([])}
                  className="px-2 py-0.5 bg-[#1f2230] hover:bg-zinc-800 rounded text-[10px] text-zinc-400 hover:text-white cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setShowConsole(false)}
                  className="text-zinc-500 hover:text-white px-1 text-sm font-sans cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-1.5 bg-[#090a0f]">
              {consoleLogs.length === 0 ? (
                <span className="text-zinc-600">Console is clear. No errors or messages logged.</span>
              ) : (
                consoleLogs.map((log: { time: string; type: 'log' | 'warn' | 'error'; msg: string }, index: number) => (
                  <div
                    key={index}
                    className={`flex items-start gap-2 leading-relaxed ${
                      log.type === 'error'
                        ? 'text-rose-400'
                        : log.type === 'warn'
                        ? 'text-amber-300'
                        : 'text-zinc-300'
                    }`}
                  >
                    <span className="text-zinc-600 shrink-0 text-[10px]">[{log.time}]</span>
                    <span className="break-all">{log.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};