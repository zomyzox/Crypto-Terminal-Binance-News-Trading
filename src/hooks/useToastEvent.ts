import { useEffect } from 'react';
import { useToast } from '../context/ToastContext';

export function useToastEvent() {
  const { showToast } = useToast();

  useEffect(() => {
    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent<{ message: string; type: 'error' | 'success' | 'warning' }>;
      if (customEvent.detail) {
        showToast(customEvent.detail.message, customEvent.detail.type);
      }
    };

    if (typeof window !== 'undefined' && window.toastEvent) {
      window.toastEvent.addEventListener('showToast', handleToast);

      return () => {
        window.toastEvent.removeEventListener('showToast', handleToast);
      };
    }
  }, [showToast]);
} 