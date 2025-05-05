import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';
import { websocketConfig } from '../config/websocket';
import type { Position } from '../types';

// Add NodeJS namespace
declare global {
  namespace NodeJS {
    interface Timeout {}
    interface Timer {}
  }

  interface Window {
    setTimeout: (callback: () => void, ms?: number) => number;
    setInterval: (callback: () => void, ms?: number) => number;
    clearTimeout: (timeoutId: number) => void;
    clearInterval: (intervalId: number) => void;
    toastEvent: EventTarget;
  }
}

interface OrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  positionMode: 'one-way' | 'hedge';
  type: 'LIMIT' | 'MARKET';
  leverage: string;
  price?: string;
}

// Define the LeverageBracket interface
interface LeverageBracket {
  symbol: string;
  brackets: Array<{
    bracket: number;
    initialLeverage: number;
    notionalCap: number;
    notionalFloor: number;
    maintMarginRatio: number;
    cum: number;
  }>;
}

// Create a custom event for toast notifications
const toastEvent = new EventTarget();

// Add toastEvent to global window object
if (typeof window !== 'undefined') {
  window.toastEvent = toastEvent;
}

// Helper function to show toast messages
function showToast(message: string, type: 'error' | 'success' | 'warning' = 'error') {
  if (typeof window !== 'undefined' && window.toastEvent) {
    window.toastEvent.dispatchEvent(
      new CustomEvent('showToast', { detail: { message, type } })
    );
  }
}

class BinanceService {
  private apiKey: string = '';
  private apiSecret: string = '';
  private network: 'testnet' | 'mainnet' = 'mainnet';
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, (response: any) => void> = new Map();
  private balanceHandlers: ((balances: any[]) => void)[] = [];
  private positionHandlers: ((positions: Position[]) => void)[] = [];
  private positionMap: Map<string, Position> = new Map();
  private marketDataWs: WebSocket | null = null;
  private subscribedSymbols: Set<string> = new Set();
  private marketPrices: Map<string, number> = new Map();
  private symbolInfo: Map<string, any> = new Map();
  private marketDataHandlers: Map<string, Set<(data: any) => void>> = new Map();
  private isReconnecting = false;
  private reconnectTimeout: number | null = null;
  private retryCount = 0;
  private lastHeartbeat = 0;
  private heartbeatInterval: number | null = null;
  private priceUpdateIntervals: Map<string, number> = new Map();
  private messageQueue: Map<string, number> = new Map();
  private lastRequestTime: Map<string, number> = new Map();
  private connectionStatusHandlers: ((status: 'connecting' | 'connected' | 'disconnected') => void)[] = [];
  private currentStatus: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
  private exchangeInfo: any = null;
  private positionModeHandlers: ((mode: 'one-way' | 'hedge') => void)[] = [];
  private isClosingAllPositions = false;
  private leverageBrackets: Map<string, LeverageBracket> = new Map();
  private leverageBracketHandlers: ((brackets: LeverageBracket[]) => void)[] = [];
  private marginTypeMap: Map<string, 'ISOLATED' | 'CROSSED'> = new Map();
  private marginTypeHandlers: ((marginTypes: Map<string, 'ISOLATED' | 'CROSSED'>) => void)[] = [];
  private positionUpdateInterval: number | null = null;

  constructor() {
    this.fetchExchangeInfo().catch(error => {
      console.error('Failed to fetch initial exchange info:', error);
    });
  }

  async updateMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED'): Promise<void> {
    if (!this.hasCredentials()) {
      throw new Error('Please configure your API credentials');
    }

    const timestamp = Date.now();
    const params = new URLSearchParams();
    params.append('symbol', symbol);
    params.append('marginType', marginType);
    params.append('timestamp', timestamp.toString());
    params.append('recvWindow', websocketConfig.settings.recvWindow);
    
    // Create the query string for signature
    const queryString = params.toString();
    
    // Generate signature
    const signature = CryptoJS.HmacSHA256(queryString, this.apiSecret).toString();
    
    // Add signature to params
    params.append('signature', signature);

    try {
      console.log(`Making margin type update request to ${this.getBaseUrl()}/fapi/v1/marginType`);
      console.log('Request body:', params.toString());
      
      const response = await fetch(`${this.getBaseUrl()}/fapi/v1/marginType`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-MBX-APIKEY': this.apiKey
        },
        body: params.toString()
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Margin type update error response:', error);
        throw new Error(error.msg || 'Failed to update margin type');
      }

      const result = await response.json();
      console.log('Margin type updated successfully:', result);
      
