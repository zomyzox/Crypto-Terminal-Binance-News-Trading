import { useState, useEffect, useCallback } from 'react';
import { binanceService } from '../services/binanceService';

interface MarketData {
  symbol: string;
  price: string;
  priceChangePercent: string;
  previousDayClose?: number;
  newsPriceChange?: string;
}

// Central cache system
const marketDataCache = new Map<string, MarketData>();
const subscriberCountMap = new Map<string, number>();
const previousDayCloseCache = new Map<string, Promise<number>>();
const newsPriceChangeCache = new Map<string, Record<number, Promise<number>>>();

// Simple implementation for event emitter
const listeners = new Map<string, Set<(data: MarketData) => void>>();

function notifyListeners(symbol: string, data: MarketData) {
  const symbolListeners = listeners.get(symbol);
  if (symbolListeners) {
    symbolListeners.forEach(listener => listener(data));
  }
}

async function fetchPreviousDayClose(symbol: string): Promise<number> {
  // Check cache first
  const cachedPromise = previousDayCloseCache.get(symbol);
  if (cachedPromise) {
    return cachedPromise;
  }

  // Get UTC today's start
  const utcToday = new Date();
  utcToday.setUTCHours(0, 0, 0, 0);
  
  // Calculate previous day's timestamp
  const previousDay = new Date(utcToday.getTime() - 24 * 60 * 60 * 1000);
  const endTime = Math.floor(previousDay.getTime());

  const fetchPromise = (async () => {
    try {
      const response = await fetch(
        `https://fapi.binance.com/fapi/v1/klines?interval=1d&endTime=${endTime}&limit=1&symbol=${symbol}`
      );
      const klines = await response.json();
      
      if (!klines || klines.length === 0) {
        throw new Error(`No kline data received for symbol ${symbol}`);
      }
      
      const closePrice = parseFloat(klines[0][4]);
      
      if (isNaN(closePrice)) {
        throw new Error(`Invalid close price data for symbol ${symbol}`);
      }

      return closePrice;
    } catch (error) {
      console.error(`Error fetching previous day close: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  })();

  // Store in cache
  previousDayCloseCache.set(symbol, fetchPromise);

  return fetchPromise;
}

async function fetchNewsReferencePrice(symbol: string, newsTimestamp: number): Promise<number> {
  // Check cache first
  if (!newsPriceChangeCache.has(symbol)) {
    newsPriceChangeCache.set(symbol, {});
  }
  
  const symbolCache = newsPriceChangeCache.get(symbol) || {};
  if (symbolCache[newsTimestamp] !== undefined) {
    return symbolCache[newsTimestamp];
  }
  
  // Get the closing price of the minute at news time
  const endTime = newsTimestamp;
  
  console.log(`[${symbol}] Fetching reference price for news timestamp: ${endTime} (${new Date(endTime).toISOString()})`);
  
  const fetchPromise = (async () => {
    try {
      const url = `https://fapi.binance.com/fapi/v1/klines?interval=1m&endTime=${endTime}&limit=1&symbol=${symbol}`;
      console.log(`[${symbol}] API URL: ${url}`);
      
      const response = await fetch(url);
      const klines = await response.json();
      
      console.log(`[${symbol}] API response:`, klines);
      
      if (!klines || klines.length === 0 || Array.isArray(klines) && klines.length === 0) {
        console.warn(`[${symbol}] No price data found for news time (timestamp: ${endTime})`);
        return 0; // Return 0 to indicate no data
      }
      
      // Check if Binance returned an error
      if (klines.code && klines.msg) {
        console.error(`[${symbol}] Binance API error:`, klines.msg);
        return 0;
      }
      
      const closePrice = parseFloat(klines[0][4]);
      
      if (isNaN(closePrice)) {
        console.warn(`[${symbol}] Invalid close price data:`, klines[0][4]);
        return 0;
      }
      
      console.log(`[${symbol}] News reference price: ${closePrice}`);
      return closePrice;
    } catch (error) {
      console.error(`[${symbol}] Error fetching news reference price:`, error);
      return 0;
    }
  })();
  
  // Store in cache
  symbolCache[newsTimestamp] = fetchPromise;
  newsPriceChangeCache.set(symbol, symbolCache);
  
  return fetchPromise;
}

function subscribeToSymbol(symbol: string) {
  const currentCount = subscriberCountMap.get(symbol) || 0;
  subscriberCountMap.set(symbol, currentCount + 1);

  // Only establish WebSocket connection on first subscription
  if (currentCount === 0) {
    binanceService.subscribeToMarketData(symbol, (data) => {
      marketDataCache.set(symbol, data);
      notifyListeners(symbol, data);
    });
  }

  return () => {
    const newCount = (subscriberCountMap.get(symbol) || 1) - 1;
    subscriberCountMap.set(symbol, newCount);

    // Close WebSocket connection when last subscriber unsubscribes
    if (newCount === 0) {
      subscriberCountMap.delete(symbol);
      marketDataCache.delete(symbol);
      binanceService.unsubscribeFromMarketData(symbol, () => {});
    }
  };
}

export function useMarketData(symbol: string, newsTimestamp?: number): MarketData | null {
  const [marketData, setMarketData] = useState<MarketData | null>(() => 
    marketDataCache.get(symbol) || null
  );
  const [previousClose, setPreviousClose] = useState<number | null>(null);
  const [newsReferencePrice, setNewsReferencePrice] = useState<number | null>(null);

  // Fetch previous day's close price
  useEffect(() => {
    fetchPreviousDayClose(symbol)
      .then(closePrice => setPreviousClose(closePrice))
      .catch(error => console.error('Failed to fetch previous close:', error));
  }, [symbol]);

  // Fetch news reference price if needed
  useEffect(() => {
    if (newsTimestamp && symbol) {
      fetchNewsReferencePrice(symbol, newsTimestamp)
        .then(refPrice => {
          if (refPrice > 0) {
            setNewsReferencePrice(refPrice);
          }
        })
        .catch(error => console.error('Failed to fetch news reference price:', error));
    }
  }, [symbol, newsTimestamp]);

  const calculatePriceChange = useCallback((currentPrice: string): string => {
    if (!previousClose || !currentPrice) return '0.00';
    
    const current = parseFloat(currentPrice);
    const change = ((current - previousClose) / previousClose) * 100;
    return change.toFixed(2);
  }, [previousClose]);

  const calculateNewsPriceChange = useCallback((currentPrice: string): string => {
    if (!newsReferencePrice || !currentPrice) return '0.00';
    
    const current = parseFloat(currentPrice);
    const change = ((current - newsReferencePrice) / newsReferencePrice) * 100;
    return change.toFixed(2);
  }, [newsReferencePrice]);

  useEffect(() => {
    if (!symbol) return;

    // Register listener
    const listener = (data: MarketData) => {
      const priceChangePercent = calculatePriceChange(data.price);
      
      // Calculate news price change if we have a reference price
      const newsPriceChange = newsReferencePrice ? calculateNewsPriceChange(data.price) : undefined;
      
      const updatedData = {
        ...data,
        priceChangePercent,
        previousDayClose: previousClose || undefined,
        newsPriceChange: newsPriceChange
      };
      setMarketData(updatedData);
    };

    // Add listener
    if (!listeners.has(symbol)) {
      listeners.set(symbol, new Set());
    }
    listeners.get(symbol)?.add(listener);

    // Subscribe to the symbol
    const unsubscribe = subscribeToSymbol(symbol);

    // Show cached data immediately if available
    const cachedData = marketDataCache.get(symbol);
    if (cachedData) {
      listener(cachedData);
    }

    // Cleanup
    return () => {
      // Remove listener
      listeners.get(symbol)?.delete(listener);
      if (listeners.get(symbol)?.size === 0) {
        listeners.delete(symbol);
      }
      
      unsubscribe();
      setMarketData(null);
    };
  }, [symbol, calculatePriceChange, calculateNewsPriceChange, previousClose, newsReferencePrice]);

  return marketData;
}