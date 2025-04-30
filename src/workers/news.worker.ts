// src/workers/news.worker.ts

// This file will manage the WebSocket connection

// WebSocket endpoint and settings (will be received from main thread)
let websocketUrl: string | null = null;
let websocketSettings: any = {}; 

let ws: WebSocket | null = null;
let retryCount = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let lastPongReceived = 0;
let shouldReconnect = true;
let connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

function connect() {
  if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
    console.log(`[Worker] WebSocket is already ${connectionStatus}`);
    return;
  }
  if (!websocketUrl) {
    console.error('[Worker] WebSocket URL is not set.');
    return;
  }
  
  shouldReconnect = true;
  connectionStatus = 'connecting';
  postMessage({ type: 'status', payload: connectionStatus });
  console.log('[Worker] Connecting to news WebSocket...');

  try {
    ws = new WebSocket(websocketUrl);

    const connectionTimeout = setTimeout(() => {
      if (connectionStatus === 'connecting') {
        console.log('[Worker] WebSocket connection timed out');
        handleDisconnect();
      }
    }, 10000); // 10s timeout

    ws.onopen = () => {
      console.log('[Worker] Connected to news WebSocket');
      connectionStatus = 'connected';
      postMessage({ type: 'status', payload: connectionStatus });
      retryCount = 0;
      clearTimeout(connectionTimeout);
      startHeartbeat();
      
      // Subscribe to news channel (optional, depends on server needs)
      // try {
      //   ws?.send(JSON.stringify({ type: 'subscribe', channel: 'news' }));
      // } catch (error) {
      //   console.error('[Worker] Error subscribing to news channel:', error);
      // }
    };

    ws.onmessage = (event) => {
      try {
        if (event.data === 'pong') {
          lastPongReceived = Date.now();
          // console.log('[Worker] Pong received');
          return;
        }
        // Send incoming news data to main thread
        const data = JSON.parse(event.data);
        postMessage({ type: 'news', payload: data }); 
      } catch (error) {
        console.error('[Worker] Error processing WebSocket message:', error, event.data);
      }
    };

    ws.onerror = (error) => {
      console.error('[Worker] News WebSocket error:', error);
      handleDisconnect();
    };

    ws.onclose = (event) => {
      console.log(`[Worker] News WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
      handleDisconnect();
    };
  } catch (error) {
    console.error('[Worker] Failed to create WebSocket connection:', error);
    connectionStatus = 'disconnected';
    postMessage({ type: 'status', payload: connectionStatus });
    handleDisconnect();
  }
}

function disconnect() {
  shouldReconnect = false;
  connectionStatus = 'disconnected';
  postMessage({ type: 'status', payload: connectionStatus });
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  stopHeartbeat();
  
  if (ws) {
    try {
      ws.close();
      console.log('[Worker] WebSocket connection closed by disconnect call.');
    } catch (error) {
      console.error('[Worker] Error during disconnect:', error);
    } finally {
      ws = null;
    }
  }
}

function handleDisconnect() {
  if (connectionStatus === 'disconnected' && !shouldReconnect) return; 

  stopHeartbeat();
  
  const previousStatus = connectionStatus;
  connectionStatus = 'disconnected';
  if (previousStatus !== 'disconnected') {
    postMessage({ type: 'status', payload: connectionStatus });
  }

  if (ws) {
     try {
       ws.onopen = null;
       ws.onmessage = null;
       ws.onerror = null;
       ws.onclose = null;
       if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
         ws.close();
         console.log('[Worker] WebSocket connection closed due to disconnect.');
       }
     } catch(e) {
       console.error('[Worker] Error closing socket during disconnect handling:', e);
     } finally {
        ws = null;
     }
  }

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (shouldReconnect) {
    retryCount++;
    const delay = calculateReconnectDelay();
    console.log(`[Worker] Attempting news WebSocket reconnect (attempt ${retryCount}) in ${delay}ms`);
    reconnectTimeout = setTimeout(() => connect(), delay);
  } else {
    console.log('[Worker] Reconnection disabled');
  }
}


function calculateReconnectDelay(): number {
  const baseDelay = websocketSettings.reconnectDelay || 1000;
  const maxDelay = websocketSettings.maxReconnectDelay || 15000;
  const useBackoff = websocketSettings.exponentialBackoff !== undefined ? websocketSettings.exponentialBackoff : true;

  if (!useBackoff) {
    return baseDelay;
  }

  const delay = Math.min(
    baseDelay * Math.pow(2, retryCount - 1),
    maxDelay
  );

  // Add jitter (randomness up to 500ms) to prevent thundering herd
  return delay + Math.random() * 500; 
}

function startHeartbeat() {
  stopHeartbeat(); // Clear any existing interval

  lastPongReceived = Date.now();

  pingInterval = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      try {
        ws.send('ping');
        // console.log('[Worker] Ping sent');
        const now = Date.now();
        if (now - lastPongReceived > (websocketSettings.heartbeatTimeout || 30000)) { // Use configured timeout or default
          console.log('[Worker] No pong received, reconnecting...');
          handleDisconnect();
        }
      } catch (error) {
        console.error('[Worker] Error sending ping:', error);
        handleDisconnect();
      }
    } else if (ws?.readyState === WebSocket.CLOSED || ws?.readyState === WebSocket.CLOSING) {
       console.log('[Worker] WebSocket is closed or closing during heartbeat, initiating reconnect...');
       handleDisconnect(); // Try to reconnect if closed during check
    }
  }, websocketSettings.heartbeatInterval || 15000); // Use configured interval or default
}

function stopHeartbeat() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
    // console.log('[Worker] Heartbeat stopped.');
  }
}

// Listen for messages from main thread
self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'init':
      websocketUrl = payload.websocketUrl;
      websocketSettings = payload.websocketSettings;
      console.log('[Worker] Initialized with URL:', websocketUrl, 'and Settings:', websocketSettings);
      connect();
      break;
    case 'connect':
      connect();
      break;
    case 'disconnect':
      disconnect();
      break;
    case 'send':
      if (ws?.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(payload));
        } catch (error) {
          console.error('[Worker] Error sending message:', error);
        }
      } else {
        console.warn('[Worker] WebSocket not open, cannot send message.');
      }
      break;
    default:
      console.warn('[Worker] Unknown message type received:', type);
  }
};

// Identify worker on startup
console.log('[Worker] News Worker script loaded.');

// Notify main thread on error
self.onerror = (event: ErrorEvent | Event | string) => {
  console.error("[Worker] Uncaught error in worker:", event);
  let errorMessage = 'Unknown worker error';
  if (event instanceof ErrorEvent) {
    errorMessage = event.message;
  } else if (typeof event === 'string') {
    errorMessage = event;
  } else if (event instanceof Event && event.type === 'error') {
    // Generic event, try to get some info
    errorMessage = `Generic error event: ${event.type}`;
  }
  postMessage({ type: 'error', payload: errorMessage });
};

// Termination request
self.onclose = () => {
    console.log("[Worker] Worker is closing.");
    disconnect(); // Clean up connection
}; 