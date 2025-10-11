import React, { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, XCircleIcon, PinIcon } from './Icons';

interface PromptInputProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  promptHistory: string[];
  pinnedPrompts: string[];
  onPinPrompt: (prompt: string) => void;
  onUnpinPrompt: (prompt: string) => void;
  onProcess: () => void;
  isProcessing: boolean;
}

const PromptInput: React.FC<PromptInputProps> = ({ 
  prompt, 
  setPrompt, 
  promptHistory, 
  pinnedPrompts,
  onPinPrompt,
  onUnpinPrompt,
  onProcess, 
  isProcessing 
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);
  
  useEffect(() => {
    if (showHistory) {
      // Focus the search input when the history opens
      searchInputRef.current?.focus();
    } else {
      setSearchTerm(''); // Reset search on close
    }
  }, [showHistory]);

  const handleHistorySelect = (histPrompt: string) => {
    setPrompt(histPrompt);
    setShowHistory(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onProcess();
      }
  };
  
  const handlePinClick = (e: React.MouseEvent, promptToPin: string) => {
    e.stopPropagation();
    onPinPrompt(promptToPin);
  };

  const handleUnpinClick = (e: React.MouseEvent, promptToUnpin: string) => {
    e.stopPropagation();
    onUnpinPrompt(promptToUnpin);
  };

  const filteredHistory = promptHistory
    .filter(p => !pinnedPrompts.includes(p))
    .filter(p => p.toLowerCase().includes(searchTerm.toLowerCase()));

  const hasHistory = promptHistory.length > 0 || pinnedPrompts.length > 0;

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="flex items-stretch">
        <div className="relative flex-grow">
          <textarea
            ref={textareaRef}
            rows={1}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onFocus={() => setShowHistory(true)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., add a party hat and confetti"
            disabled={isProcessing}
            className="w-full p-4 pr-24 text-lg bg-gray-800 border-2 border-gray-700 rounded-l-md focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors disabled:opacity-50 resize-none overflow-y-hidden"
            style={{ minHeight: '64px' }}
            aria-label="Describe your edit"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 space-x-2">
            {prompt && (
                <button
                    onClick={() => setPrompt('')}
                    className="text-gray-500 hover:text-white"
                    aria-label="Clear prompt"
                >
                    <XCircleIcon className="w-6 h-6" />
                </button>
            )}
            {hasHistory && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-gray-400 hover:text-white"
                aria-label="Show prompt history"
              >
                <ChevronDownIcon className={`w-6 h-6 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </div>
        <button
          onClick={onProcess}
          disabled={isProcessing}
          className="p-4 text-lg font-bold text-white bg-brand-blue rounded-r-md hover:bg-blue-500 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center"
          style={{minHeight: '64px'}}
        >
          {isProcessing ? 'Processing...' : 'Go'}
        </button>
      </div>

      {showHistory && hasHistory && (
        <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg flex flex-col">
          <div className="p-2 border-b border-gray-700">
             <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search history..."
              className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {pinnedPrompts.length > 0 && (
              <>
                <li className="px-4 py-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-900/50 sticky top-0">Pinned</li>
                {pinnedPrompts.map((p, index) => (
                  <li
                    key={`pin-${index}`}
                    onClick={() => handleHistorySelect(p)}
                    className="group flex justify-between items-center px-4 py-2 text-gray-300 cursor-pointer hover:bg-gray-700"
                  >
                    <span className="truncate pr-4">{p}</span>
                    <button
                      onClick={(e) => handleUnpinClick(e, p)}
                      title="Unpin prompt"
                      className="opacity-100 text-brand-blue hover:text-white"
                    >
                      <PinIcon isPinned={true} />
                    </button>
                  </li>
                ))}
              </>
            )}

            {filteredHistory.length > 0 && pinnedPrompts.length > 0 && <li className="h-px bg-gray-700 my-1"></li>}

            {filteredHistory.map((histPrompt, index) => (
              <li
                key={index}
                onClick={() => handleHistorySelect(histPrompt)}
                className="group flex justify-between items-center px-4 py-2 text-gray-300 cursor-pointer hover:bg-gray-700"
              >
                <span className="truncate pr-4">{histPrompt}</span>
                <button 
                  onClick={(e) => handlePinClick(e, histPrompt)}
                  title="Pin prompt"
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-brand-blue transition-opacity"
                >
                    <PinIcon/>
                </button>
              </li>
            ))}
             {(filteredHistory.length === 0 && searchTerm) && (
                <li className="px-4 py-3 text-center text-gray-500">No prompts found.</li>
             )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PromptInput;