import React, { useState, useRef, useEffect } from 'react';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const formatCount = (n: number | null) => {
    if (!n) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return n.toString();
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    onChange(text);

    const cursorPos = e.target.selectionStart || 0;
    const textBefore = text.slice(0, cursorPos);
    // Matches word token following comma, start of line, or open parenthesis
    const match = textBefore.match(/(?:^|,|\()\s*([a-zA-Z0-9_\-]+)$/);

    if (match && match[1] && match[1].length >= 1) {
      const queryWord = match[1];
      const start = cursorPos - queryWord.length;
      setActiveWordRange({ start, end: cursorPos });

      const matches = danbooru.searchAutocomplete(queryWord, 8);
      setSuggestions(matches);
      setSelectedIndex(0);
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
      if (dropdownRef.current && !dropdownRef.current.contains(ev.target as Node)) {
        setSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

      {suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-2 bottom-full mb-1 w-80 max-h-56 overflow-y-auto bg-[#1a1d26] border border-[#303646] rounded shadow-2xl z-50 py-1"
        >
          <div className="px-2 py-1 text-[10px] text-gray-400 border-b border-[#252a35] flex justify-between font-mono">
            <span>Danbooru Tags</span>
            <span>Tab / Enter</span>
          </div>
          {suggestions.map((item, idx) => (
            <div
              key={item.tag}
              onClick={() => applyTag(item.tag)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`px-2.5 py-1 text-xs flex justify-between items-center cursor-pointer transition ${
                idx === selectedIndex
                  ? target === 'positive'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-rose-600 text-white'
                  : 'text-gray-300 hover:bg-[#232733]'
              }`}
            >
              <span className="font-medium">{item.tag.replace(/_/g, ' ')}</span>
              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                <span className="opacity-60">{item.category}</span>
                {item.count && (
                  <span className="bg-black/30 px-1 py-0.2 rounded font-semibold">
                    {formatCount(item.count)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};