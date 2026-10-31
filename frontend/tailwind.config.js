/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#070b14',
          subtle: '#0a0f1d',
          card: 'rgba(13, 21, 39, 0.72)',
          header: 'rgba(9, 14, 26, 0.85)',
          sidebar: 'rgba(8, 13, 25, 0.92)'
        },
        brand: {
          red: '#e11d48',
          'red-bright': '#f43f5e',
          'red-glow': 'rgba(225, 29, 72, 0.35)',
          cyan: '#00f0ff',
          'cyan-muted': '#06b6d4',
          'cyan-glow': 'rgba(6, 182, 212, 0.25)',
          blue: '#1e40af',
          'blue-light': '#3b82f6'
        }
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.06)',
        'glass-hover': '0 14px 40px 0 rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(6, 182, 212, 0.25)',
        'neon-red': '0 0 18px rgba(225, 29, 72, 0.5), inset 0 0 8px rgba(225, 29, 72, 0.3)',
        'neon-cyan': '0 0 18px rgba(6, 182, 212, 0.4), inset 0 0 8px rgba(6, 182, 212, 0.2)',
        'card-3d': '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
