import { ExternalLink, TrendingUp, TrendingDown } from 'lucide-react';
import { NewsItem } from '../types';
import { binanceService } from '../services/binanceService';
import { useSettings, getSymbolTradeButtons } from '../context/SettingsContext';
import { useMarketData } from '../hooks/useMarketData';
import { chartSymbolUpdateEvent } from './TradingPanel';
import { useState, useEffect, useMemo } from 'react';

interface NewsCardProps {
  news: NewsItem;
}

// Helper function for relative time
const getTimeAgo = (timestamp: number): string => {
  const now = Date.now();
  const seconds = Math.floor((now - timestamp) / 1000);
  
  if (seconds < 60) {
    return `${seconds} sec ago`;
  } else if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} min ago`;
  } else if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)} hr ago`;
  } else {
    return `${Math.floor(seconds / 86400)} days ago`;
  }
};

// Format timestamp to human-readable full date and time with milliseconds
const formatTime = (timestamp: number | string): string => {
  // Ensure timestamp is a valid number
  const parsedTimestamp = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  
  // Check if the timestamp is valid
  if (isNaN(parsedTimestamp)) {
    console.error('Invalid timestamp:', timestamp);
    return 'Invalid timestamp';
  }
  
  try {
    const date = new Date(parsedTimestamp);
    
    // Validate the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date from timestamp:', parsedTimestamp);
      return 'Invalid date';
    }
    
    // Get day, month, year
    const day = date.getDate();
    const monthNames = ["January", "February", "March", "April", "May", "June", 
                       "July", "August", "September", "October", "November", "December"];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    
    // Get hours, minutes, seconds, milliseconds
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    
    // Format: "29 March 2025 03:08:19.886"
    return `${day} ${month} ${year} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return 'Error formatting date';
  }
};

// Helper function to parse Twitter special content from description if not already parsed
const parseTwitterContent = (description: string) => {
  // Ensure we have a valid string
  if (!description) return {
    description: '',
    quote: undefined,
    retweet: undefined,
    reply: undefined
  };
  
  // First decode any HTML entities that might be in the description
  // This is particularly important for content coming from the GET news endpoint
  const decodeHTMLEntities = (text: string): string => {
    if (!text) return '';
    
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    
    return textarea.value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");
  };
  
  // Decode HTML entities and ensure >>QUOTE markers are properly formatted
  let decodedDescription = decodeHTMLEntities(description);
  decodedDescription = decodedDescription.replace(/&gt;&gt;/g, '>>');
  
  let result = {
    description: decodedDescription,
    quote: undefined as { author: string; content: string } | undefined,
    retweet: undefined as { author: string; content: string } | undefined,
    reply: undefined as { author: string; content: string } | undefined
  };
  
  // If description starts with >>REPLY, it's a reply
  if (decodedDescription.startsWith('>>REPLY')) {
    const replyLine = decodedDescription.split('\n')[0]; // Get first line with ">>REPLY User"
    const replyToAuthor = replyLine.substring(7).trim(); // Remove ">>REPLY " prefix
    const replyContent = decodedDescription.split('\n').slice(1).join('\n').trim();
    
    result.reply = {
      author: replyToAuthor,
      content: replyContent
    };
    result.description = '';
  } 
  // If description starts with >>RT, it's a retweet (possibly with quote)
  else if (decodedDescription.startsWith('>>RT')) {
    const rtContent = decodedDescription.substring(4).trim(); // Skip '>>RT'
    const firstNewlineIndex = rtContent.indexOf('\n');
    const rtAuthor = firstNewlineIndex > 0 
      ? rtContent.substring(0, firstNewlineIndex).trim() 
      : 'Unknown';
    
    let retweetContent = firstNewlineIndex > 0
      ? rtContent.substring(firstNewlineIndex).trim()
      : rtContent;
    
    // Check if the retweet contains a quote
    if (retweetContent.includes('>>QUOTE')) {
      const [rtBeforeQuote, quoteContent] = retweetContent.split('>>QUOTE');
      const quoteAuthor = quoteContent.split('\n')[0].trim();
      const quoteText = quoteContent.split('\n').slice(1).join('\n').trim();
      
      result.quote = {
        author: quoteAuthor || 'Unknown',
        content: quoteText
      };
      
      retweetContent = rtBeforeQuote.trim();
    }
    
    result.retweet = {
      author: rtAuthor,
      content: retweetContent
    };
    result.description = '';
  } 
  // If description contains >>QUOTE but is not a retweet
  else if (decodedDescription.includes('>>QUOTE')) {
    const [beforeQuote, quoteContent] = decodedDescription.split('>>QUOTE');
    const quoteAuthor = quoteContent.split('\n')[0].trim();
    const quoteText = quoteContent.split('\n').slice(1).join('\n').trim();
    
    result.quote = {
      author: quoteAuthor || 'Unknown',
      content: quoteText
    };
    result.description = beforeQuote.trim();
  }
  
  return result;
};

export function NewsCard({ news }: NewsCardProps) {
  const symbols = news.symbol ? news.symbol.split(',').filter(Boolean) : [];
  const { positionMode, tradeButtons, globalTradeButtons, apiKey, priceChangeMode } = useSettings();
  
  // Ensure timestamp is a number
  const timestamp = typeof news.timestamp === 'string' 
    ? parseInt(news.timestamp, 10) 
    : news.timestamp;
    
  const [timeAgo, setTimeAgo] = useState<string>(getTimeAgo(timestamp));
  
  // Parse Twitter content from description if not already structured
  const twitterContent = useMemo(() => {
    return parseTwitterContent(news.description);
  }, [news.description]);
  
  // Combine pre-parsed content with parsed content from description
  const enrichedNews = useMemo(() => {
    return {
      ...news,
      description: news.description.startsWith('>>') || news.description.includes('&gt;&gt;QUOTE') 
        ? twitterContent.description 
        : news.description,
      quote: news.quote || twitterContent.quote,
      retweet: news.retweet || twitterContent.retweet,
      reply: news.reply || twitterContent.reply
    };
  }, [news, twitterContent]);
  
  // Update the time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(getTimeAgo(timestamp));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [timestamp]);
  
  const marketDataMap = symbols.reduce<Record<string, ReturnType<typeof useMarketData>>>((acc, symbol) => {
    acc[symbol] = useMarketData(symbol, priceChangeMode === 'news-time' ? timestamp : undefined);
    return acc;
  }, {});
  
  const handleTrade = async (symbol: string, side: 'BUY' | 'SELL', leverage: string) => {
    const marketData = marketDataMap[symbol];
    if (!marketData) {
      alert('Market data not available. Please try again.');
      return;
    }
    
    try {
      await binanceService.placeOrder({
        symbol,
        side,
        positionMode,
        type: "MARKET",
        leverage
      });
      console.log(`Market order placed: ${side} ${symbol}`);
    } catch (error: any) {
      console.error('Failed to place order:', error);
      alert(`Order failed: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleSymbolClick = (symbol: string) => {
    chartSymbolUpdateEvent.dispatchEvent(
      new CustomEvent('symbolChange', { detail: symbol })
    );
  };

  return (
    <div className="bg-gradient-to-br from-binance-gray to-binance-darkgray rounded-xl p-5 shadow-binance-card border border-binance-lightgray/20 hover:shadow-binance-glow transition-all duration-300 relative z-10">
      <div className="flex justify-between items-center mb-4">
        <div className="flex flex-col md:flex-row md:items-center">
          <div className="flex items-center">
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-binance-yellow/10 text-binance-yellow">
              {enrichedNews.source}
            </span>
            {enrichedNews.sourceName && (
              <span className="text-xs text-gray-300 ml-2">
                {enrichedNews.sourceName}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-300 mt-1 md:mt-0 md:ml-2">
            {formatTime(enrichedNews.timestamp)}
          </span>
        </div>
        
        <div className="flex items-center mt-0">
          <span className="text-xs text-gray-400 mr-2">{timeAgo}</span>
          <a
            href={enrichedNews.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-binance-yellow transition-colors"
          >
            <ExternalLink size={16} />
          </a>
        </div>
      </div>
      
      <h3 className="text-lg font-semibold mb-3 text-white">{enrichedNews.title}</h3>
      <div className="space-y-4">
        <div className="text-gray-300 text-sm">
          {enrichedNews.description.split('\n').filter(line => line.trim()).map((line, index) => {
            return <p key={index} className="mt-1 whitespace-pre-line">{line}</p>;
          })}
        </div>
        
        {/* Retweet should come first (before quote) */}
        {enrichedNews.retweet && (
          <div className="mt-4 p-4 border-l-4 border-binance-yellow/50 bg-binance-black/50 rounded-r-lg">
            <p className="text-sm text-gray-300">
              <strong className="text-binance-yellow">{enrichedNews.retweet.author}</strong><br />
              {enrichedNews.retweet.content.split('\n').map((line, index) => (
                <span key={index}>{line}<br /></span>
              ))}
            </p>
          </div>
        )}
        
        {/* Quote comes after retweet */}
        {enrichedNews.quote && (
          <div className="mt-4 p-4 border-l-4 border-binance-yellow/50 bg-binance-black/50 rounded-r-lg">
            <p className="text-sm text-gray-300">
              <strong className="text-binance-yellow">{enrichedNews.quote.author}</strong><br />
              {enrichedNews.quote.content.split('\n').map((line, index) => (
                <span key={index}>{line}<br /></span>
              ))}
            </p>
          </div>
        )}
        
        {enrichedNews.reply && (
          <div className="mt-4 p-4 border-l-4 border-binance-yellow/50 bg-binance-black/50 rounded-r-lg">
            <p className="text-sm text-gray-300">
              <strong className="text-binance-yellow">Reply to {enrichedNews.reply.author}</strong><br />
              {enrichedNews.reply.content.split('\n').map((line, index) => (
                <span key={index}>{line}<br /></span>
              ))}
            </p>
          </div>
        )}
      </div>
      
      {symbols.length > 0 && (
        <div className="mt-4 pt-4 border-t border-binance-lightgray/20">
          <div className="grid gap-3">
            {symbols.map(symbol => (
              <div key={symbol} className="bg-binance-black/40 backdrop-blur-sm rounded-lg px-3 py-3 md:px-4">
                <div className="space-y-3">
                  {/* Symbol, price, and percentage row - more responsive */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-2 md:gap-x-4">
                    <div className="flex-shrink-0 min-w-[80px] md:min-w-[120px]">
                      <a 
                        href={`https://www.binance.com/en/futures/${symbol}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handleSymbolClick(symbol)}
                        className="text-white hover:text-binance-yellow transition-colors cursor-pointer font-bold"
                      >
                        {symbol}
                      </a>
                    </div>
                    
                    {marketDataMap[symbol]?.price && (
                      <div className="min-w-[80px] md:min-w-[100px]">
                        <span 
                          className="text-white font-semibold cursor-pointer hover:text-binance-yellow transition-colors"
                          onClick={() => handleSymbolClick(symbol)}
                        >
                          ${binanceService.formatPrice(symbol, marketDataMap[symbol]?.price || '0')}
                        </span>
                      </div>
                    )}
                    
                    {marketDataMap[symbol]?.priceChangePercent && (
                      <div className="flex items-center">
                        <span 
                          className={`${
                            parseFloat(priceChangeMode === 'news-time' && marketDataMap[symbol]?.newsPriceChange
                              ? marketDataMap[symbol]?.newsPriceChange || '0'
                              : marketDataMap[symbol]?.priceChangePercent || '0') >= 0 
                              ? 'text-green-500' 
                              : 'text-red-500'
                          } font-medium flex items-center`}
                        >
                          {parseFloat(priceChangeMode === 'news-time' && marketDataMap[symbol]?.newsPriceChange
                            ? marketDataMap[symbol]?.newsPriceChange || '0'
                            : marketDataMap[symbol]?.priceChangePercent || '0') >= 0 ? (
                            <TrendingUp size={14} className="mr-1" />
                          ) : (
                            <TrendingDown size={14} className="mr-1" />
                          )}
                          {parseFloat(priceChangeMode === 'news-time' && marketDataMap[symbol]?.newsPriceChange
                            ? marketDataMap[symbol]?.newsPriceChange || '0'
                            : marketDataMap[symbol]?.priceChangePercent || '0').toFixed(2)}%
                          {priceChangeMode === 'news-time' && (
                            <span className="text-xs ml-1 text-gray-400">(news)</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Trading buttons - responsive grid - Only show if API key exists */}
                  {apiKey && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <div className="text-xs text-gray-400 font-medium">Long</div>
                        <div className="grid grid-cols-3 gap-1">
                          {getSymbolTradeButtons(tradeButtons, globalTradeButtons, symbol).long.map(lev => (
                            <button
                              key={`long-${lev}`}
                              onClick={() => handleTrade(symbol, 'BUY', lev)}
                              className="bg-green-500/20 hover:bg-green-500/30 text-green-500 
                                        py-1 px-2 rounded text-xs font-medium transition-colors"
                            >
                              {lev}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-xs text-gray-400 font-medium">Short</div>
                        <div className="grid grid-cols-3 gap-1">
                          {getSymbolTradeButtons(tradeButtons, globalTradeButtons, symbol).short.map(lev => (
                            <button
                              key={`short-${lev}`}
                              onClick={() => handleTrade(symbol, 'SELL', lev)}
                              className="bg-red-500/20 hover:bg-red-500/30 text-red-500 
                                        py-1 px-2 rounded text-xs font-medium transition-colors"
                            >
                              {lev}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}