      // Update local state
      this.marginTypeMap.set(symbol, marginType);
      this.marginTypeHandlers.forEach(handler => handler(this.marginTypeMap));
    } catch (error) {
      console.error('Failed to update margin type:', error);
      throw error;
    }
  }

  async fetchMarginTypes(): Promise<void> {
    if (!this.hasCredentials()) {
      console.log('Cannot fetch margin types: Missing API credentials');
      return;
    }

    try {
      // Fetch positions to get margin type information
      await this.fetchPositions();
      
      // Extract margin type from positions
      const positions = Array.from(this.positionMap.values());
      positions.forEach(position => {
        // The position object from Binance API doesn't directly include marginType
        // We would need to check the position's isolated flag
        // For demonstration, we're setting a default value
        if (!this.marginTypeMap.has(position.symbol)) {
          this.marginTypeMap.set(position.symbol, 'CROSSED');
        }
      });
      
      // Notify handlers
      this.marginTypeHandlers.forEach(handler => handler(this.marginTypeMap));
    } catch (error) {
      console.error('Failed to fetch margin types:', error);
    }
  }

  onMarginTypeUpdate(handler: (marginTypes: Map<string, 'ISOLATED' | 'CROSSED'>) => void) {
    this.marginTypeHandlers.push(handler);
    
    // Send initial data if available
    if (this.marginTypeMap.size > 0) {
      handler(this.marginTypeMap);
    }
    
    return () => {
      this.marginTypeHandlers = this.marginTypeHandlers.filter(h => h !== handler);
    };
  }

  async updateLeverage(symbol: string, leverage: number): Promise<void> {
    if (!this.hasCredentials()) {
      throw new Error('Please configure your API credentials');
    }

    const timestamp = Date.now();
    const params = new URLSearchParams();
    params.append('symbol', symbol);
    params.append('leverage', leverage.toString());
    params.append('timestamp', timestamp.toString());
    params.append('recvWindow', websocketConfig.settings.recvWindow);
    
    // Create the query string for signature
    const queryString = params.toString();
    
    // Generate signature
    const signature = CryptoJS.HmacSHA256(queryString, this.apiSecret).toString();
    
    // Add signature to params
    params.append('signature', signature);

    try {
      console.log(`Making leverage update request to ${this.getBaseUrl()}/fapi/v1/leverage`);
      console.log('Request body:', params.toString());
      
      const response = await fetch(`${this.getBaseUrl()}/fapi/v1/leverage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-MBX-APIKEY': this.apiKey
        },
        body: params.toString()
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Leverage update error response:', error);
        throw new Error(error.msg || 'Failed to update leverage');
      }

      const result = await response.json();
      console.log('Leverage updated successfully:', result);
    } catch (error) {
      console.error('Failed to update leverage:', error);
      throw error;
    }
  }

  getCurrentPrice(symbol: string): number | null {
    return this.marketPrices.get(symbol) || null;
  }

  private getEndpoints() {
    return {
      binance: websocketConfig.endpoints[this.network].binance,
      marketData: websocketConfig.endpoints[this.network].marketData
    };
  }

  private getBaseUrl() {
    return websocketConfig.baseUrls[this.network];
  }

  async fetchPositionMode(): Promise<'one-way' | 'hedge'> {
    if (!this.hasCredentials()) {
      throw new Error('Please configure your API credentials');
    }

    const timestamp = Date.now();
    const baseParams = {
      recvWindow: websocketConfig.settings.recvWindow,
      timestamp: timestamp.toString()
    };

    // Generate signature
    const signature = this.createSignature(baseParams);

    try {
      const queryString = new URLSearchParams({
        ...baseParams,
        signature
      }).toString();

      const response = await fetch(`${this.getBaseUrl()}/fapi/v1/positionSide/dual?${queryString}`, {
        headers: {
          'X-MBX-APIKEY': this.apiKey
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.msg || 'Failed to fetch position mode');
      }

      const data = await response.json();
      const currentMode = data.dualSidePosition ? 'hedge' : 'one-way';
      
      // Notify handlers of the mode change
      this.positionModeHandlers.forEach(handler => handler(currentMode));
      
      return currentMode;
    } catch (error) {
      console.error('Failed to fetch position mode:', error);
      throw error;
    }
  }

  async updatePositionMode(mode: 'one-way' | 'hedge'): Promise<void> {
    if (!this.hasCredentials()) {
      throw new Error('Please configure your API credentials in settings');
    }

    const timestamp = Date.now();
    const baseParams = {
      dualSidePosition: mode === 'hedge' ? 'true' : 'false',
      recvWindow: websocketConfig.settings.recvWindow,
      timestamp: timestamp.toString()
    };

    // Generate signature
    const signature = this.createSignature(baseParams);

    try {
      const response = await fetch(`${this.getBaseUrl()}/fapi/v1/positionSide/dual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-MBX-APIKEY': this.apiKey
        },
        body: new URLSearchParams({
          ...baseParams,
          signature
        }).toString()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.msg || 'Failed to update position mode');
      }

      await response.json();

      console.log('Position mode updated successfully:', mode);
    } catch (error) {
      console.error('Failed to update position mode:', error);
      throw error;
    }
  }

  private setStatus(status: 'connecting' | 'connected' | 'disconnected') {
    // Don't set disconnected status if we don't have credentials
    if (status === 'disconnected' && !this.hasCredentials()) {
      return;
    }
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    this.connectionStatusHandlers.forEach(handler => handler(status));
  }

  private hasCredentials(): boolean {
    const hasCredentials = !!(this.apiKey && this.apiSecret);
    console.log('Checking credentials:', { 
      hasCredentials,
      hasApiKey: !!this.apiKey,
      hasApiSecret: !!this.apiSecret
    });
    return hasCredentials;
  }

  private async fetchLeverageBrackets(): Promise<void> {
    if (!this.hasCredentials()) {
      console.log('Cannot fetch leverage brackets: Missing API credentials');
      return;
    }

    const timestamp = Date.now();
    const baseParams = {
      timestamp: timestamp.toString()
    };

    // Generate signature
    const signature = this.createSignature(baseParams);

    try {
      const response = await fetch(`${this.getBaseUrl()}/fapi/v1/leverageBracket?${new URLSearchParams({
        ...baseParams,
        signature
      })}`, {
        headers: {
          'X-MBX-APIKEY': this.apiKey
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.msg || 'Failed to fetch leverage brackets');
      }

      const brackets = await response.json();
      console.log('Leverage brackets fetched:', brackets);

      // Store brackets in map
      if (Array.isArray(brackets)) {
        brackets.forEach(bracket => {
          if (bracket.symbol.endsWith('USDT')) {
            this.leverageBrackets.set(bracket.symbol, bracket);
          }
        });
        
        // Notify handlers with USDT pairs only
        const usdtBrackets = brackets.filter(b => b.symbol.endsWith('USDT'));
        this.leverageBracketHandlers.forEach(handler => handler(usdtBrackets));
      }
    } catch (error) {
      console.error('Failed to fetch leverage brackets:', error);
      throw error;
    }
  }

  private async fetchExchangeInfo(retryCount = 0): Promise<void> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/fapi/v1/exchangeInfo`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.exchangeInfo = await response.json();
      console.log('Exchange info fetched successfully');
      
      // Process and store symbol info
      this.exchangeInfo.symbols.forEach((symbol: any) => {
        this.symbolInfo.set(symbol.symbol, {
          pricePrecision: symbol.pricePrecision,
          quantityPrecision: symbol.quantityPrecision,
          filters: symbol.filters.reduce((acc: any, filter: any) => {
            acc[filter.filterType] = filter;
            return acc;
          }, {})
        });
      });
    } catch (error) {
      console.error('Failed to fetch exchange info:', error);
      
      // Try 3 times
      if (retryCount < 3) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff with max 5s
        console.log(`Retrying exchange info fetch in ${delay}ms (attempt ${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchExchangeInfo(retryCount + 1);
      }
      
      throw error;
    }
  }

  private adjustQuantityPrecision(symbol: string, quantity: number): number {
    const info = this.symbolInfo.get(symbol);
    if (!info) {
      console.warn(`No symbol info found for ${symbol}`);
      return quantity;
    }

    const lotSizeFilter = info.filters.LOT_SIZE;
    if (!lotSizeFilter) {
      console.warn(`No LOT_SIZE filter found for ${symbol}`);
      return quantity;
    }

    const { minQty, maxQty, stepSize } = lotSizeFilter;
    
    // Ensure quantity is within min/max bounds
    quantity = Math.max(parseFloat(minQty), Math.min(parseFloat(maxQty), quantity));
    
    // Adjust for step size
    const precision = Math.log10(1 / parseFloat(stepSize));
    return parseFloat(Number(Math.floor(quantity / parseFloat(stepSize)) * parseFloat(stepSize)).toFixed(precision));
  }

  private adjustPricePrecision(symbol: string, price: number): number {
    const info = this.symbolInfo.get(symbol);
    if (!info) {
      console.warn(`No symbol info found for ${symbol}`);
      return price;
    }

    const priceFilter = info.filters.PRICE_FILTER;
    if (!priceFilter) {
      console.warn(`No PRICE_FILTER found for ${symbol}`);
      return price;
    }

    const { minPrice, maxPrice, tickSize } = priceFilter;
    
    // Ensure price is within min/max bounds
    price = Math.max(parseFloat(minPrice), Math.min(parseFloat(maxPrice), price));
    
    // Adjust for tick size
    const precision = Math.log10(1 / parseFloat(tickSize));
    return parseFloat(Number(Math.floor(price / parseFloat(tickSize)) * parseFloat(tickSize)).toFixed(precision));
  }

  private validateNotionalValue(symbol: string, quantity: number, price: number): boolean {
    const info = this.symbolInfo.get(symbol);
    if (!info) return true;

    const minNotionalFilter = info.filters.MIN_NOTIONAL;
    if (!minNotionalFilter) return true;

    const notionalValue = quantity * price;
    return notionalValue >= parseFloat(minNotionalFilter.notional);
  }

  private createSignature(params: Record<string, any>): string {
    // Sort params alphabetically and create query string
    const queryString = Object.keys(params)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    console.log('Query string for signature:', queryString);
    // Create HMAC SHA256 signature
    return CryptoJS.HmacSHA256(queryString, this.apiSecret).toString();
  }

  private connectToMarketData() {
    if (this.isReconnecting) {
      console.log('Already reconnecting, skipping duplicate connection attempt');
      return;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.marketDataWs?.readyState === WebSocket.OPEN) return;

    const symbols = Array.from(this.subscribedSymbols).sort();
    if (symbols.length === 0) return; 

    this.isReconnecting = true;
    
    const ws = new WebSocket(this.getEndpoints().marketData);
    
    ws.onopen = () => {
      console.log('Market data WebSocket connected');
      this.isReconnecting = false;
      this.retryCount = 0;
      this.updateHeartbeat();
      this.startHeartbeat();
      this.startAllPriceUpdates();
    };

    ws.onmessage = (event) => {
      this.updateHeartbeat();
      const data = JSON.parse(event.data);
      if (data.status === 200 && data.result) {
        const symbol = data.result.symbol;
        const price = parseFloat(data.result.price);
        this.marketPrices.set(symbol, price);

        const marketData = {
          symbol: data.result.symbol,
          price: data.result.price,
          priceChangePercent: '0.00'
        };

        const handlers = this.marketDataHandlers.get(symbol);
        handlers?.forEach(handler => {
          try {
            handler(marketData);
          } catch (error) {
            console.error(`Error in market data handler for ${symbol}:`, error);
          }
        });
      }
    };

    ws.onerror = (error) => {
      console.error('Market data WebSocket error:', error);
      this.handleMarketDataDisconnect();
    };

    ws.onclose = () => {
      console.log('Market data WebSocket closed');
      this.handleMarketDataDisconnect();
    };

    this.marketDataWs = ws;
  }

  private handleMarketDataDisconnect() {
    this.stopHeartbeat();
    this.isReconnecting = false;
    this.marketDataWs = null;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.retryCount++;
    const delay = this.calculateReconnectDelay();
    console.log(`Attempting market data WebSocket reconnect (attempt ${this.retryCount}) in ${delay}ms`);
    this.reconnectTimeout = window.setTimeout(() => this.connectToMarketData(), delay);
  }

  private startAllPriceUpdates() {
    // Clear all existing intervals
    this.priceUpdateIntervals.forEach(interval => clearInterval(interval));
    this.priceUpdateIntervals.clear();
    
    // Start updates for all subscribed symbols
    Array.from(this.subscribedSymbols).forEach(symbol => {
      this.startPriceUpdates(symbol);
    });
  }

  private startPriceUpdates(symbol: string) {
    // Clear existing interval if any
    if (this.priceUpdateIntervals.has(symbol)) {
      clearInterval(this.priceUpdateIntervals.get(symbol)!);
    }

    // Send initial price request
    this.sendPriceRequest(symbol);

    // Only set up interval if continuous updates are enabled
    if (websocketConfig.features.continuousMarketUpdates) {
      const interval = window.setInterval(() => {
        this.sendPriceRequest(symbol);
      }, websocketConfig.intervals.marketPrice);
      this.priceUpdateIntervals.set(symbol, interval);
    }
  }

  private sendPriceRequest(symbol: string) {
    if (!this.marketDataWs || this.marketDataWs.readyState !== WebSocket.OPEN) return;

    try {
      const requestId = uuidv4();
      const request = {
        id: requestId,
        method: websocketConfig.methods.ticker,
        params: {
          symbol
        }
      };

      if (this.marketDataWs && this.marketDataWs.readyState === WebSocket.OPEN) {
        this.marketDataWs.send(JSON.stringify(request));
      } else {
        throw new Error('Market data WebSocket is not connected');
      }
      this.lastRequestTime.set(symbol, Date.now());
    } catch (error) {
      console.error(`Failed to send price request for ${symbol}:`, error);
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = window.setInterval(() => {
      const now = Date.now();
      if (now - this.lastHeartbeat > websocketConfig.settings.heartbeatTimeout) {
        console.log('Heartbeat timeout, reconnecting...');
        this.handleDisconnect();
      }
    }, websocketConfig.settings.heartbeatInterval);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private updateHeartbeat() {
    this.lastHeartbeat = Date.now();
  }

  private handleDisconnect() {
    this.stopHeartbeat();
    this.isReconnecting = false;
    this.ws = null;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.retryCount++;
    const delay = this.calculateReconnectDelay();
    console.log(`Attempting reconnect (attempt ${this.retryCount}) in ${delay}ms`);
    this.reconnectTimeout = window.setTimeout(() => this.connect(), delay);
  }

  private calculateReconnectDelay(): number {
    if (!websocketConfig.settings.exponentialBackoff) {
      return websocketConfig.settings.reconnectDelay;
    }

    const delay = Math.min(
      websocketConfig.settings.reconnectDelay * Math.pow(2, this.retryCount - 1),
      websocketConfig.settings.maxReconnectDelay
    );

    return delay;
  }

  connect() {
    if (!this.hasCredentials()) {
      console.log('No credentials available, skipping connection');
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    this.setStatus('connecting');
    console.log('Connecting to Binance WebSocket...');
    this.ws = new WebSocket(this.getEndpoints().binance);

    this.ws.onopen = async () => {
      console.log('Connected to Binance WebSocket');
      this.setStatus('connected');
      this.retryCount = 0;
      this.updateHeartbeat();
      this.startHeartbeat();
      await this.authenticate();
      
      // Fetch positions only once on connection
      this.fetchPositions().catch(error => {
        console.error('Failed to fetch initial positions:', error);
      });
      
      // Fetch margin types
      this.fetchMarginTypes().catch(error => {
        console.error('Failed to fetch margin types:', error);
      });

      // Set up periodic position updates
      if (this.positionUpdateInterval) {
        window.clearInterval(this.positionUpdateInterval);
      }
      this.positionUpdateInterval = window.setInterval(() => {
        this.fetchPositions().catch(error => {
          console.error('Failed to fetch positions:', error);
        });
      }, websocketConfig.intervals.positions);
    };

    this.ws.onmessage = (event) => {
      this.updateHeartbeat();
      const response = JSON.parse(event.data);
      console.log('Received message:', response);
      
      // Handle balance update response
      if (response.status === 200 && response.result) {
        this.balanceHandlers.forEach(handler => handler(response.result));
      }

      // Handle position update response
      if (response.method === websocketConfig.methods.position && response.status === 200) {
        const positions = this.transformPositions(response.result);
        positions.forEach(pos => this.positionMap.set(pos.id, pos));
        this.positionHandlers.forEach(handler => handler(positions));
      }
      
      // Handle other message responses
      const handler = this.messageHandlers.get(response.id);
      if (handler) {
        handler(response);
        this.messageHandlers.delete(response.id);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.handleDisconnect();
    };

    this.ws.onclose = () => {
      console.log('WebSocket connection closed');
      this.handleDisconnect();
      if (this.positionUpdateInterval) {
        window.clearInterval(this.positionUpdateInterval);
        this.positionUpdateInterval = null;
      }
    };
  }

  updateCredentials(apiKey: string, apiSecret: string, network: 'testnet' | 'mainnet') {
    console.log('Updating credentials...', { hasApiKey: !!apiKey, hasApiSecret: !!apiSecret });
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.network = network;
    
    // Get authenticated information
    if (apiKey && apiSecret) {
      this.fetchLeverageBrackets().catch(console.error);
      this.fetchPositionMode().catch(console.error);
      this.fetchMarginTypes().catch(console.error);
    }
    
    // Reconnect WebSocket with new credentials
    if (this.ws) {
      console.log('Closing existing WebSocket connection to reconnect with new credentials');
      this.ws.close();
    }
    
    // Always try to connect with new credentials
    if (apiKey && apiSecret) {
      console.log('Attempting to connect with new credentials');
      this.connect();
    }
  }

  private async authenticate(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('Cannot authenticate: WebSocket not connected');
      throw new Error('WebSocket is not connected');
    }

    if (!this.apiKey || !this.apiSecret) {
      console.log('Cannot authenticate: Missing API credentials');
      throw new Error('API credentials not configured');
    }

    const requestId = uuidv4();
    const timestamp = Date.now();

    // Create params without signature first
    const baseParams = {
      apiKey: this.apiKey,
      timestamp: timestamp.toString(),
      recvWindow: websocketConfig.settings.recvWindow
    };

    // Generate signature and add it to params
    const signature = this.createSignature(baseParams);

    const authRequest = {
      id: requestId,
      method: websocketConfig.methods.balance,
      params: {
        ...baseParams,
        signature
      }
    };

    return new Promise((resolve, reject) => {
      this.messageHandlers.set(requestId, (response) => {
        if (response.status === 200) {
          console.log('Successfully retrieved account balance');
          this.setStatus('connected');
          resolve();
        } else {
          console.error('Balance request failed:', response);
          this.setStatus('disconnected');
          reject(new Error(`Balance request failed: ${response.error?.msg || 'Unknown error'}`));
        }
      });

      console.log('Sending balance request:', authRequest);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(authRequest));
      } else {
        throw new Error('WebSocket is not connected');
      }
    });
  }

  async placeOrder(params: OrderParams): Promise<void> {
    if (!this.hasCredentials()) {
      showToast('Please configure your API credentials in settings');
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      showToast('WebSocket connection failed. Please try again.');
      return;
    }
    
    const currentPrice = this.marketPrices.get(params.symbol);
    if (!currentPrice) {
      showToast('Failed to get market price. Please try again.');
      return;
    }
    
    if (!this.symbolInfo.has(params.symbol)) {
      showToast('Failed to get symbol information. Please try again.');
      return;
    }

    const timestamp = Date.now();
    const requestId = uuidv4();
    
    let notionalValue = 1000;
    if (params.leverage) {
      // If ends with "K" (e.g.: "1K", "5K")
      const kMatch = params.leverage.match(/(\d+)K/);
      if (kMatch) {
        notionalValue = parseInt(kMatch[1]) * 1000;
      } else {
        // If it's just a number (e.g.: "250")
        const numberMatch = params.leverage.match(/(\d+)/);
        if (numberMatch) {
          notionalValue = parseInt(numberMatch[1]);
        }
      }
    }

    // Calculate quantity using current price
    const quantity = notionalValue / currentPrice;
    const adjustedQuantity = this.adjustQuantityPrecision(params.symbol, quantity);
    
    // Validate notional value
    if (!this.validateNotionalValue(params.symbol, adjustedQuantity, currentPrice)) {
      throw new Error('Order size is too small. Please increase the amount.');
    }
    
    console.log(`Opening position with: notional=${notionalValue}, quantity=${quantity}`);
    
    let baseParams: Record<string, any> = {
      apiKey: this.apiKey,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: adjustedQuantity,
      positionSide: params.positionMode === 'one-way' ? 'BOTH' : (params.side === 'BUY' ? 'LONG' : 'SHORT'),
      timestamp: timestamp.toString(),
      recvWindow: websocketConfig.settings.recvWindow
    };

    // Add additional parameters for LIMIT orders only
    if (params.type === 'LIMIT') {
      baseParams = {
        ...baseParams,
        timeInForce: 'GTC',
        price: this.adjustPricePrecision(params.symbol, parseFloat(params.price!)).toString() // Convert to string
      };
    }

    // Generate signature and add it to params
    const signature = this.createSignature(baseParams);

    const orderRequest = {
      id: requestId,
      method: websocketConfig.methods.orderPlace,
      params: {
        ...baseParams,
        signature
      }
    };

    console.log('Sending order request:', orderRequest);

    return new Promise((resolve, reject) => {
      this.messageHandlers.set(requestId, (response) => {
        if (response.status !== 200 || response.error) {
          console.error('Order failed:', response);
          reject(new Error(response.error?.msg || 'Order failed'));
        } else {
          console.log('Order placed successfully:', response);
          resolve();
        }
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(orderRequest));
      } else {
        throw new Error('WebSocket is not connected');
      }
    });
  }

  async closePosition(positionId: string, type: 'MARKET' | 'LIMIT', limitPrice?: number, size?: number): Promise<void> {
    if (!this.hasCredentials()) {
      showToast('Please configure your API credentials in settings');
      return;
    }

    const position = this.positionMap.get(positionId);
    if (!position) {
      showToast('Position not found. Please try again.');
      return;
    }

    const timestamp = Date.now();
    const requestId = uuidv4();

    // Determine the side (opposite of position type)
    const side = position.type === 'long' ? 'SELL' : 'BUY';

    // Ensure quantity is positive
    const rawQuantity = size ? Math.abs(size) : Math.abs(position.size);
    // Apply precision adjustment
    const quantity = this.adjustQuantityPrecision(position.symbol, rawQuantity);

    // Base parameters for the order
    const baseParams: Record<string, any> = {
      apiKey: this.apiKey,
      symbol: position.symbol,
      side,
      type,
      quantity,
      positionSide: position.type === 'long' ? 'LONG' : 'SHORT',
      timestamp: timestamp.toString(),
      recvWindow: websocketConfig.settings.recvWindow
    };

    // Add limit order specific parameters
    if (type === 'LIMIT' && limitPrice) {
      baseParams.timeInForce = 'GTC';
      baseParams.price = limitPrice.toString();
    }

    // Generate signature
    const signature = this.createSignature(baseParams);

    const orderRequest = {
      id: requestId,
      method: websocketConfig.methods.orderPlace,
      params: {
        ...baseParams,
        signature
      }
    };

    console.log('Sending close position order:', orderRequest);

    return new Promise((resolve, reject) => {
      this.messageHandlers.set(requestId, (response) => {
        if (response.status !== 200 || response.error) {
          console.error('Close position failed:', response);
          reject(new Error(response.error?.msg || 'Failed to close position'));
        } else {
          console.log('Position closed successfully:', response);
          resolve();
        }
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(orderRequest));
      } else {
        throw new Error('WebSocket is not connected');
      }
    });
  }

  private transformPositions(positionData: any[]): Position[] {
    const positions = positionData
      .filter(p => parseFloat(p.positionAmt) !== 0) // Only include non-zero positions
      .map(p => {
        const positionType: 'long' | 'short' = parseFloat(p.positionAmt) > 0 ? 'long' : 'short';
        const marginType: 'ISOLATED' | 'CROSSED' = p.isolated ? 'ISOLATED' : 'CROSSED';
        
        return {
          id: `${p.symbol}-${p.positionSide}`,
          symbol: p.symbol,
          size: parseFloat(p.positionAmt),
          entryPrice: parseFloat(p.entryPrice),
          markPrice: parseFloat(p.markPrice),
          pnl: parseFloat(p.unRealizedProfit),
          pnlPercentage: (parseFloat(p.unRealizedProfit) / parseFloat(p.initialMargin)) * 100,
          type: positionType,
          leverage: `${Math.round(Math.abs(parseFloat(p.notional) / parseFloat(p.initialMargin)))}x`,
          liquidationPrice: parseFloat(p.liquidationPrice),
          breakEvenPrice: parseFloat(p.breakEvenPrice),
          positionInitialMargin: parseFloat(p.positionInitialMargin),
          notional: parseFloat(p.notional),
          marginType: marginType
        };
      });
    
    // Update position map and margin type map
    positions.forEach(pos => {
      this.positionMap.set(pos.id, pos);
      if (pos.marginType) {
        this.marginTypeMap.set(pos.symbol, pos.marginType);
      }
    });
    
    return positions;
  }

  async fetchBalance(): Promise<void> {
    if (!this.hasCredentials()) {
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const requestId = uuidv4();
    const timestamp = Date.now();

    const baseParams = {
      apiKey: this.apiKey,
      timestamp: timestamp.toString(),
      recvWindow: websocketConfig.settings.recvWindow
    };

    const signature = this.createSignature(baseParams);

    const balanceRequest = {
      id: requestId,
      method: websocketConfig.methods.balance,
      params: {
        ...baseParams,
        signature
      }
    };

    return new Promise((resolve, reject) => {
      this.messageHandlers.set(requestId, (response) => {
        if (response.status === 200) {
          this.balanceHandlers.forEach(handler => handler(response.result));
          resolve();
        } else {
          reject(new Error(`Failed to fetch balance: ${response.error?.msg || 'Unknown error'}`));
        }
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(balanceRequest));
      } else {
        throw new Error('WebSocket is not connected');
      }
    });
  }

  async fetchPositions(): Promise<void> {
    if (!this.hasCredentials()) {
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const requestId = uuidv4();
    const timestamp = Date.now();

    const baseParams = {
      apiKey: this.apiKey,
      timestamp: timestamp.toString(),
      recvWindow: websocketConfig.settings.recvWindow
    };

    const signature = this.createSignature(baseParams);

    const positionRequest = {
      id: requestId,
      method: websocketConfig.methods.position,
      params: {
        ...baseParams,
        signature
      }
    };

    return new Promise((resolve, reject) => {
      this.messageHandlers.set(requestId, (response) => {
        if (response.status === 200) {
          const positions = this.transformPositions(response.result);
          this.positionHandlers.forEach(handler => handler(positions));
          resolve();
        } else {
          reject(new Error(`Failed to fetch positions: ${response.error?.msg || 'Unknown error'}`));
        }
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(positionRequest));
      } else {
        throw new Error('WebSocket is not connected');
      }
    });
  }

  async closeAllPositions(): Promise<void> {
    if (!this.hasCredentials()) {
      showToast('Please configure your API credentials in settings');
      return;
    }

    if (this.isClosingAllPositions) {
      showToast('Positions are already being closed, please wait.');
      return;
    }

    try {
      this.isClosingAllPositions = true;
      const positions = Array.from(this.positionMap.values());
      
      if (positions.length === 0) {
        showToast('No open positions to close.', 'warning');
        return;
      }

      // Close all positions in parallel
      await Promise.all(positions.map(async (position) => {
        const timestamp = Date.now();
        const requestId = uuidv4();

        // Determine the side (opposite of position type)
        const side = position.type === 'long' ? 'SELL' : 'BUY';

        // Ensure quantity is positive and apply precision
        const rawQuantity = Math.abs(position.size);
        const quantity = this.adjustQuantityPrecision(position.symbol, rawQuantity);

        const baseParams = {
          apiKey: this.apiKey,
          symbol: position.symbol,
          side,
          type: 'MARKET',
          quantity,
          positionSide: position.type === 'long' ? 'LONG' : 'SHORT',
          timestamp: timestamp.toString(),
          recvWindow: websocketConfig.settings.recvWindow
        };

        const signature = this.createSignature(baseParams);

        const orderRequest = {
          id: requestId,
          method: websocketConfig.methods.orderPlace,
          params: {
            ...baseParams,
            signature
          }
        };

        return new Promise((resolve, reject) => {
          this.messageHandlers.set(requestId, (response) => {
            if (response.status !== 200 || response.error) {
              console.error(`Failed to close position ${position.symbol}:`, response);
              reject(new Error(`Failed to close ${position.symbol}: ${response.error?.msg || 'Unknown error'}`));
            } else {
              console.log(`Position ${position.symbol} closed successfully:`, response);
              resolve(response);
            }
          });

          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(orderRequest));
          } else {
            throw new Error('WebSocket is not connected');
          }
        });
      }));

      console.log('All positions closed successfully');
    } finally {
      this.isClosingAllPositions = false;
    }
  }

  onPositionUpdate(handler: (positions: Position[]) => void) {
    this.positionHandlers.push(handler);
    return () => {
      this.positionHandlers = this.positionHandlers.filter(h => h !== handler);
    };
  }

  onBalanceUpdate(handler: (balances: any[]) => void) {
    this.balanceHandlers.push(handler);
    return () => {
      this.balanceHandlers = this.balanceHandlers.filter(h => h !== handler);
    };
  }

  onPositionModeChange(handler: (mode: 'one-way' | 'hedge') => void) {
    this.positionModeHandlers.push(handler);
    return () => {
      this.positionModeHandlers = this.positionModeHandlers.filter(h => h !== handler);
    };
  }

  subscribeToMarketData(symbol: string, handler: (data: any) => void) {
    // Add handler
    if (!this.marketDataHandlers.has(symbol)) {
      this.marketDataHandlers.set(symbol, new Set());
    }
    this.marketDataHandlers.get(symbol)?.add(handler);

    // Add to subscribed symbols and reconnect if needed
    if (!this.subscribedSymbols.has(symbol)) {
      this.subscribedSymbols.add(symbol);
      
      // Start price updates for the new symbol
      if (this.marketDataWs?.readyState === WebSocket.OPEN) {
        this.startPriceUpdates(symbol);
      } else if (!this.marketDataWs) {
        this.connectToMarketData(); // Only connect if no connection exists
      }
    }

    return () => {
      this.unsubscribeFromMarketData(symbol, handler);
    };
  }

  unsubscribeFromMarketData(symbol: string, handler: (data: any) => void) {
    const handlers = this.marketDataHandlers.get(symbol);
    if (handlers) {
      handlers.delete(handler);
      
      // If this was the last handler for this symbol
      if (handlers.size === 0) {
        // Clear price update interval
        if (this.priceUpdateIntervals.has(symbol)) {
          clearInterval(this.priceUpdateIntervals.get(symbol));
          this.priceUpdateIntervals.delete(symbol);
        }
        
        // Clear any queued messages
        if (this.messageQueue.has(symbol)) {
          clearTimeout(this.messageQueue.get(symbol));
          this.messageQueue.delete(symbol);
        }
        
        // Remove symbol from tracking
        this.marketDataHandlers.delete(symbol);
        this.subscribedSymbols.delete(symbol);
        this.lastRequestTime.delete(symbol);
        this.marketPrices.delete(symbol);
        
        console.log(`Unsubscribed from market data for ${symbol}`);
      }
    }
  }

  onLeverageBracketsUpdate(handler: (brackets: LeverageBracket[]) => void) {
    this.leverageBracketHandlers.push(handler);
    
    // Send initial data if available
    if (this.leverageBrackets.size > 0) {
      const brackets = Array.from(this.leverageBrackets.values());
      handler(brackets);
    }
    
    return () => {
      this.leverageBracketHandlers = this.leverageBracketHandlers.filter(h => h !== handler);
    };
  }

  onConnectionStatusChange(handler: (status: 'connecting' | 'connected' | 'disconnected') => void) {
    this.connectionStatusHandlers.push(handler);
    // Immediately call handler with current status
    handler(this.currentStatus);
    return () => {
      this.connectionStatusHandlers = this.connectionStatusHandlers.filter(h => h !== handler);
    };
  }

  formatPrice(symbol: string, price: string | number): string {
    const info = this.symbolInfo.get(symbol);
    if (!info) {
      // If no symbol info, show 2 decimal places by default
      return parseFloat(price.toString()).toFixed(2);
    }

    const priceFilter = info.filters.PRICE_FILTER;
    if (!priceFilter) {
      return parseFloat(price.toString()).toFixed(2);
    }

    // Calculate decimal places from tickSize
    const tickSize = parseFloat(priceFilter.tickSize);
    const precision = Math.max(0, -Math.log10(tickSize));
    
    return parseFloat(price.toString()).toFixed(precision);
  }
}

export const binanceService = new BinanceService();