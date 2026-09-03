// src/components/CustomContextMenu.tsx
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  danger?: boolean;
  separator?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  title?: string;
  onClose: () => void;
}

export const CustomContextMenu: React.FC<Props> = ({ x, y, items, title, onClose }) => {
  useEffect(() => {
    const handleClose = () => onClose();
    window.addEventListener('click', handleClose);
    window.addEventListener('keydown', (e) => e.key === 'Escape' && onClose());
    return () => window.removeEventListener('click', handleClose);
  }, [onClose]);

  const menuX = Math.min(x, window.innerWidth - 220);
  const menuY = Math.min(y, window.innerHeight - (items.length * 32 + 30));

  return createPortal(
    <div
      style={{ left: `${menuX}px`, top: `${menuY}px` }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-999999 w-52 bg-[#171923]/95 border border-[#2e3346] rounded-lg shadow-2xl py-1 select-none backdrop-blur-md text-xs text-gray-200 font-sans"
    >
      {title && (
        <div className="px-3 py-1 font-mono text-[10px] text-gray-400 border-b border-[#252a38] flex items-center justify-between">
          <span className="truncate">{title}</span>
        </div>
      )}

      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          {item.separator && <div className="h-px bg-[#262b3a] my-1" />}
          <button
            onClick={() => {
              item.action();
              onClose();
            }}
            className={`w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white transition cursor-pointer text-left ${
              item.danger ? 'text-rose-400 hover:bg-rose-600' : 'text-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              {item.icon}
              {item.label}
            </span>
          </button>
        </React.Fragment>
      ))}
    </div>,
    document.body
  );
};