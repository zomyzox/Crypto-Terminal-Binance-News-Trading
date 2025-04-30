import { X, ExternalLink } from 'lucide-react';

interface InfoPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InfoPopup({ isOpen, onClose }: InfoPopupProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-binance-darkgray to-binance-black rounded-xl p-6 max-w-md w-full mx-4 relative border border-binance-yellow/20 shadow-binance-glow">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center space-y-4">
          <div className="space-y-4 mt-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-white">
                Crypto Terminal
              </h3>
              <p className="text-sm font-medium text-gray-400">
                Professional Trading Platform
              </p>
            </div>
            
            <div className="space-y-2 text-gray-300">
              <p>
                The platform is currently under development. You may experience some issues.
                The platform operates on a client-side basis, and your API keys are never transmitted
                or stored anywhere else.
              </p>
              
              <p>
                When creating your Binance API key, you only need to allow access from your IP address.
              </p>
              
              <p className="text-binance-yellow/80">
                The project will be fully open source in its final version.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 