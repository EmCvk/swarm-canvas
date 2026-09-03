import React from 'react';
import { Workspace } from './components/Workspace';

export const App: React.FC = () => {
  return (
    <div className="w-screen h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <Workspace />
    </div>
  );
};

export default App;