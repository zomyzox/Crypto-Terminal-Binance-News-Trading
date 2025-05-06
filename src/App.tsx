import { useState, useEffect, useCallback } from 'react';
import { Terminal, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { newsService } from './services/newsService';
import { NewsCard } from './components/NewsCard';
import { TradingPanel } from './components/TradingPanel';
import { ConnectionStatus } from './components/ConnectionStatus';
import { SEO } from './components/SEO';
import { SettingsMenu } from './components/SettingsMenu';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { ToastProvider } from './context/ToastContext';
import { ToastListener } from './components/ToastListener';
import { binanceService } from './services/binanceService';
import { PositionHeader } from './components/PositionHeader';
import type { NewsItem, Position } from './types';
import { websocketConfig } from './config/websocket';
import { Spotlight } from './components/Spotlight';
import { chartSymbolUpdateEvent } from './components/TradingPanel';

// Inner component - can use useSettings hook
function AppContent() {
  const { positionMode } = useSettings();
  const [positions, setPositions] = useState<Position[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showSpotlight, setShowSpotlight] = useState(false);
  const [filteredSymbol, setFilteredSymbol] = useState<string | null>(null);
  const [initialSpotlightValue, setInitialSpotlightValue] = useState<string>('');
  const [showFilterMessage, setShowFilterMessage] = useState(false);

  const fetchInitialNews = useCallback(async () => {
    try {
      console.log('[App] Fetching initial news via HTTP GET...');
      const response = await fetch(`${websocketConfig.baseUrls.news}/news?limit=1000`);
      if (!response.ok) {
        throw new Error('Failed to fetch initial news');
      }
      const newsData: NewsItem[] = await response.json();
      console.log(`[App] Received ${newsData.length} initial news items.`);
      
      newsService.addInitialNews(newsData);
    } catch (error) {
      console.error('Error fetching initial news:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialNews();
    newsService.connect();
    
    return () => {
      newsService.terminateWorker();
    };
  }, [fetchInitialNews]);

  useEffect(() => {
    const handleNewsUpdate = () => {
      const allNews = newsService.getAllNews();
      
      const filteredResults = filteredSymbol
        ? allNews.filter(item => {
            const symbols = (item.symbol || '').split(',').map(s => s.trim().toUpperCase());
            const titleMatch = (item.title || '').toUpperCase().includes(filteredSymbol);
            const descriptionMatch = (item.description || '').toUpperCase().includes(filteredSymbol);
            const symbolMatch = symbols.includes(filteredSymbol);
            return symbolMatch || titleMatch || descriptionMatch;
          })
        : allNews;
      
      const newTotalPages = Math.ceil(filteredResults.length / 20);
      setTotalPages(newTotalPages);
      
      const validPage = Math.min(currentPage, Math.max(1, newTotalPages));
      if (validPage !== currentPage) {
        setCurrentPage(validPage);
      }
      
      const startIndex = (validPage - 1) * 20;
      const endIndex = startIndex + 20;
      setNews(filteredResults.slice(startIndex, endIndex));
    };
    
    const unsubscribe = newsService.onNewsUpdate(handleNewsUpdate);
    
    handleNewsUpdate();
    
    return () => unsubscribe();
  }, [filteredSymbol, currentPage]);

  useEffect(() => {
    const unsubscribe = binanceService.onPositionUpdate((newPositions) => {
      setPositions(newPositions);
    });
    return () => unsubscribe();
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't do anything if we're in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Don't process if ctrl, alt, command or option keys are pressed
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      // Clear filter when ESC is pressed
      if (e.key === 'Escape' && filteredSymbol) {
        e.preventDefault();
        setFilteredSymbol(null);
        setShowFilterMessage(false);
        // Reset news to original state
        const allNews = newsService.getAllNews();
        setNews(allNews.slice(0, 20));
        setCurrentPage(1);
        setTotalPages(Math.ceil(allNews.length / 20));
        return;
      }

      // Open Spotlight when a letter/number key is pressed (not in input field)
      if (!showSpotlight && 
          (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) || e.key === 'Space'
      ) {
        e.preventDefault();
        setInitialSpotlightValue(e.key === 'Space' ? ' ' : e.key);
        setShowSpotlight(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSpotlight, filteredSymbol]);

  const handleSpotlightSearch = useCallback((query: string) => {
    if (query.trim()) {
      const processedQuery = query.trim().toUpperCase();
      
      // Check for opening position commands (3 words)
      const words = processedQuery.split(/\s+/);
      if (words.length === 3) {
        const [side, symbol, amount] = words;
        
        // Check for LONG or SHORT (case insensitive)
        if (side === 'LONG' || side === 'SHORT') {
          const processedSymbol = symbol.includes('USDT') ? symbol : `${symbol}USDT`;
          const notionalValue = amount.endsWith('K') ? parseInt(amount) * 1000 : parseInt(amount);
          
          // Open position
          binanceService.placeOrder({
            symbol: processedSymbol,
            side: side === 'LONG' ? 'BUY' : 'SELL',
            positionMode: positionMode,
            type: 'MARKET',
            leverage: notionalValue.toString()
          }).catch(error => {
            console.error('Order placement error:', error);
            alert(`Could not place order: ${error instanceof Error ? error.message : 'Unknown error'}`);
          });
          
          setShowSpotlight(false);
          return;
        }
      }
      
      // Normal symbol search
      const searchSymbol = processedQuery.includes('USDT') ? processedQuery : `${processedQuery}USDT`;
      setFilteredSymbol(searchSymbol);
      setShowFilterMessage(true);
      setShowSpotlight(false);
      
      // Get all news and filter
      const allNews = newsService.getAllNews();
      const filteredNews = allNews.filter(item => {
        const symbols = (item.symbol || '').split(',').map(s => s.trim().toUpperCase());
        const titleMatch = (item.title || '').toUpperCase().includes(searchSymbol);
        const descriptionMatch = (item.description || '').toUpperCase().includes(searchSymbol);
        const symbolMatch = symbols.includes(searchSymbol);
        
        return symbolMatch || titleMatch || descriptionMatch;
      });
      
      setNews(filteredNews);
      setCurrentPage(1);
      setTotalPages(Math.ceil(filteredNews.length / 20));

      // Update TradingView chart
      chartSymbolUpdateEvent.dispatchEvent(
        new CustomEvent('symbolChange', { detail: searchSymbol })
      );
    }
  }, [positionMode]);

  const handleSpotlightClose = useCallback(() => {
    setShowSpotlight(false);
    setInitialSpotlightValue('');
  }, []);

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    
    // Get page data from cache
    newsService.setPage(page);
  };

  // useEffect that tracks page changes and performs scrolling after content is loaded
  useEffect(() => {
    // Scroll the page after content is loaded (when news array is updated)
    if (!loading && news.length > 0) {
      setTimeout(() => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }, 100); // Add a small delay to wait for content to render
    }
  }, [currentPage, news, loading]);

  // Filter news based on symbol
  const filteredNews = filteredSymbol
    ? news.filter(item => {
        // Split the symbol field by comma and convert to array
        const symbols = (item.symbol || '').split(',').map(s => s.trim().toUpperCase());
        
        // Check for exact match in title and description
        const titleMatch = (item.title || '').toUpperCase().includes(filteredSymbol);
        const descriptionMatch = (item.description || '').toUpperCase().includes(filteredSymbol);
        const symbolMatch = symbols.includes(filteredSymbol);
        
        // Show news if there's an exact match in any of these
        return symbolMatch || titleMatch || descriptionMatch;
      })
    : news;

  // Filter temizleme fonksiyonunu ekleyelim
  const clearFilter = useCallback(() => {
    setFilteredSymbol(null);
    setShowFilterMessage(false);
    // Reset news to original state
    const allNews = newsService.getAllNews();
    setNews(allNews.slice(0, 20));
    setCurrentPage(1);
    setTotalPages(Math.ceil(allNews.length / 20));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-binance-black via-binance-darkgray to-binance-gray relative z-0">
      <SEO />
      {/* Header - reduced padding */}
      <header className="bg-binance-black sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-0.5">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-2">
              <Terminal className="h-6 w-6 sm:h-7 sm:w-7 text-binance-yellow flex-shrink-0" />
              <h1 className="text-base sm:text-xl font-bold bg-gradient-to-r from-binance-yellow to-binance-lightyellow bg-clip-text text-transparent whitespace-nowrap">
                Crypto Terminal
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <ConnectionStatus />
              <button
                onClick={() => setShowSpotlight(true)}
                className="p-2 rounded-lg bg-binance-gray hover:bg-binance-lightgray transition-all transform hover:-translate-y-1 duration-200"
                aria-label="Search"
              >
                <Search className="h-5 w-5 text-binance-yellow" />
              </button>
              <SettingsMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Position Header - same reduced padding */}
      <PositionHeader positions={positions} />

      {/* Main Content - balanced padding and gap */}
      <main className="max-w-7xl mx-auto px-2 py-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* News Feed */}
          <div className="relative z-10 lg:overflow-y-auto">
            <div className="space-y-6">
              {loading && news.length === 0 ? (
                <div className="p-4 rounded-lg bg-binance-darkgray bg-opacity-50 animate-pulse">
                  <p className="text-binance-yellow">Loading news...</p>
                </div>
              ) : (
                <>
                  {filteredNews.map(item => (
                    <NewsCard 
                      key={item.id} 
                      news={item}
                    />
                  ))}
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6">
                      {/* Previous Page Button */}
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="p-2 rounded-lg bg-binance-black/50 hover:bg-binance-black/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Previous Page"
                      >
                        <ChevronLeft className="w-5 h-5 text-binance-yellow" />
                      </button>
                      
                      {/* Page Numbers */}
                      <div className="flex items-center gap-2">
                        {(() => {
                          const pages = [];
                          const maxVisiblePages = 5;
                          
                          // Calculate visible page range
                          let startPage = Math.floor((currentPage - 1) / maxVisiblePages) * maxVisiblePages + 1;
                          let endPage = Math.min(startPage + maxVisiblePages - 1, totalPages);
                          
                          // Add page numbers
                          for (let i = startPage; i <= endPage; i++) {
                            pages.push(
                              <button
                                key={i}
                                onClick={() => handlePageChange(i)}
                                className={`px-3 py-1 rounded-lg transition-colors ${
                                  currentPage === i
                                    ? 'bg-binance-yellow text-black'
                                    : 'bg-binance-black/50 text-binance-yellow hover:bg-binance-black/70'
                                }`}
                              >
                                {i}
                              </button>
                            );
                          }
                          
                          return pages;
                        })()}
                      </div>
                      
                      {/* Next Page Button */}
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-lg bg-binance-black/50 hover:bg-binance-black/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Next Page"
                      >
                        <ChevronRight className="w-5 h-5 text-binance-yellow" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          
          {/* Trading Panel */}
          <div className="lg:sticky lg:top-[calc(64px+var(--position-header-height,0px))] lg:h-[calc(100vh-7rem)] relative z-30">
            <TradingPanel />
          </div>
        </div>
      </main>

      {/* Filter Message - Moved outside of the news feed container */}
      {showFilterMessage && filteredSymbol && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[100]">
          <div className="bg-binance-black/90 backdrop-blur-sm border border-binance-yellow/20 rounded-lg px-4 py-2 shadow-lg">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-binance-yellow">Filter:</span>
              <span className="text-white">{filteredSymbol}</span>
              <span className="hidden md:inline text-gray-400 text-xs">(Press ESC to clear)</span>
              <button
                onClick={clearFilter}
                className="ml-2 p-1 rounded-full hover:bg-binance-gray/50 transition-colors"
                aria-label="Clear filter"
              >
                <X className="w-4 h-4 text-gray-400 hover:text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spotlight */}
      {showSpotlight && (
        <Spotlight
          initialValue={initialSpotlightValue}
          onSearch={handleSpotlightSearch}
          onClose={handleSpotlightClose}
        />
      )}
    </div>
  );
}

// Outer component - provides the Providers
function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <ToastListener />
        <AppContent />
      </ToastProvider>
    </SettingsProvider>
  );
}

export default App;