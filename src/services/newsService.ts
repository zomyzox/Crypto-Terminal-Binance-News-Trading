import { websocketConfig } from '../config/websocket';
import type { NewsItem } from '../types';

function decodeHTMLEntities(text: string): string {
  if (!text) return '';
  
  // First use the textarea trick for standard HTML entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  
  // Then perform additional replacements for specific cases
  const decoded = textarea.value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8216;/g, "'")  // Left single smart quote
    .replace(/&#8217;/g, "'")  // Right single smart quote
    .replace(/&#8220;/g, '"')  // Left double smart quote
    .replace(/&#8221;/g, '"')  // Right double smart quote
    // Handle JSON-escaped Unicode sequences
    .replace(/\\u([0-9a-fA-F]{4})|\\u\{([0-9a-fA-F]+)\}/g, (_, hex4, hexN) => {
      const codePoint = parseInt(hex4 || hexN, 16);
      return String.fromCodePoint(codePoint);
    })
    .replace(/\\n/g, '\n')  // Replace literal \n with newline
    .replace(/\n\s*\n\s*\n/g, '\n\n')  // Normalize multiple newlines to max 2
    .replace(/\s+$/gm, '')  // Remove trailing whitespace from each line
    .trim()
    .normalize('NFC');  // Normalize Unicode composition
  
  return decoded;
}

// Helper function to parse Twitter special content (>>QUOTE, >>REPLY, >>RT)
function parseTwitterContent(description: string) {
  // Ensure description is a non-null string
  if (!description) return { description: '', quote: undefined, retweet: undefined, reply: undefined };
  
  // Ensure >>QUOTE and other markers are properly decoded
  description = description.replace(/&gt;&gt;/g, '>>');
  
  let quote = undefined;
  let retweet = undefined;
  let reply = undefined;
  let processedDescription = description;
  
  // Parse reply format
  if (description.startsWith('>>REPLY')) {
    const replyLine = description.split('\n')[0]; 
    const replyToAuthor = replyLine.substring(7).trim(); 
    
    const replyContent = description.split('\n').slice(1).join('\n').trim();
    
    reply = {
      author: replyToAuthor,
      content: replyContent
    };
    
    processedDescription = '';
  } 
  // Parse retweet format (possibly with quote)
  else if (description.startsWith('>>RT')) {
    const rtContent = description.substring(4).trim(); 
    
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
      
      quote = {
        author: quoteAuthor || 'Unknown',
        content: quoteText
      };
      
      retweetContent = rtBeforeQuote.trim();
    }
      
    retweet = {
      author: rtAuthor,
      content: retweetContent
    };
    
    processedDescription = '';
  } 
  // Parse standalone quote format
  else if (description.includes('>>QUOTE')) {
    const [beforeQuote, quoteContent] = description.split('>>QUOTE');
    const quoteAuthor = quoteContent.split('\n')[0].trim();
    const quoteText = quoteContent.split('\n').slice(1).join('\n').trim();
    
    quote = {
      author: quoteAuthor || 'Unknown',
      content: quoteText
    };
    
    processedDescription = beforeQuote.trim();
  }
  
  return {
    description: processedDescription,
    quote,
    retweet,
    reply
  };
}

type NewsHandler = (news: NewsItem[]) => void;

class NewsService {
  private worker: Worker | null = null;
  private newsCache: Map<string, NewsItem> = new Map();
  private newsHandlers: NewsHandler[] = [];
  private currentPage = 1;
  private itemsPerPage = 20;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

  connect() {
    if (this.worker) {
        console.log('News worker is already running or attempting to connect.');
        // If worker exists and connection status is disconnected, send connect message
        if (this.connectionStatus === 'disconnected') {
           this.worker.postMessage({ type: 'connect' });
        }
        return;
    }

    console.log('Initializing News Worker...');
    
    // Worker import syntax for modern build tools like Vite/Webpack
    // ?worker=true&inline=true suffixes might vary based on the build tool.
    // Check build config if necessary.
    this.worker = new Worker(new URL('../workers/news.worker.ts', import.meta.url), { type: 'module' });

    this.worker.onmessage = (event: MessageEvent) => {
      const { type, payload } = event.data;

      switch (type) {
        case 'news':
          // Process raw news data from worker
          const processedItem = this.processNewsItem(payload);
          this.newsCache.set(processedItem.id, processedItem);
          // Just trigger handlers instead of resetting page number?
          // Better to keep the user on their current page.
          // this.currentPage = 1; 
          this.notifyHandlers();
          break;
        case 'status':
          // Update connection status from worker
          this.connectionStatus = payload;
          console.log(`[Main] News Worker status: ${this.connectionStatus}`);
          // Optional: Call handlers to reflect status changes in UI
          break;
        case 'error':
          console.error('[Main] Error message from News Worker:', payload);
          // Optional: Reflect error status in UI
          break;
        default:
          console.warn('[Main] Unknown message type received from worker:', type);
      }
    };

    this.worker.onerror = (error) => {
      console.error('[Main] Error in News Worker:', error);
      this.connectionStatus = 'disconnected';
      // Clean up and try to restart when worker errors?
      this.terminateWorker(); // Clean up worker
      // Maybe add a retry mechanism here
    };

    // Start worker and send necessary information
    this.worker.postMessage({
      type: 'init',
      payload: {
        websocketUrl: websocketConfig.endpoints.news,
        websocketSettings: websocketConfig.settings
      }
    });
    
    // Old visibility change handler removed, worker makes this unnecessary.
    // document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  disconnect() {
    console.log('[Main] Disconnecting News Worker...');
    this.worker?.postMessage({ type: 'disconnect' });
    // Sending message instead of immediately terminating the worker.
    // Can call terminateWorker if needed.
    // this.terminateWorker(); 
  }

  terminateWorker() {
    if (this.worker) {
        console.log('[Main] Terminating News Worker.');
        this.worker.terminate();
        this.worker = null;
        this.connectionStatus = 'disconnected';
    }
  }

  // News processing logic remains the same
  private processNewsItem(item: any): NewsItem {
    // Ensure the incoming item is in NewsItem format (add validation if needed)
    let timestamp: number;
    try {
      timestamp = typeof item.timestamp === 'string' 
        ? parseInt(item.timestamp, 10) 
        : Number(item.timestamp); // Safer type conversion with Number()
      
      if (isNaN(timestamp)) {
        console.error('Invalid timestamp for news item:', item.id);
        timestamp = Date.now();
      }
    } catch (e) {
      console.error('Error parsing timestamp:', e);
      timestamp = Date.now();
    }
    
    const decodedDescription = decodeHTMLEntities(item.description || '');
    const decodedSourceName = item.sourceName ? decodeHTMLEntities(item.sourceName) : undefined;
    const decodedTitle = decodeHTMLEntities(item.title || '');
    
    const { description, quote, retweet, reply } = parseTwitterContent(decodedDescription);
    
    return {
      id: item.id, // Make sure ID is received
      source: item.source, 
      sourceName: decodedSourceName,
      title: decodedTitle,
      description: description,
      url: item.url, // Make sure URL is received
      symbol: item.symbol || '',
      timestamp: timestamp,
      reply: reply,
      retweet: retweet,
      quote: quote
    };
  }

  private notifyHandlers() {
    const allNews = Array.from(this.newsCache.values())
      .sort((a, b) => b.timestamp - a.timestamp);
    
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    const pageNews = allNews.slice(startIndex, endIndex);
    
    this.newsHandlers.forEach(handler => {
        try {
            handler(pageNews);
        } catch (error) {
            console.error("Error in news handler:", error);
        }
    });
  }

  onNewsUpdate(handler: NewsHandler): () => void {
    this.newsHandlers.push(handler);
    
    // Immediately call handler with current cache
    if (this.newsCache.size > 0) {
      const sortedNews = Array.from(this.newsCache.values())
        .sort((a, b) => b.timestamp - a.timestamp);
      const pageNews = sortedNews.slice(0, this.itemsPerPage); // Send first page
       try {
           handler(pageNews);
       } catch (error) {
           console.error("Error calling initial news handler:", error);
       }
    }

    return () => {
      this.newsHandlers = this.newsHandlers.filter(h => h !== handler);
    };
  }
  
  // This method's purpose might change since worker directly manages the cache
  // Either remove it or use it to trigger initial load by sending a message to worker?
  // Commenting out for now, App.tsx's fetchInitialNews can be adjusted accordingly.
  /*
  addInitialNews(newsItems: NewsItem[]) {
      newsItems.forEach(item => {
          const processedItem = this.processNewsItem(item);
          this.newsCache.set(processedItem.id, processedItem);
      });
      // Notify handlers after initial news is added
      this.notifyHandlers(); 
  }
  */
  // Function to add initial news from HTTP GET request
  addInitialNews(newsItems: NewsItem[]) {
    console.log(`[Main] Adding ${newsItems.length} initial news items from HTTP fetch.`);
    let addedCount = 0;
    newsItems.forEach(item => {
        // Only add news that aren't already in cache (ID check)
        // Worker might have sent a more recent version, so this check is important.
        if (!this.newsCache.has(item.id)) {
            try {
                const processedItem = this.processNewsItem(item);
                this.newsCache.set(processedItem.id, processedItem);
                addedCount++;
            } catch (error) {
                console.error("[Main] Error processing initial news item:", error, item);
            }
        }
    });
    // Only notify handlers if new news was added
    if (addedCount > 0) {
        console.log(`[Main] Added ${addedCount} new items to cache from HTTP fetch.`);
        this.notifyHandlers();
    }
  }

  setPage(page: number) {
    const totalPages = this.getTotalPages();
    if (page > 0 && page <= totalPages) {
      this.currentPage = page;
      this.notifyHandlers(); // Call handlers again when page changes
    }
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  getTotalPages(): number {
    const totalItems = this.newsCache.size;
    return Math.ceil(totalItems / this.itemsPerPage);
  }

  getTotalItems(): number {
    return this.newsCache.size;
  }

  // Get all news (for example, can be used for filtering in App.tsx)
  getAllNews(): NewsItem[] {
    return Array.from(this.newsCache.values())
           .sort((a, b) => b.timestamp - a.timestamp);
  }

  getConnectionStatus(): 'disconnected' | 'connecting' | 'connected' {
    return this.connectionStatus;
  }
}

export const newsService = new NewsService();