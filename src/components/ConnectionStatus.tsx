import { useEffect, useState, useRef } from 'react';
import { Wifi, WifiOff, BookOpen, Rss } from 'lucide-react';
import { binanceService } from '../services/binanceService';
import { useSettings } from '../context/SettingsContext';
import { newsService } from '../services/newsService';

export function ConnectionStatus() {
  const [binanceStatus, setBinanceStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [newsStatus, setNewsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const lastResponseTime = useRef<number>(0);
  const { apiKey, apiSecret } = useSettings();
  
  useEffect(() => {
    // Monitor Binance WebSocket connection status
    const unsubscribe = binanceService.onConnectionStatusChange(setBinanceStatus);
    
    // Set up a heartbeat check to verify actual active communication
    const heartbeatInterval = setInterval(() => {
      const now = Date.now();
      // If we haven't received a response in 10 seconds, consider disconnected
      if (lastResponseTime.current && now - lastResponseTime.current > 10000) {
        setBinanceStatus('disconnected');
      }
    }, 2000);
    
    return () => {
      unsubscribe();
      clearInterval(heartbeatInterval);
    };
  }, []);

  useEffect(() => {
    // Track successful API responses to confirm connection is working
    const unsubscribe = binanceService.onBalanceUpdate((balances) => {
      if (balances) {
        lastResponseTime.current = Date.now();
        setBinanceStatus('connected');
      }
    });
    
    return unsubscribe;
  }, []);
  
  // When credentials change, update connection status
  useEffect(() => {
    if (apiKey && apiSecret) {
      setBinanceStatus('connecting');
      binanceService.fetchBalance()
        .then(() => {
          lastResponseTime.current = Date.now();
          setBinanceStatus('connected');
        })
        .catch(() => {
          setBinanceStatus('disconnected');
        });
    } else {
      setBinanceStatus('disconnected');
    }
  }, [apiKey, apiSecret]);

  // Monitor News WebSocket connection status
  useEffect(() => {
    // Regularly check news service connection status
    const interval = setInterval(() => {
      setNewsStatus(newsService.getConnectionStatus());
    }, 2000);
    
    // Initial status check
    setNewsStatus(newsService.getConnectionStatus());
    
    return () => clearInterval(interval);
  }, []);

  const hasCredentials = !!(apiKey && apiSecret);

  return (
    <div className="bg-binance-black/80 backdrop-blur-sm rounded-full py-1.5 px-3 flex items-center gap-2 border border-binance-lightgray/20">
      {/* Binance WebSocket Status */}
      <div className="flex items-center gap-1">
        {binanceStatus === 'connected' ? (
          <div className="relative">
            <Wifi className="h-4 w-4 text-binance-green" />
            <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-binance-green animate-pulse"></span>
          </div>
        ) : binanceStatus === 'connecting' ? (
          <Wifi className="h-4 w-4 text-binance-yellow animate-pulse" />
        ) : (
          <WifiOff className="h-4 w-4 text-binance-red" />
        )}
        <span className={`text-xs font-medium ${
          binanceStatus === 'connected' 
            ? 'text-binance-green' 
            : binanceStatus === 'connecting' 
              ? 'text-binance-yellow' 
              : 'text-binance-red'
        }`}>
          {binanceStatus === 'connected' 
            ? 'Binance' 
            : binanceStatus === 'connecting' 
              ? 'Binance...' 
              : 'Binance'
          }
        </span>
      </div>
      
      {/* News WebSocket Status */}
      <div className="flex items-center gap-1">
        {newsStatus === 'connected' ? (
          <div className="relative">
            <Rss className="h-4 w-4 text-binance-green" />
            <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-binance-green animate-pulse"></span>
          </div>
        ) : newsStatus === 'connecting' ? (
          <Rss className="h-4 w-4 text-binance-yellow animate-pulse" />
        ) : (
          <Rss className="h-4 w-4 text-binance-red" />
        )}
        <span className={`text-xs font-medium ${
          newsStatus === 'connected' 
            ? 'text-binance-green' 
            : newsStatus === 'connecting' 
              ? 'text-binance-yellow' 
              : 'text-binance-red'
        }`}>
          {newsStatus === 'connected' 
            ? 'News' 
            : newsStatus === 'connecting' 
              ? 'News...' 
              : 'News'
          }
        </span>
      </div>
    </div>
  );
}