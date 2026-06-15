/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0F4C35',
          light:   '#1A6B4A',
          dark:    '#0A3526',
          pale:    '#E8F5EE',
        },
        accent:  '#F0A500',
        danger:  { DEFAULT: '#DC2626', light: '#FEE2E2' },
        success: { DEFAULT: '#16A34A', light: '#DCFCE7' },
        warning: { DEFAULT: '#D97706', light: '#FEF3C7' },
        // Light mode brand tokens
        brand: {
          bg:      'var(--color-bg)',
          surface: 'var(--color-surface)',
          border:  'var(--color-border)',
          text:    'var(--color-text)',
          muted:   'var(--color-muted)',
        },
        // Dark mode surface tokens (for explicit dark: overrides)
        dark: {
          bg:      '#0B1120',
          surface: '#141D2F',
          card:    '#1A2540',
          border:  '#1F2D45',
          hover:   '#1F2D45',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
        'slide-up':   'slideUp 0.2s ease-out',
        'scale-in':   'scaleIn 0.15s ease-out',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' },                              to: { opacity: '1' } },
        slideDown: { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(8px)' },  to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:   { from: { opacity: '0', transform: 'scale(0.95)' },     to: { opacity: '1', transform: 'scale(1)' } },
      },
      boxShadow: {
        'card':      '0 1px 3px 0 rgba(0,0,0,0.07), 0 1px 2px -1px rgba(0,0,0,0.07)',
        'card-md':   '0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.08)',
        'card-lg':   '0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.08)',
        'dropdown':  '0 10px 25px -5px rgba(0,0,0,0.12), 0 8px 10px -6px rgba(0,0,0,0.08)',
        'glow':      '0 0 0 3px rgba(15,76,53,0.2)',
        'glow-dark': '0 0 0 3px rgba(15,76,53,0.4)',
      },
    },
  },
  plugins: [],
}
