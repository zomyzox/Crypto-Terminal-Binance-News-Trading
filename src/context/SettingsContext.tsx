import React, { createContext, useContext, useState, useEffect } from 'react';
import CryptoJS from 'crypto-js';

type PositionMode = 'one-way' | 'hedge';
type NetworkType = 'testnet' | 'mainnet';

// Define types for trade buttons
export interface TradeButtonValues {
  long: string[];
  short: string[];
}

export type SymbolTradeButtons = Record<string, TradeButtonValues>;

interface SettingsContextType {
  apiKey: string;
  apiSecret: string;
  network: NetworkType;
  positionMode: PositionMode;
  tradeButtons: SymbolTradeButtons;
  globalTradeButtons: TradeButtonValues;
  saveApiKeysInCache: boolean;
  setPositionMode: (mode: PositionMode) => void;
  setApiCredentials: (key: string, secret: string, network: NetworkType) => void;
  setSymbolTradeButtons: (symbol: string, values: TradeButtonValues) => void;
  updateGlobalTradeButtons: (values: TradeButtonValues) => void;
  setSaveApiKeysInCache: (save: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// Local storage keys
const STORAGE_KEY_TRADE_BUTTONS = 'cryptoTerminal_tradeButtons';
const STORAGE_KEY_GLOBAL_BUTTONS = 'cryptoTerminal_globalTradeButtons';
const STORAGE_KEY_API_KEYS = 'cryptoTerminal_apiKeys';
const STORAGE_ENCRYPTION_KEY = 'binance-api-encryption-key';

// Default trade button values
const DEFAULT_TRADE_BUTTONS: TradeButtonValues = {
  long: ['10K', '25K', '50K'],
  short: ['10K', '25K', '50K']
};

// Helper functions for encrypting and decrypting API keys
const encryptData = (data: any) => {
  return CryptoJS.AES.encrypt(JSON.stringify(data), STORAGE_ENCRYPTION_KEY).toString();
};

const decryptData = (encryptedData: string) => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, STORAGE_ENCRYPTION_KEY);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  } catch (error) {
    console.error('Failed to decrypt data:', error);
    return null;
  }
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [positionMode, setPositionMode] = useState<PositionMode>('one-way');
  const [{ apiKey, apiSecret, network }, setCredentials] = useState(() => {
    // Try to load API credentials from localStorage if they exist
    const savedKeys = localStorage.getItem(STORAGE_KEY_API_KEYS);
    if (savedKeys) {
      try {
        const decryptedKeys = decryptData(savedKeys);
        if (decryptedKeys && decryptedKeys.apiKey && decryptedKeys.apiSecret) {
          return { 
            apiKey: decryptedKeys.apiKey, 
            apiSecret: decryptedKeys.apiSecret, 
            network: decryptedKeys.network || 'mainnet' as NetworkType 
          };
        }
      } catch (error) {
        console.error('Error loading saved API keys:', error);
      }
    }
    return { 
      apiKey: '', 
      apiSecret: '', 
      network: 'mainnet' as NetworkType 
    };
  });
  
  const [saveApiKeysInCache, setSaveApiKeysInCache] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_API_KEYS) !== null;
  });
  
  // Initialize trade buttons state from localStorage or defaults
  const [tradeButtons, setTradeButtons] = useState<SymbolTradeButtons>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_TRADE_BUTTONS);
    return saved ? JSON.parse(saved) : {};
  });
  
  // Global trade buttons that apply to all symbols
  const [globalTradeButtons, setGlobalTradeButtons] = useState<TradeButtonValues>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_GLOBAL_BUTTONS);
    return saved ? JSON.parse(saved) : DEFAULT_TRADE_BUTTONS;
  });

  // Save to localStorage when trade buttons change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TRADE_BUTTONS, JSON.stringify(tradeButtons));
  }, [tradeButtons]);

  // Save to localStorage when global trade buttons change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_GLOBAL_BUTTONS, JSON.stringify(globalTradeButtons));
  }, [globalTradeButtons]);

  // Save or remove API keys from localStorage based on saveApiKeysInCache setting
  useEffect(() => {
    if (saveApiKeysInCache && apiKey && apiSecret) {
      const encryptedData = encryptData({ apiKey, apiSecret, network });
      localStorage.setItem(STORAGE_KEY_API_KEYS, encryptedData);
    } else if (!saveApiKeysInCache) {
      localStorage.removeItem(STORAGE_KEY_API_KEYS);
    }
  }, [saveApiKeysInCache, apiKey, apiSecret, network]);

  const setApiCredentials = (key: string, secret: string, network: NetworkType) => {
    setCredentials({ apiKey: key, apiSecret: secret, network });
  };

  // Function to update trade button values for a specific symbol
  const setSymbolTradeButtons = (symbol: string, values: TradeButtonValues) => {
    setTradeButtons(prev => ({
      ...prev,
      [symbol]: values
    }));
  };

  // Function to update global trade button values that apply to all symbols
  const updateGlobalTradeButtons = (values: TradeButtonValues) => {
    setGlobalTradeButtons(values);
  };

  return (
    <SettingsContext.Provider value={{ 
      positionMode, 
      setPositionMode,
      apiKey,
      apiSecret,
      network,
      tradeButtons,
      globalTradeButtons,
      saveApiKeysInCache,
      setSymbolTradeButtons,
      updateGlobalTradeButtons,
      setApiCredentials,
      setSaveApiKeysInCache
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

// Helper function to get trade button values for a symbol, with defaults if not set
export const getSymbolTradeButtons = (tradeButtons: SymbolTradeButtons, globalButtons: TradeButtonValues, symbol: string): TradeButtonValues => {
  return tradeButtons[symbol] || globalButtons;
};