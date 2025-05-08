import React from 'react';
import { Settings, X } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { binanceService } from '../services/binanceService';
import { useState, useEffect } from 'react';
import type { LeverageBracket } from '../types';
import { TradingConfigModal } from './TradingConfigModal';
import { UIConfigModal } from './UIConfigModal';

export function SettingsMenu() {
  const [isOpen, setIsOpen] = React.useState(false);
  const { 
    positionMode, 
    setPositionMode, 
    apiKey, 
    apiSecret, 
    network, 
    setApiCredentials, 
    saveCredentialsInCache, 
    setSaveCredentialsInCache 
  } = useSettings();
  const [hasValidCredentials, setHasValidCredentials] = useState(false);
  const [newApiKey, setNewApiKey] = React.useState(apiKey);
  const [newApiSecret, setNewApiSecret] = React.useState(apiSecret);
  const [selectedNetwork, setSelectedNetwork] = React.useState<'testnet' | 'mainnet'>(network);
  const [isUpdatingMode, setIsUpdatingMode] = useState(false);
  const [isLoadingMode, setIsLoadingMode] = useState(false);
  const [hasLoadedMode, setHasLoadedMode] = useState(false);
  const [isTradingConfigOpen, setIsTradingConfigOpen] = useState(false);
  const [isUIConfigOpen, setIsUIConfigOpen] = useState(false);
  const [leverageBrackets, setLeverageBrackets] = useState<LeverageBracket[]>([]);
  const [selectedLeverages, setSelectedLeverages] = useState<Record<string, number>>({});
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [credentialsSubmitted, setCredentialsSubmitted] = useState(false);
  const [credentialsChanged, setCredentialsChanged] = useState(false);
  const [saveInCache, setSaveInCache] = useState(saveCredentialsInCache);

  // Sayfa yüklendiğinde önbellekte API anahtarları varsa otomatik bağlantı kur
  useEffect(() => {
    if (apiKey && apiSecret && !credentialsSubmitted) {
      binanceService.updateCredentials(apiKey, apiSecret, network);
      setCredentialsSubmitted(true);
      setNewApiKey(apiKey);
      setNewApiSecret(apiSecret);
      setSelectedNetwork(network);
    }
  }, [apiKey, apiSecret, network]);

  // Check if we have valid credentials
  useEffect(() => {
    setHasValidCredentials(!!(apiKey && apiSecret));
    if (!apiKey || !apiSecret) {
      setHasLoadedMode(false);
    }
  }, [apiKey, apiSecret]);

  // Monitor connection status
  useEffect(() => {
    const unsubscribe = binanceService.onConnectionStatusChange(setConnectionStatus);
    return () => unsubscribe();
  }, []);

  // Reset credentialsSubmitted flag when credentials change
  useEffect(() => {
    if (credentialsChanged && credentialsSubmitted) {
      setCredentialsSubmitted(false);
      setCredentialsChanged(false);
    }
  }, [credentialsChanged, credentialsSubmitted]);

  useEffect(() => {
    const unsubscribe = binanceService.onPositionModeChange((mode) => {
      setPositionMode(mode);
    });

    return () => unsubscribe();
  }, [setPositionMode]);

  useEffect(() => {
    if (hasValidCredentials) {
      setIsLoadingMode(true);
      setHasLoadedMode(false);
      binanceService.fetchPositionMode()
        .then(() => {
          setHasLoadedMode(true);
        })
        .catch(error => {
          console.error('Failed to fetch position mode:', error);
          setHasLoadedMode(false); // Hide buttons if fetch fails
        })
        .finally(() => {
          setIsLoadingMode(false);
        });
    } else {
      setHasLoadedMode(false); // Hide buttons when no valid credentials
    }
  }, [hasValidCredentials]);

  useEffect(() => {
    const unsubscribe = binanceService.onLeverageBracketsUpdate((brackets) => {
      setLeverageBrackets(brackets.sort((a, b) => a.symbol.localeCompare(b.symbol)));
    });
    return () => unsubscribe();
  }, []);

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

  const handleSaveCredentials = () => {
    setApiCredentials(newApiKey, newApiSecret, selectedNetwork);
    binanceService.updateCredentials(newApiKey, newApiSecret, selectedNetwork);
    setHasLoadedMode(false); // Reset hasLoadedMode when credentials change
    setCredentialsSubmitted(true);
    setCredentialsChanged(false);
  };
  
  const handleLeverageSelect = (symbol: string, leverage: number) => {
    setSelectedLeverages(prev => ({
      ...prev,
      [symbol]: leverage
    }));
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewApiKey(e.target.value);
    setCredentialsChanged(true);
  };

  const handleApiSecretChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewApiSecret(e.target.value);
    setCredentialsChanged(true);
  };
  
  const handleSaveInCacheChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaveInCache(e.target.checked);
    setSaveCredentialsInCache(e.target.checked);
  };
  
  const isConnected = connectionStatus === 'connected';

  // Monitor WebSocket connection status
  useEffect(() => {
    if (credentialsSubmitted && !credentialsChanged && connectionStatus === 'connected') {
      // When WebSocket connection is successful
      setIsLoadingMode(true);
      setHasLoadedMode(false);
      
      // Load position mode
      binanceService.fetchPositionMode()
        .then(() => {
          setHasLoadedMode(true);
        })
        .catch(error => {
          console.error('Failed to fetch position mode:', error);
          setHasLoadedMode(false);
        })
        .finally(() => {
          setIsLoadingMode(false);
        });
    }
  }, [credentialsSubmitted, credentialsChanged, connectionStatus]);

  // Determine button text based on credentials state and connection status
  const getButtonText = () => {
    if (!credentialsSubmitted || credentialsChanged || !newApiKey || !newApiSecret) {
      return "Connect to Binance";
    }
    
    switch (connectionStatus) {
      case 'connected':
        return "Connected to Binance";
      case 'connecting':
        return "Connecting to Binance...";
      case 'disconnected':
        return "Not connected to Binance";
      default:
        return "Connect to Binance";
    }
  };
  
  return (
    <div className="relative z-60">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg bg-binance-gray hover:bg-binance-lightgray transition-all transform hover:-translate-y-1 duration-200"
        aria-label="Settings"
      >
        <Settings className="h-5 w-5 text-binance-yellow" />
      </button>

      {isOpen && (
        <>
          <div
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-[65] bg-black/40 backdrop-blur-sm"
          />
          <div className="absolute right-0 mt-2 w-72 rounded-lg bg-gradient-to-br from-binance-darkgray to-binance-black border border-binance-lightgray/20 shadow-binance-card z-[70]">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">Binance Settings</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400 block mb-2">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={newApiKey}
                      onChange={handleApiKeyChange}
                      className="w-full px-3 py-1.5 text-xs rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-binance-yellow/20"
                      placeholder="Enter your API key"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400 block mb-2">
                      API Secret
                    </label>
                    <input
                      type="password"
                      value={newApiSecret}
                      onChange={handleApiSecretChange}
                      className="w-full px-3 py-1.5 text-xs rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-binance-yellow/20"
                      placeholder="Enter your API secret"
                    />
                    <div className="flex items-center mt-2">
                      <input
                        type="checkbox"
                        id="saveInCache"
                        checked={saveInCache}
                        onChange={handleSaveInCacheChange}
                        className="h-3 w-3 rounded border-gray-300 text-binance-yellow focus:ring-binance-yellow/20"
                      />
                      <label htmlFor="saveInCache" className="ml-2 block text-xs text-gray-500 dark:text-gray-400">
                        Save API keys in browser cache
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400 block mb-2">
                      Network
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedNetwork('mainnet');
                          setCredentialsChanged(true);
                        }}
                        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                          selectedNetwork === 'mainnet'
                            ? 'bg-binance-yellow text-binance-black'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        Mainnet
                      </button>
                      <button
                        onClick={() => {
                          setSelectedNetwork('testnet');
                          setCredentialsChanged(true);
                        }}
                        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                          selectedNetwork === 'testnet'
                            ? 'bg-binance-yellow text-binance-black'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        Testnet
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveCredentials}
                    className={`w-full px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                      credentialsSubmitted && !credentialsChanged && connectionStatus === 'connected'
                        ? 'bg-binance-green hover:bg-binance-green/90 text-white'
                        : credentialsSubmitted && !credentialsChanged && connectionStatus === 'connecting'
                          ? 'bg-binance-yellow hover:bg-binance-yellow/90 text-binance-black'
                          : 'bg-binance-yellow hover:bg-binance-yellow/90 text-binance-black'
                    }`}
                    disabled={!newApiKey || !newApiSecret}
                  >
                    {getButtonText()}
                  </button>
                  
                  {/* Connection status indicator - only show if not showing in button */}
                  {hasValidCredentials && (!credentialsSubmitted || credentialsChanged) && (
                    <div className="text-center py-2">
                      <span className={`text-xs font-medium ${
                        connectionStatus === 'connected' 
                          ? 'text-binance-green' 
                          : connectionStatus === 'connecting' 
                            ? 'text-binance-yellow' 
                            : 'text-binance-red'
                      }`}>
                        {connectionStatus === 'connected' 
                          ? '✓ Connected to Binance' 
                          : connectionStatus === 'connecting' 
                            ? 'Connecting to Binance...' 
                            : 'Not connected to Binance'}
                      </span>
                    </div>
                  )}
                  
                  {hasValidCredentials && isConnected && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                      {/* Position Mode selection */}
                      {hasLoadedMode && (
                        <div className="space-y-2">
                          <label className="text-sm text-gray-600 dark:text-gray-400 block">
                            Position Mode
                          </label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handlePositionModeChange('one-way')}
                              disabled={isUpdatingMode}
                              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all ${
                                positionMode === 'one-way'
                                  ? 'bg-binance-yellow text-binance-black shadow-binance-3d'
                                  : 'bg-binance-gray text-gray-300 hover:bg-binance-lightgray hover:-translate-y-1'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {isUpdatingMode ? 'Updating...' : 'One-way'}
                            </button>
                            <button
                              onClick={() => handlePositionModeChange('hedge')}
                              disabled={isUpdatingMode}
                              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all ${
                                positionMode === 'hedge'
                                  ? 'bg-binance-yellow text-binance-black shadow-binance-3d'
                                  : 'bg-binance-gray text-gray-300 hover:bg-binance-lightgray hover:-translate-y-1'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {isUpdatingMode ? 'Updating...' : 'Hedge'}
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {isLoadingMode && (
                        <div className="text-center py-2">
                          <span className="text-xs text-gray-400">Loading settings...</span>
                        </div>
                      )}
                      
                      <button
                        onClick={() => {
                          setIsTradingConfigOpen(true);
                          setIsOpen(false);
                        }}
                        className="w-full px-3 py-2 text-sm font-medium rounded bg-binance-gray text-white hover:bg-binance-lightgray transition-all transform hover:-translate-y-1 duration-200"
                      >
                        Trading Configuration
                      </button>
                    </div>
                  )}
                  
                  {/* UI Configuration butonu - her zaman görünür */}
                  <div className={`${hasValidCredentials && isConnected ? 'mt-4' : 'mt-4 pt-4 border-t border-gray-200 dark:border-gray-700'}`}>
                    <button
                      onClick={() => {
                        setIsUIConfigOpen(true);
                        setIsOpen(false);
                      }}
                      className="w-full px-3 py-2 text-sm font-medium rounded bg-binance-gray text-white hover:bg-binance-lightgray transition-all transform hover:-translate-y-1 duration-200"
                    >
                      UI Configuration
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      
      <TradingConfigModal
        isOpen={isTradingConfigOpen}
        onClose={() => setIsTradingConfigOpen(false)}
        leverageBrackets={leverageBrackets}
        selectedLeverages={selectedLeverages}
        onLeverageSelect={handleLeverageSelect}
      />
      
      <UIConfigModal
        isOpen={isUIConfigOpen}
        onClose={() => setIsUIConfigOpen(false)}
      />
    </div>
  );
}