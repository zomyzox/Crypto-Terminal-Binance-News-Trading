import { useEffect, useState, useRef } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';

interface SpotlightProps {
  onSearch: (query: string) => void;
  onClose: () => void;
  initialValue?: string;
}

export function Spotlight({ onSearch, onClose, initialValue = '' }: SpotlightProps) {
  const [query, setQuery] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus();

    // Handle escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      const processedQuery = query.trim().toUpperCase();
      onSearch(processedQuery);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Spotlight container */}
      <div className="relative w-full max-w-2xl mx-4">
        <div className="bg-binance-darkgray rounded-xl shadow-lg border border-binance-lightgray/20 overflow-hidden">
          <div className="flex items-center px-4 py-3 border-b border-binance-lightgray/20">
            <Search className="w-5 h-5 text-binance-yellow mr-3" />
            <input
              ref={inputRef}
              id="spotlight-input"
              type="text"
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Search or trade... (e.g. BTC, LONG BTC 1K)"
              className="w-full bg-transparent text-white placeholder-gray-500 focus:outline-none"
            />
            <CornerDownLeft className="w-5 h-5 text-binance-yellow ml-3" />
          </div>
          <div className="px-4 py-2 text-sm text-gray-400">
            Type to search. For trading use "LONG BTC 1K" format. ESC to close.
          </div>
        </div>
      </div>
    </div>
  );
} 