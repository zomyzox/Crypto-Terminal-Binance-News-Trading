import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Edit } from 'lucide-react'; 
import { useSettings, getSymbolTradeButtons } from '../context/SettingsContext';
import type { LeverageBracket } from '../types';
import { binanceService } from '../services/binanceService';

interface TradingConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  leverageBrackets: LeverageBracket[];
  selectedLeverages: Record<string, number>;
  onLeverageSelect: (symbol: string, leverage: number) => void;
}

export function TradingConfigModal({
  isOpen,
  onClose,
  leverageBrackets,
  selectedLeverages,
  onLeverageSelect
}: TradingConfigModalProps) {
  const { 
    positionMode, 
    setPositionMode, 
    tradeButtons, 
    globalTradeButtons,
    setSymbolTradeButtons,
    updateGlobalTradeButtons 
  } = useSettings();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [portalElement, setPortalElement] = React.useState<HTMLElement | null>(null);
  const [isUpdatingMode, setIsUpdatingMode] = React.useState(false);
  const [isUpdatingMargin, setIsUpdatingMargin] = React.useState<string | null>(null);
  const [marginTypes, setMarginTypes] = React.useState<Map<string, 'ISOLATED' | 'CROSSED'>>(new Map());
  
  // State for trade button editing
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [tempLongButtons, setTempLongButtons] = useState<string[]>([]);
  const [tempShortButtons, setTempShortButtons] = useState<string[]>([]);
  
  // State for global trade button editing
  const [isEditingGlobalButtons, setIsEditingGlobalButtons] = useState(false);
  const [globalLongButtons, setGlobalLongButtons] = useState<string[]>([...globalTradeButtons.long]);
  const [globalShortButtons, setGlobalShortButtons] = useState<string[]>([...globalTradeButtons.short]);

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

  // Subscribe to margin type updates
  useEffect(() => {
    const unsubscribe = binanceService.onMarginTypeUpdate((marginTypeMap) => {
      setMarginTypes(marginTypeMap);
    });
    
    return () => unsubscribe();
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

  const handlePositionModeChange = async (mode: 'one-way' | 'hedge') => {
    try {
      setIsUpdatingMode(true);
      await binanceService.updatePositionMode(mode);
      setPositionMode(mode);
    } catch (error: unknown) {
      console.error('Failed to update position mode:', error);
      
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      alert(`Failed to update position mode: ${errorMessage}`);
    } finally {
      setIsUpdatingMode(false);
    }
  };

  const handleMarginTypeChange = async (symbol: string, marginType: 'ISOLATED' | 'CROSSED') => {
    try {
      setIsUpdatingMargin(symbol);
      await binanceService.updateMarginType(symbol, marginType);
      // The margin type will be updated via the subscription
    } catch (error: unknown) {
      console.error(`Failed to update margin type for ${symbol}:`, error);
      
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      alert(`Failed to update margin type: ${errorMessage}`);
    } finally {
      setIsUpdatingMargin(null);
    }
  };

  const filteredBrackets = leverageBrackets.filter(bracket =>
    bracket.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateMaxPosition = (_symbol: string, leverage: number, brackets: LeverageBracket['brackets']) => {
    const sortedBrackets = [...brackets].sort((a, b) => b.initialLeverage - a.initialLeverage);
    
    // Handle the case where leverage is higher than or equal to the highest bracket
    if (leverage >= sortedBrackets[0].initialLeverage) {
      return sortedBrackets[0].notionalCap;
    }
    
    // Handle the case where leverage is lower than or equal to the lowest bracket
    const lowestBracket = sortedBrackets[sortedBrackets.length - 1];
    if (leverage <= lowestBracket.initialLeverage) {
      return lowestBracket.notionalCap >= 9223372036854775000 ? 'Unlimited' : lowestBracket.notionalCap;
    }
    
    // Handle intermediate values
    for (let i = 0; i < sortedBrackets.length - 1; i++) {
      const currentBracket = sortedBrackets[i];
      const nextBracket = sortedBrackets[i + 1];
      
      if (leverage <= currentBracket.initialLeverage && leverage > nextBracket.initialLeverage) {
        return currentBracket.notionalCap;
      }
    }

    // Fallback (should never reach here)
    return sortedBrackets[0].notionalCap;
  };
  
  const handleSliderChange = (symbol: string, value: number, _brackets: LeverageBracket['brackets']) => {
    onLeverageSelect(symbol, value);
  };

  // Start editing trade buttons for a symbol
  const startEditTradeButtons = (symbol: string) => {
    const symbolButtons = getSymbolTradeButtons(tradeButtons, globalTradeButtons, symbol);
    setTempLongButtons([...symbolButtons.long]);
    setTempShortButtons([...symbolButtons.short]);
    setEditingSymbol(symbol);
  };

  // Save edited trade buttons
  const saveTradeButtons = () => {
    if (editingSymbol) {
      setSymbolTradeButtons(editingSymbol, {
        long: tempLongButtons,
        short: tempShortButtons
      });
      setEditingSymbol(null);
    }
  };

  // Cancel editing
  const cancelEditTradeButtons = () => {
    setEditingSymbol(null);
  };

  // Handle trade button value change
  const handleTradeButtonChange = (
    type: 'long' | 'short', 
    index: number, 
    value: string
  ) => {
    if (type === 'long') {
      const newButtons = [...tempLongButtons];
      newButtons[index] = value;
      setTempLongButtons(newButtons);
    } else {
      const newButtons = [...tempShortButtons];
      newButtons[index] = value;
      setTempShortButtons(newButtons);
    }
  };

  // Add a new button value
  const addTradeButton = (type: 'long' | 'short') => {
    if (type === 'long') {
      setTempLongButtons([...tempLongButtons, '']);
    } else {
      setTempShortButtons([...tempShortButtons, '']);
    }
  };

  // Remove a button value
  const removeTradeButton = (type: 'long' | 'short', index: number) => {
    if (type === 'long') {
      const newButtons = [...tempLongButtons];
      newButtons.splice(index, 1);
      setTempLongButtons(newButtons);
    } else {
      const newButtons = [...tempShortButtons];
      newButtons.splice(index, 1);
      setTempShortButtons(newButtons);
    }
  };

  // Start editing global trade buttons
  const startEditGlobalButtons = () => {
    setGlobalLongButtons([...globalTradeButtons.long]);
    setGlobalShortButtons([...globalTradeButtons.short]);
    setIsEditingGlobalButtons(true);
  };
  
  // Save global trade buttons
  const saveGlobalButtons = () => {
    updateGlobalTradeButtons({
      long: globalLongButtons,
      short: globalShortButtons
    });
    setIsEditingGlobalButtons(false);
  };
  
  // Cancel editing global buttons
  const cancelGlobalButtons = () => {
    setGlobalLongButtons([...globalTradeButtons.long]);
    setGlobalShortButtons([...globalTradeButtons.short]);
    setIsEditingGlobalButtons(false);
  };
  
  // Handle global trade button value change
  const handleGlobalButtonChange = (
    type: 'long' | 'short', 
    index: number, 
    value: string
  ) => {
    if (type === 'long') {
      const newButtons = [...globalLongButtons];
      newButtons[index] = value;
      setGlobalLongButtons(newButtons);
    } else {
      const newButtons = [...globalShortButtons];
      newButtons[index] = value;
      setGlobalShortButtons(newButtons);
    }
  };

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
          {/* Header - More compact */}
          <div className="p-3 border-b border-binance-lightgray/20">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Trading Config</h2>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-binance-gray transition-colors"
              >
                <X className="h-4 w-4 text-gray-400 hover:text-white" />
              </button>
            </div>
          </div>

          {/* Position Mode - More compact */}
          <div className="p-3 border-b border-binance-lightgray/20">
            <h3 className="text-xs font-medium text-gray-400 mb-1">Position Mode</h3>
            <div className="flex gap-2">
              <button
                onClick={() => handlePositionModeChange('one-way')}
                disabled={isUpdatingMode}
                className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  positionMode === 'one-way'
                    ? 'bg-binance-yellow text-binance-black'
                    : 'bg-binance-gray text-gray-300 hover:bg-binance-lightgray'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isUpdatingMode ? '...' : 'One-way'}
              </button>
              <button
                onClick={() => handlePositionModeChange('hedge')}
                disabled={isUpdatingMode}
                className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  positionMode === 'hedge'
                    ? 'bg-binance-yellow text-binance-black'
                    : 'bg-binance-gray text-gray-300 hover:bg-binance-lightgray'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isUpdatingMode ? '...' : 'Hedge'}
              </button>
            </div>
            
            {/* Global Trade Buttons Section */}
            <div className="mt-3 pt-3 border-t border-gray-700">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-medium text-gray-400">Trade Buttons</h3>
                {!isEditingGlobalButtons && (
                  <button
                    onClick={startEditGlobalButtons}
                    className="px-2 py-1 text-xs rounded bg-binance-gray text-gray-300 hover:bg-binance-lightgray flex items-center gap-1"
                  >
                    <Edit size={12} />
                    <span>Edit</span>
                  </button>
                )}
              </div>
              
              {isEditingGlobalButtons ? (
                <div>
                  {/* Editing mode for global buttons */}
                  <div className="mb-2">
                    <span className="text-xs text-green-500 font-medium">Long Buttons:</span>
                    <div className="flex gap-2 mt-1">
                      {globalLongButtons.map((value, index) => (
                        <div key={`global-long-${index}`} className="flex-1">
                          <input
                            value={value}
                            onChange={(e) => handleGlobalButtonChange('long', index, e.target.value)}
                            className="w-full px-2 py-1 text-xs rounded bg-gray-700 border border-gray-600 text-white"
                            placeholder="10K"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="mb-2">
                    <span className="text-xs text-red-500 font-medium">Short Buttons:</span>
                    <div className="flex gap-2 mt-1">
                      {globalShortButtons.map((value, index) => (
                        <div key={`global-short-${index}`} className="flex-1">
                          <input
                            value={value}
                            onChange={(e) => handleGlobalButtonChange('short', index, e.target.value)}
                            className="w-full px-2 py-1 text-xs rounded bg-gray-700 border border-gray-600 text-white"
                            placeholder="10K"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={cancelGlobalButtons}
                      className="px-2 py-1 text-xs rounded bg-gray-600 text-gray-300 hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveGlobalButtons}
                      className="px-2 py-1 text-xs rounded bg-binance-yellow text-binance-black hover:bg-binance-yellow/90"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {/* Display mode for global buttons */}
                  <div className="flex justify-between gap-2 text-xs">
                    <div className="flex-1">
                      <span className="text-green-500 font-medium">Long:</span>
                      <div className="flex gap-1 mt-1">
                        {globalTradeButtons.long.map((value, index) => (
                          <span 
                            key={`global-long-display-${index}`}
                            className="bg-green-500/20 border border-green-500/30 text-green-400 px-2 py-1 rounded flex-1 text-center"
                          >
                            {value}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1">
                      <span className="text-red-500 font-medium">Short:</span>
                      <div className="flex gap-1 mt-1">
                        {globalTradeButtons.short.map((value, index) => (
                          <span 
                            key={`global-short-display-${index}`}
                            className="bg-red-500/20 border border-red-500/30 text-red-400 px-2 py-1 rounded flex-1 text-center"
                          >
                            {value}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="mt-2 text-xs text-gray-400 italic">
                All Symbols
              </div>
            </div>
          </div>

          {/* Search - More compact */}
          <div className="p-2 border-b border-gray-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg bg-gray-700 border border-gray-600 text-gray-200 focus:outline-none"
              />
            </div>
          </div>

          {/* Content - More compact */}
          <div className="max-h-[300px] overflow-y-auto binance-scrollbar">
            <div className="divide-y divide-gray-700">
              {filteredBrackets.map((bracket) => (
                <div key={bracket.symbol} className="p-2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-200">{bracket.symbol}</span>
                    
                    {/* Margin Type - Compact horizontal buttons */}
                    <div className="flex gap-1 text-xs">
                      <button
                        onClick={() => handleMarginTypeChange(bracket.symbol, 'CROSSED')}
                        disabled={isUpdatingMargin === bracket.symbol}
                        className={`px-2 py-1 rounded ${
                          marginTypes.get(bracket.symbol) === 'CROSSED' || !marginTypes.get(bracket.symbol)
                            ? 'bg-binance-yellow text-binance-black'
                            : 'bg-binance-gray text-gray-400'
                        }`}
                      >
                        Cross
                      </button>
                      <button
                        onClick={() => handleMarginTypeChange(bracket.symbol, 'ISOLATED')}
                        disabled={isUpdatingMargin === bracket.symbol}
                        className={`px-2 py-1 rounded ${
                          marginTypes.get(bracket.symbol) === 'ISOLATED'
                            ? 'bg-binance-yellow text-binance-black'
                            : 'bg-binance-gray text-gray-400'
                        }`}
                      >
                        Isolated
                      </button>
                    </div>
                  </div>
                  
                  {/* Leverage Setting - Compact */}
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={() => {
                        const currentLeverage = selectedLeverages[bracket.symbol] || bracket.brackets[0].initialLeverage;
                        const minLeverage = Math.min(...bracket.brackets.map(b => b.initialLeverage));
                        if (currentLeverage > minLeverage) {
                          handleSliderChange(bracket.symbol, currentLeverage - 1, bracket.brackets);
                        }
                      }}
                      className="w-5 h-5 flex items-center justify-center rounded bg-gray-600 text-gray-200"
                    >
                      -
                    </button>
                    
                    <input
                      type="range"
                      min={Math.min(...bracket.brackets.map(b => b.initialLeverage))}
                      max={Math.max(...bracket.brackets.map(b => b.initialLeverage))}
                      value={selectedLeverages[bracket.symbol] || bracket.brackets[0].initialLeverage}
                      step="1"
                      onChange={(e) => handleSliderChange(bracket.symbol, parseInt(e.target.value), bracket.brackets)}
                      className="flex-1 h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                    
                    <button
                      onClick={() => {
                        const currentLeverage = selectedLeverages[bracket.symbol] || bracket.brackets[0].initialLeverage;
                        const maxLeverage = Math.max(...bracket.brackets.map(b => b.initialLeverage));
                        if (currentLeverage < maxLeverage) {
                          handleSliderChange(bracket.symbol, currentLeverage + 1, bracket.brackets);
                        }
                      }}
                      className="w-5 h-5 flex items-center justify-center rounded bg-gray-600 text-gray-200"
                    >
                      +
                    </button>
                    
                    <span className="text-sm font-bold text-white min-w-[2rem] text-center">
                      {selectedLeverages[bracket.symbol] || bracket.brackets[0].initialLeverage}x
                    </span>
                  </div>
                  
                  {/* Maximum position and Confirmation button - Compact inline */}
                  <div className="flex justify-between items-center mt-1 text-xs">
                    <span className="text-binance-yellow">
                      Max: {(() => {
                        const currentLeverage = selectedLeverages[bracket.symbol] || bracket.brackets[0].initialLeverage;
                        const maxPosition = calculateMaxPosition(bracket.symbol, currentLeverage, bracket.brackets);
                        return maxPosition === 'Unlimited' ? '∞' : `${(maxPosition/1000).toFixed(0)}K`;
                      })()}
                    </span>
                    
                    <button
                      className="px-2 py-1 rounded bg-binance-yellow hover:bg-binance-yellow/90 text-binance-black"
                      onClick={() => {
                        const currentLeverage = selectedLeverages[bracket.symbol] || bracket.brackets[0].initialLeverage;
                        binanceService.updateLeverage(bracket.symbol, currentLeverage);
                      }}
                    >
                      Confirm
                    </button>
                  </div>
                  
                  {/* Trade Buttons Editing Section */}
                  <div className="mt-3 border-t border-gray-700 pt-2">
                    {editingSymbol === bracket.symbol ? (
                      <div>
                        {/* Edit Mode */}
                        <div className="mb-2">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-gray-400 font-medium">Long Buttons</span>
                            <button
                              onClick={() => addTradeButton('long')}
                              className="text-xs bg-binance-gray hover:bg-binance-lightgray text-white px-2 py-0.5 rounded"
                            >
                              + Add
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {tempLongButtons.map((button, index) => (
                              <div key={`long-${index}`} className="flex items-center">
                                <input
                                  value={button}
                                  onChange={(e) => handleTradeButtonChange('long', index, e.target.value)}
                                  className="w-14 px-2 py-1 text-xs rounded bg-gray-700 border border-gray-600 text-white"
                                  placeholder="10K"
                                />
                                <button
                                  onClick={() => removeTradeButton('long', index)}
                                  className="ml-1 text-red-400 hover:text-red-300"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="mb-2">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-gray-400 font-medium">Short Buttons</span>
                            <button
                              onClick={() => addTradeButton('short')}
                              className="text-xs bg-binance-gray hover:bg-binance-lightgray text-white px-2 py-0.5 rounded"
                            >
                              + Add
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {tempShortButtons.map((button, index) => (
                              <div key={`short-${index}`} className="flex items-center">
                                <input
                                  value={button}
                                  onChange={(e) => handleTradeButtonChange('short', index, e.target.value)}
                                  className="w-14 px-2 py-1 text-xs rounded bg-gray-700 border border-gray-600 text-white"
                                  placeholder="10K"
                                />
                                <button
                                  onClick={() => removeTradeButton('short', index)}
                                  className="ml-1 text-red-400 hover:text-red-300"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="flex justify-end gap-2 mt-2">
                          <button
                            onClick={cancelEditTradeButtons}
                            className="px-2 py-1 text-xs rounded bg-gray-600 text-gray-300 hover:bg-gray-500"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveTradeButtons}
                            className="px-2 py-1 text-xs rounded bg-binance-yellow text-binance-black hover:bg-binance-yellow/90"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {/* Display Mode */}
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <span className="text-xs text-gray-400 font-medium">Trade Buttons:</span>
                            </div>
                            <div className="flex gap-2">
                              <div>
                                <span className="text-xs text-green-500">L:</span>
                                <span className="text-xs text-gray-300 ml-1">
                                  {getSymbolTradeButtons(tradeButtons, globalTradeButtons, bracket.symbol).long.join(', ')}
                                </span>
                              </div>
                              <div>
                                <span className="text-xs text-red-500">S:</span>
                                <span className="text-xs text-gray-300 ml-1">
                                  {getSymbolTradeButtons(tradeButtons, globalTradeButtons, bracket.symbol).short.join(', ')}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => startEditTradeButtons(bracket.symbol)}
                            className="p-1.5 rounded bg-binance-gray text-gray-300 hover:bg-binance-lightgray"
                          >
                            <Edit size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    portalElement
  );
}