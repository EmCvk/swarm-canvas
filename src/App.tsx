import React, { useState } from 'react';
import { Film, Image as ImageIcon } from 'lucide-react';
import { Workspace } from './components/Workspace';
import { AnimationLab } from './components/AnimationLab';

type AppTab = 'canvas' | 'animation';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('canvas');

  return (
    <div className="w-screen h-screen overflow-hidden bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="h-11 shrink-0 flex items-center gap-1 px-2 border-b border-zinc-800/80 bg-zinc-950">
        <button
          type="button"
          onClick={() => setActiveTab('canvas')}
          className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
            activeTab === 'canvas'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Canvas
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('animation')}
          className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
            activeTab === 'animation'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/20'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          Animation Lab
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {activeTab === 'canvas' ? <Workspace /> : <AnimationLab />}
      </div>
    </div>
  );
};

export default App;
