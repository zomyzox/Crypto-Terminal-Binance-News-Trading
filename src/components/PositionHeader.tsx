import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Position } from '../types';
import { binanceService } from '../services/binanceService';
import { chartSymbolUpdateEvent } from './TradingPanel';

interface PositionHeaderProps {
  positions: Position[];
}

const CLOSE_PERCENTAGES = [10, 25, 50, 75, 100];

export function PositionHeader({ positions }: PositionHeaderProps) {
  const [closingPositions, setClosingPositions] = useState<Set<string>>(new Set());
  const [selectedPercentages, setSelectedPercentages] = useState<Record<string, number>>({});
  const positionHeaderRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Function to update the CSS variable with the actual height
    const updateHeaderHeight = () => {
      if (positionHeaderRef.current) {
        const height = positionHeaderRef.current.offsetHeight;
        document.documentElement.style.setProperty('--position-header-height', `${height}px`);
      }
    };
    
    // Update on mount and whenever positions change
    updateHeaderHeight();
    
    // Also use ResizeObserver to detect height changes
    const resizeObserver = new ResizeObserver(() => {
      updateHeaderHeight();
    });
    
    if (positionHeaderRef.current) {
      resizeObserver.observe(positionHeaderRef.current);
    }
    
    return () => {
      if (positionHeaderRef.current) {
        resizeObserver.disconnect();
      }
      
      // Reset the variable when unmounting
      if (positions.length === 0) {
        document.documentElement.style.setProperty('--position-header-height', '0px');
      }
    };
  }, [positions]);

  const handleClosePosition = async (positionId: string, size?: number) => {
    if (closingPositions.has(positionId)) return;
    
    try {
      setClosingPositions(prev => new Set(prev).add(positionId));
      await binanceService.closePosition(positionId, 'MARKET', undefined, size);
      console.log('Position closed successfully');
    } catch (error) {
      console.error('Failed to close position:', error);
      alert(`Failed to close position: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setClosingPositions(prev => {
        const updated = new Set(prev);
        updated.delete(positionId);
        return updated;
      });
    }
  };

  const handleSymbolClick = (symbol: string) => {
    chartSymbolUpdateEvent.dispatchEvent(
      new CustomEvent('symbolChange', { detail: symbol })
    );
  };

  const handlePercentageSelect = (positionId: string, percentage: number) => {
    setSelectedPercentages(prev => ({
      ...prev,
      [positionId]: percentage
    }));
  };

  const executeClose = (position: Position) => {
    const percentage = selectedPercentages[position.id] || 100;
    const adjustedSize = (position.size * percentage) / 100;
    
    handleClosePosition(
      position.id,
      adjustedSize
    );
  };

  if (positions.length === 0) return null;

  return (
    <div 
      className="bg-binance-black border-t border-binance-gray/30 sticky top-[64px] z-40"
      ref={positionHeaderRef}
    >
      <div className="max-w-7xl mx-auto px-2">
        <div className="overflow-x-auto">
          <div className="min-w-[920px]">
            <div className="flex items-center py-1 border-b border-binance-gray/30 mb-2 text-xs text-gray-400 font-medium">
              <div className="w-[50px] flex-shrink-0 text-center">Position</div>
              <div className="w-[130px] flex-shrink-0 text-center">Symbol</div>
              <div className="w-[80px] flex-shrink-0 text-center">Size USDT</div>
              <div className="w-[100px] flex-shrink-0 text-center">Entry Price</div>
              <div className="w-[100px] flex-shrink-0 text-center">Mark Price</div>
              <div className="w-[120px] flex-shrink-0 text-center">PNL</div>
              <div className="w-[100px] flex-shrink-0 text-center">Liq Price</div>
              <div className="flex-grow text-right pr-4">Actions</div>
            </div>
            
            <div className="max-h-[40vh] overflow-y-auto overflow-x-hidden">
              <div className="flex flex-col gap-1.5 py-1">
                {positions.map(position => (
                  <div 
                    key={position.id}
                    className={`rounded-lg ${
                      position.type === 'long' 
                        ? 'bg-binance-green/10 border border-binance-green/20' 
                        : 'bg-binance-red/10 border border-binance-red/20'
                    }`}
                  >
                    <div className="flex items-center py-1.5">
                      <div className="w-[50px] flex-shrink-0 flex items-center justify-center">
                        <div className="flex items-center bg-binance-black/30 px-1 py-0 rounded-full">
                          <span className="text-xs text-gray-300 w-[28px] text-center">
                            {typeof position.leverage === 'string' && position.leverage.endsWith('x') 
                              ? position.leverage 
                              : `${position.leverage}x`
                            }
                          </span>
                          
                          <div className="ml-1">
                            {position.type === 'long' ? (
                              <TrendingUp className="w-3 h-3 flex-shrink-0 text-binance-green" />
                            ) : (
                              <TrendingDown className="w-3 h-3 flex-shrink-0 text-binance-red" />
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="w-[130px] flex-shrink-0 flex items-center justify-center pl-2">
                        <div className="flex-1 overflow-hidden">
                          <button
                            onClick={() => handleSymbolClick(position.symbol)}
                            className="text-xs font-medium text-white hover:text-binance-yellow truncate w-full text-center"
                            title={position.symbol}
                          >
                            {position.symbol}
                          </button>
                        </div>
                      </div>
                      
                      <div className="w-[80px] flex-shrink-0 flex justify-center">
                        <div className="text-xs text-white">${position.notional.toFixed(2)}</div>
                      </div>
                      
                      <div className="w-[100px] flex-shrink-0 flex justify-center">
                        <div className="text-xs text-white">${position.entryPrice.toFixed(2)}</div>
                      </div>
                      
                      <div className="w-[100px] flex-shrink-0 flex justify-center">
                        <div className="text-xs text-white">${position.markPrice.toFixed(2)}</div>
                      </div>
                      
                      <div className="w-[120px] flex-shrink-0 flex justify-center">
                        <div className={`text-xs font-medium ${
                          position.pnl >= 0 ? 'text-binance-green' : 'text-binance-red'
                        }`}>
                          ${Math.abs(position.pnl).toFixed(2)} ({position.pnlPercentage.toFixed(2)}%)
                        </div>
                      </div>
                      
                      <div className="w-[100px] flex-shrink-0 flex justify-center">
                        <div className="text-xs text-binance-red">${position.liquidationPrice.toFixed(2)}</div>
                      </div>
                      
                      <div className="flex items-center gap-1 ml-auto pr-4">
                        <div className="flex items-center">
                          {CLOSE_PERCENTAGES.map((percentage) => (
                            <button
                              key={percentage}
                              onClick={() => handlePercentageSelect(position.id, percentage)}
                              className={`text-xs px-1 py-0 rounded ${
                                (selectedPercentages[position.id] || 100) === percentage
                                  ? position.type === 'long' 
                                    ? 'bg-binance-green/30 text-white' 
                                    : 'bg-binance-red/30 text-white'
                                  : 'bg-binance-black/30 text-gray-400 hover:text-gray-200'
                              }`}
                            >
                              {percentage}%
                            </button>
                          ))}
                        </div>
                        
                        <button
                          onClick={() => executeClose(position)}
                          disabled={closingPositions.has(position.id)}
                          className={`ml-2 px-2 py-0.5 text-xs rounded font-medium min-w-[60px]
                            bg-binance-yellow text-black hover:bg-binance-yellow/90
                            disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {closingPositions.has(position.id) ? '...' : 'Market'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}