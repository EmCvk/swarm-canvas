import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { danbooru, AutocompleteItem } from '../api/danbooruService';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  className?: string;
  target: 'positive' | 'negative';
}

export const PromptAutosuggestTextarea: React.FC<Props> = ({
  value,
  onChange,
  placeholder,
  className = '',
  target
}) => {
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeWordRange, setActiveWordRange] = useState<{ start: number; end: number } | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const formatCount = (n: number | null) => {
    if (!n) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return n.toString();
  };

  // Positions dropdown directly on top of the active input in the root body
  const updateDropdownPosition = useCallback(() => {
    if (!textareaRef.current) return;
    const rect = textareaRef.current.getBoundingClientRect();

    setDropdownStyle({
      position: 'fixed',
      left: `${rect.left}px`,
      bottom: `${window.innerHeight - rect.top + 6}px`,
      width: `${Math.max(340, Math.min(520, rect.width))}px`,
      zIndex: 99999
    });
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    onChange(text);

    const cursorPos = e.target.selectionStart || 0;
    const textBefore = text.slice(0, cursorPos);
    const match = textBefore.match(/(?:^|,|\()\s*([a-zA-Z0-9_\-]+)$/);

    if (match && match[1] && match[1].length >= 1) {
      const queryWord = match[1];
      const start = cursorPos - queryWord.length;
      setActiveWordRange({ start, end: cursorPos });

      const matches = danbooru.searchAutocomplete(queryWord, 8);
      setSuggestions(matches);
      setSelectedIndex(0);
      updateDropdownPosition();
    } else {
      setSuggestions([]);
      setActiveWordRange(null);
    }
  };

  const applyTag = (tag: string) => {
    const cleanTag = tag.replace(/_/g, ' ');
    if (!activeWordRange || !textareaRef.current) {
      const updated = value.trim() ? `${value.trim()}, ${cleanTag}` : cleanTag;
      onChange(updated);
      setSuggestions([]);
      return;
    }

    const before = value.slice(0, activeWordRange.start);
    const after = value.slice(activeWordRange.end);
    const insertion = `${cleanTag}, `;
    const updated = before + insertion + after;

    onChange(updated);
    setSuggestions([]);
    setActiveWordRange(null);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const nextPos = activeWordRange.start + insertion.length;
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[selectedIndex]) {
        applyTag(suggestions[selectedIndex].tag);
      }
    } else if (e.key === 'Escape') {
      setSuggestions([]);
    }
  };

  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(ev.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(ev.target as Node)
      ) {
        setSuggestions([]);
      }
    };

    const handleWindowChange = () => {
      if (suggestions.length > 0) {
        updateDropdownPosition();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [suggestions.length, updateDropdownPosition]);

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`w-full h-full bg-[#161820] border border-[#2b2f3a] rounded p-2 text-xs text-gray-200 resize-none outline-none focus:border-indigo-500 font-sans ${className}`}
      />

      {/* Renders outside any clipping containers via React Portal */}
      {suggestions.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="max-h-64 overflow-y-auto bg-[#181a24] border border-[#2e3346] rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.8)] py-1 select-none backdrop-blur-md"
          >
            <div className="px-2.5 py-1 text-[10px] text-gray-400 border-b border-[#262a38] flex justify-between font-mono bg-[#14161f]">
              <span>Danbooru Tags ({suggestions.length})</span>
              <span>Tab / Enter to select</span>
            </div>

            {suggestions.map((item, idx) => (
              <div
                key={item.tag}
                onClick={() => applyTag(item.tag)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`px-3 py-1.5 text-xs flex justify-between items-center cursor-pointer transition ${
                  idx === selectedIndex
                    ? target === 'positive'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-rose-600 text-white'
                    : 'text-gray-300 hover:bg-[#202433]'
                }`}
              >
                <span className="font-semibold truncate pr-2">{item.tag.replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0">
                  <span className="opacity-60 text-gray-400">{item.category}</span>
                  {item.count && (
                    <span className="bg-black/40 px-1.5 py-0.5 rounded text-indigo-300 font-medium">
                      {formatCount(item.count)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};