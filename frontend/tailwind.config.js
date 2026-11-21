/** Design tokens taken from the approved reference screens (design-references/). */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        space: { 950: '#030712', 900: '#050b1c', 850: '#07102a', 800: '#0a1633', 700: '#0f1f45', 600: '#16295a' },
        panel: { DEFAULT: 'rgba(10, 20, 48, 0.72)', solid: '#0b1736', border: 'rgba(59, 113, 255, 0.28)', line: 'rgba(120, 150, 255, 0.12)' },
        accent: { red: '#ef2b45', redDeep: '#c81732', redGlow: 'rgba(239, 43, 69, 0.45)', blue: '#2f7bff', blueSoft: '#4c8dff',
                  cyan: '#22d3ee', amber: '#f5a524', green: '#22c55e', violet: '#8b5cf6', pink: '#ec4899', indigo: '#818cf8' },
        ink: { DEFAULT: '#e8eeff', muted: '#9fb0d6', faint: '#6b7ca8' },
      },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '14px' },
      boxShadow: {
        card: '0 0 0 1px rgba(59,113,255,0.22), 0 10px 30px -10px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05)',
        cardHover: '0 0 0 1px rgba(76,141,255,0.5), 0 18px 40px -12px rgba(0,0,0,0.7), 0 0 24px -6px rgba(47,123,255,0.45)',
        red: '0 0 0 1px rgba(239,43,69,0.55), 0 0 22px -4px rgba(239,43,69,0.55)',
        redSoft: '0 0 0 1px rgba(239,43,69,0.4), 0 10px 30px -10px rgba(0,0,0,0.6), 0 0 26px -10px rgba(239,43,69,0.6)',
      },
    },
  },
  plugins: [],
}
