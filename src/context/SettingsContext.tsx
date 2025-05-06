import React, { createContext, useContext, useState, useEffect } from 'react';
import CryptoJS from 'crypto-js';

type PositionMode = 'one-way' | 'hedge';
type NetworkType = 'testnet' | 'mainnet';

// Unique keys for LocalStorage
const ENCRYPTION_KEY = 'cryptoTerminal_encKey';
const STORAGE_KEY_API_KEY = 'cryptoTerminal_apiKey';
const STORAGE_KEY_API_SECRET = 'cryptoTerminal_apiSecret';
const STORAGE_KEY_NETWORK = 'cryptoTerminal_network';
const STORAGE_KEY_SAVE_CREDENTIALS = 'cryptoTerminal_saveCredentials';

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
  saveCredentialsInCache: boolean;
  setPositionMode: (mode: PositionMode) => void;
  setApiCredentials: (key: string, secret: string, network: NetworkType) => void;
  setSymbolTradeButtons: (symbol: string, values: TradeButtonValues) => void;
  updateGlobalTradeButtons: (values: TradeButtonValues) => void;
  setSaveCredentialsInCache: (save: boolean) => void;
  clearCachedCredentials: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// Local storage keys
const STORAGE_KEY_TRADE_BUTTONS = 'cryptoTerminal_tradeButtons';
const STORAGE_KEY_GLOBAL_BUTTONS = 'cryptoTerminal_globalTradeButtons';

// Default trade button values
const DEFAULT_TRADE_BUTTONS: TradeButtonValues = {
  long: ['10K', '25K', '50K'],
  short: ['10K', '25K', '50K']
};

// Şifreli veriyi çözen fonksiyon
const decryptData = (data: string | null): string => {
  if (!data) return '';
  try {
    const bytes = CryptoJS.AES.decrypt(data, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.error('Decryption error:', e);
    return '';
  }
};

// Veriyi şifreleyen fonksiyon
const encryptData = (data: string): string => {
  return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [positionMode, setPositionMode] = useState<PositionMode>('one-way');
  
  // LocalStorage'dan şifreli API anahtarlarını al
  const [{ apiKey, apiSecret, network }, setCredentials] = useState(() => {
    const savedApiKey = localStorage.getItem(STORAGE_KEY_API_KEY);
    const savedApiSecret = localStorage.getItem(STORAGE_KEY_API_SECRET);
    const savedNetwork = localStorage.getItem(STORAGE_KEY_NETWORK);
    
    return { 
      apiKey: savedApiKey ? decryptData(savedApiKey) : '', 
      apiSecret: savedApiSecret ? decryptData(savedApiSecret) : '', 
      network: (savedNetwork ? decryptData(savedNetwork) : 'mainnet') as NetworkType 
    };
  });
  
  // API anahtarlarını önbellekte saklama tercihini al
  const [saveCredentialsInCache, setSaveCredentialsInCache] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SAVE_CREDENTIALS);
    return saved ? JSON.parse(saved) : false;
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
  
  // Save to localStorage when saveCredentialsInCache changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SAVE_CREDENTIALS, JSON.stringify(saveCredentialsInCache));
    
    // saveCredentialsInCache false olursa, localStorage'dan api anahtarlarını sil
    if (!saveCredentialsInCache) {
      localStorage.removeItem(STORAGE_KEY_API_KEY);
      localStorage.removeItem(STORAGE_KEY_API_SECRET);
      localStorage.removeItem(STORAGE_KEY_NETWORK);
    }
  }, [saveCredentialsInCache]);

  const setApiCredentials = (key: string, secret: string, network: NetworkType) => {
    setCredentials({ apiKey: key, apiSecret: secret, network });
    
    // Eğer önbellekte saklamak isteniyorsa, api anahtarlarını şifrele ve localStorage'a kaydet
    if (saveCredentialsInCache) {
      localStorage.setItem(STORAGE_KEY_API_KEY, encryptData(key));
      localStorage.setItem(STORAGE_KEY_API_SECRET, encryptData(secret));
      localStorage.setItem(STORAGE_KEY_NETWORK, encryptData(network));
    }
  };
  
  // API anahtarlarını önbellekten tamamen silen fonksiyon
  const clearCachedCredentials = () => {
    localStorage.removeItem(STORAGE_KEY_API_KEY);
    localStorage.removeItem(STORAGE_KEY_API_SECRET);
    localStorage.removeItem(STORAGE_KEY_NETWORK);
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
      saveCredentialsInCache,
      setSaveCredentialsInCache,
      clearCachedCredentials,
      setSymbolTradeButtons,
      updateGlobalTradeButtons,
      setApiCredentials
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