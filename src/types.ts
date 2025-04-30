export interface NewsItem {
  id: string;
  source: string;
  sourceName?: string; // Optional
  title: string;
  description: string;
  url: string;
  symbol?: string;
  timestamp: number;
  quote?: {
    author: string;
    content: string;
  };
  reply?: {
    author: string;
    content: string;
  };
  retweet?: {
    author: string;
    content: string;
  };
}

export interface LeverageInfo {
  symbol: string;
  leverage: string;
  maxNotionalValue: string;
}

export interface Position {
  id: string;
  symbol: string;
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  pnlPercentage: number;
  type: 'long' | 'short';
  leverage: string;
  liquidationPrice: number;
  breakEvenPrice: number;
  positionInitialMargin: number;
  notional: number;
  limitClosePrice?: number;
  marginType?: 'ISOLATED' | 'CROSSED';
}

export interface LeverageBracket {
  symbol: string;
  brackets: {
    bracket: number;
    initialLeverage: number;
    notionalCap: number;
    notionalFloor: number;
    maintMarginRatio: number;
    cum: number;
  }[];
}

export interface AccountBalance {
  accountAlias: string;
  asset: string;
  balance: string;
  crossWalletBalance: string;
  crossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
  marginAvailable: boolean;
  updateTime: number;
}