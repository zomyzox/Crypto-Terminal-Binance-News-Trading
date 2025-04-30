/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        binance: {
          yellow: '#F0B90B',
          lightyellow: '#F8D12F',
          black: '#0B0E11',
          darkgray: '#1E2329',
          gray: '#2B3139',
          lightgray: '#474D57',
          green: '#03A66D',
          red: '#CF304A',
          blue: '#0ECB81',
        },
        'binance-black': '#0B0E11',
        'binance-darkgray': '#1E2329',
        'binance-gray': '#2B3139',
        'binance-yellow': '#FCD535',
        'binance-lightyellow': '#FDE272',
        'binance-red': '#F6465D',
        'binance-green': '#0ECB81',
      },
      boxShadow: {
        'binance-3d': '0 4px 0 0 rgba(0, 0, 0, 0.2)',
        'binance-3d-hover': '0 7px 0 0 rgba(0, 0, 0, 0.2)',
        'binance-card': '0 8px 16px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.1)',
        'binance-glow': '0 0 20px rgba(240, 185, 11, 0.3)',
      },
      animation: {
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 3s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out forwards',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
