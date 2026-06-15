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
          pale:    '#E0F0E8',
        },
        accent:  '#4CAF82',
        danger:  { DEFAULT: '#DC2626', light: '#FEE2E2' },
        success: { DEFAULT: '#16A34A', light: '#DCFCE7' },
        warning: { DEFAULT: '#D97706', light: '#FEF3C7' },
        // CSS-var brand tokens — auto-switch light ↔ dark
        brand: {
          bg:      'var(--color-bg)',
          surface: 'var(--color-surface)',
          border:  'var(--color-border)',
          text:    'var(--color-text)',
          muted:   'var(--color-muted)',
          sidebar: 'var(--color-sidebar)',
        },
        // Explicit dark-mode palette (for dark: overrides in JSX)
        dark: {
          bg:      '#0C1A0C',
          surface: '#111F11',
          card:    '#162B16',
          border:  '#1E381E',
          hover:   '#1A2E1A',
          sidebar: '#0A180A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      minHeight: { touch: '44px' },
      minWidth:  { touch: '44px' },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-down': 'slideDown 0.22s ease-out',
        'slide-up':   'slideUp 0.22s ease-out',
        'scale-in':   'scaleIn 0.15s ease-out',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' },                               to: { opacity: '1' } },
        slideDown: { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(8px)' },  to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:   { from: { opacity: '0', transform: 'scale(0.95)' },      to: { opacity: '1', transform: 'scale(1)' } },
      },
      boxShadow: {
        'card':      '0 1px 3px 0 rgba(0,0,0,0.06),0 1px 2px -1px rgba(0,0,0,0.06)',
        'card-md':   '0 4px 12px -2px rgba(0,0,0,0.08),0 2px 4px -2px rgba(0,0,0,0.05)',
        'card-lg':   '0 10px 24px -4px rgba(0,0,0,0.1),0 4px 8px -4px rgba(0,0,0,0.06)',
        'dropdown':  '0 12px 28px -6px rgba(0,0,0,0.14),0 6px 12px -6px rgba(0,0,0,0.08)',
        'pill':      '0 2px 8px rgba(15,76,53,0.35)',
        'glow':      '0 0 0 3px rgba(15,76,53,0.25)',
        'glow-dark': '0 0 0 3px rgba(76,175,130,0.3)',
      },
    },
  },
  plugins: [],
}
