export const websocketConfig = {
  // WebSocket endpoints
  endpoints: {
    testnet: {
      binance: 'wss://testnet.binancefuture.com/ws-fapi/v1',
      marketData: 'wss://testnet.binancefuture.com/ws-fapi/v1'
    },
    mainnet: {
      binance: 'wss://ws-fapi.binance.com/ws-fapi/v1',
      marketData: 'wss://ws-fapi.binance.com/ws-fapi/v1'
    },
    news: 'wss://ws.cryptoterminal.io'  // Added real-time news websocket
  },

  baseUrls: {
    testnet: 'https://testnet.binancefuture.com',
    mainnet: 'https://fapi.binance.com',
    news: 'https://api.cryptoterminal.io' // Added news API base URL
  },

  // WebSocket methods
  methods: {
    balance: 'v2/account.balance',
    position: 'v2/account.position',
    ticker: 'ticker.price',
    orderPlace: 'order.place'
  },
  
  // Update intervals (in milliseconds)
  intervals: {
    marketPrice: 1000,  // Update market prices every second
    balance: 1000,      // Update balance every second
    positions: 1000     // Update positions every second
  },
  
  // WebSocket settings
  settings: {
    reconnectDelay: 1000,   // Reconnection delay (ms) - always 1 second
    maxRetries: Infinity,   // Unlimited reconnection attempts
    recvWindow: '5000',     // Binance API recv_window parameter
    heartbeatInterval: 1000, // Heartbeat check interval (ms)
    heartbeatTimeout: 5000, // Heartbeat timeout duration (ms)
    exponentialBackoff: false, // Exponential backoff disabled
    maxReconnectDelay: 1000  // Maximum reconnection delay 1 second
  },
  
  // Feature flags
  features: {
    continuousMarketUpdates: true  // Enable continuous market updates
  }
}