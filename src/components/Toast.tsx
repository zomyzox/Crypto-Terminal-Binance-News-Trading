import { X } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'error' | 'success' | 'warning';
  onClose: () => void;
}

export function Toast({ message, type = 'error', onClose }: ToastProps) {
  const bgColor = {
    error: 'bg-binance-red/90',
    success: 'bg-binance-green/90',
    warning: 'bg-binance-yellow/90'
  }[type];

  const textColor = {
    error: 'text-white',
    success: 'text-black',
    warning: 'text-black'
  }[type];

  return (
    <div className={`fixed bottom-4 right-4 z-50 animate-slide-up`}>
      <div className={`${bgColor} rounded-lg shadow-lg p-4 flex items-center gap-3 min-w-[300px] max-w-[400px]`}>
        <div className={`flex-1 ${textColor} text-sm font-medium`}>
          {message}
        </div>
        <button
          onClick={onClose}
          className={`${textColor} hover:opacity-80 transition-opacity`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
} 