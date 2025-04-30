import { useEffect, useRef, memo } from 'react';

declare global {
  interface Window {
    TradingView?: any;
  }
}

interface TradingViewWidgetProps {
  symbol?: string;
}

function TradingViewWidget({ symbol = "BINANCE:BTCUSDT.P" }: TradingViewWidgetProps) {
  const container = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const chartId = useRef<string>(`tradingview_${Math.random().toString(36).substring(2, 9)}`);

  useEffect(() => {
    if (!container.current) return;
    
    // More thorough cleanup
    const cleanupPreviousChart = () => {
      // Remove all child elements from the container
      if (container.current) {
        while (container.current.firstChild) {
          container.current.removeChild(container.current.firstChild);
        }
      }
      
      // Remove any previous TradingView objects from global scope
      if (window.TradingView) {
        // Attempt to clean up TradingView global objects (if any)
        try {
          Object.keys(window).forEach((key) => {
            if (key.startsWith('tradingview_')) {
              delete (window as any)[key];
            }
          });
        } catch (e) {
          console.warn('Failed to clean up TradingView objects:', e);
        }
      }
    };

    // Clean up everything before recreating
    cleanupPreviousChart();
    
    // Create new container structure
    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container__widget';
    widgetContainer.style.height = '100%'; // Reduced from 32px to 16px
    widgetContainer.style.width = '100%';
    widgetRef.current = widgetContainer;
    
    const copyrightContainer = document.createElement('div');
    copyrightContainer.className = 'tradingview-widget-copyright text-xs text-gray-500 text-center';
    
    const link = document.createElement('a');
    link.href = 'https://www.tradingview.com/';
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    link.className = 'text-gray-500 hover:text-gray-400';
    
    copyrightContainer.appendChild(link);
    
    // Add elements to the main container
    container.current.appendChild(widgetContainer);
    container.current.appendChild(copyrightContainer);
    
    // Create script with delay to ensure DOM is ready
    setTimeout(() => {
      // Create new script element
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.type = 'text/javascript';
      script.async = true;
      script.innerHTML = `
        {
          "autosize": true,
          "symbol": "${symbol}",
          "interval": "1",
          "timezone": "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "backgroundColor": "rgba(0, 0, 0, 1)",
          "gridColor": "rgba(0, 0, 0, 1)",
          "hide_top_toolbar": true,
          "allow_symbol_change": false,
          "save_image": false,
          "calendar": false,
          "hide_volume": true,
          "support_host": "https://www.tradingview.com",
          "container_id": "${chartId.current}"
        }`;
        
      scriptRef.current = script;
      
      if (widgetRef.current) {
        widgetRef.current.id = chartId.current;
        widgetRef.current.appendChild(script);
      }
    }, 200); // Increased delay for better cleanup
    
    return () => {
      cleanupPreviousChart();
    };
  }, [symbol]);

  return (
    <div className="tradingview-widget-container h-[380px]" ref={container}></div> // Reduced from 400px to 380px
  );
}

export default memo(TradingViewWidget);

export { TradingViewWidget };