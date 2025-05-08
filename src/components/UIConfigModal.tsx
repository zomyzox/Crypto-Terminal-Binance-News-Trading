import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react'; 
import { useSettings } from '../context/SettingsContext';

interface UIConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UIConfigModal({
  isOpen,
  onClose
}: UIConfigModalProps) {
  const { priceChangeMode, setPriceChangeMode } = useSettings();
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);

  // Create portal element on mount
  useEffect(() => {
    // Find or create modal root element
    let element = document.getElementById('modal-root');
    if (!element) {
      element = document.createElement('div');
      element.id = 'modal-root';
      document.body.appendChild(element);
    }
    setPortalElement(element);

    // Clean up on unmount
    return () => {
      if (element && element.parentNode && element.childNodes.length === 0) {
        element.parentNode.removeChild(element);
      }
    };
  }, []);

  // Handle body scroll locking
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !portalElement) return null;

  // Use a portal to render modal outside of normal DOM hierarchy
  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/50 backdrop-blur-md"
    >
      <div 
        className="fixed inset-0" 
        onClick={onClose}
        aria-hidden="true"
      />
      
      <div className="relative w-full max-w-md mx-auto p-2">
        <div 
          className="relative bg-gradient-to-br from-binance-darkgray to-binance-black rounded-xl shadow-binance-card border border-binance-lightgray/20 z-[10000] overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-3 border-b border-binance-lightgray/20">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">UI Configuration</h2>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-binance-gray transition-colors"
              >
                <X className="h-4 w-4 text-gray-400 hover:text-white" />
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-4">
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Price Change</h3>
              <div className="flex items-center gap-3 bg-binance-gray p-2 rounded-lg">
                <button
                  onClick={() => setPriceChangeMode('day-close')}
                  className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                    priceChangeMode === 'day-close'
                      ? 'bg-binance-yellow text-binance-black'
                      : 'bg-binance-darkgray text-gray-300 hover:bg-binance-lightgray'
                  }`}
                >
                  Day Close
                </button>
                <button
                  onClick={() => setPriceChangeMode('news-time')}
                  className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                    priceChangeMode === 'news-time'
                      ? 'bg-binance-yellow text-binance-black'
                      : 'bg-binance-darkgray text-gray-300 hover:bg-binance-lightgray'
                  }`}
                >
                  News Time
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2 italic">
                {priceChangeMode === 'day-close' 
                  ? 'Shows price change from the daily closing price.' 
                  : 'Shows price change from the timestamp of the news.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    portalElement
  );
} 