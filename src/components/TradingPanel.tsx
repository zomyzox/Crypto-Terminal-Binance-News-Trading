import { useState, useEffect } from 'react';
import { binanceService } from '../services/binanceService';
import { websocketConfig } from '../config/websocket';
import { TradingViewWidget } from './TradingViewWidget';
import { useSettings } from '../context/SettingsContext';

// Create a global event for updating the chart symbol
export const chartSymbolUpdateEvent = new EventTarget();

export function TradingPanel() {
  const { apiKey } = useSettings();
  const [balance, setBalance] = useState<string>('0.00');
  const [chartSymbol, setChartSymbol] = useState<string>("BINANCE:BTCUSDT.P");

  // Listen for symbol change events
  useEffect(() => {
    const handleSymbolChange = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail) {
        const symbol = customEvent.detail;
        // Format symbol for TradingView (add BINANCE: prefix and .P suffix)
        setChartSymbol(`BINANCE:${symbol}.P`);
      }
    };

    chartSymbolUpdateEvent.addEventListener('symbolChange', handleSymbolChange);
    
    return () => {
      chartSymbolUpdateEvent.removeEventListener('symbolChange', handleSymbolChange);
    };
  }, []);

  // Fetch balance every 5 seconds only if API key exists
  useEffect(() => {
    if (!apiKey) return;

    const unsubscribe = binanceService.onBalanceUpdate((balances) => {
      if (Array.isArray(balances)) {
        const usdtBalance = balances.find(b => b.asset === 'USDT');
        if (usdtBalance && usdtBalance.availableBalance) {
          setBalance(parseFloat(usdtBalance.availableBalance).toFixed(2));
          console.log('Updated USDT balance:', usdtBalance.availableBalance);
        }
      }
    });

    // Set up periodic balance updates
    const balanceInterval = setInterval(() => {
      binanceService.fetchBalance();
    }, websocketConfig.intervals.balance);

    return () => {
      unsubscribe();
      clearInterval(balanceInterval);
    };
  }, [apiKey]);

  return (
    <div className="space-y-4">
      {/* Chart Modal - Always shown at the top */}
      <div className="backdrop-blur-xl bg-white/30 dark:bg-black/30 rounded-xl p-4 pr-4 border border-white/20 dark:border-white/10 relative z-30">
        <TradingViewWidget symbol={chartSymbol} />
      </div>
      
      {/* Account Balance Section - Only show if API key exists */}
      {apiKey && (
        <div className="backdrop-blur-xl bg-white/30 dark:bg-black/30 rounded-xl p-4 border border-white/20 dark:border-white/10 relative z-30">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Account</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Available Balance:</span>
              <span className="text-lg font-bold text-gray-800 dark:text-gray-200">{balance} USDT</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}