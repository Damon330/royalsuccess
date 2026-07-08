/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Primary (sage/grass green) ────────────────────────────────────
        primary: {
          DEFAULT: '#84B84C',
          light:   '#A3CC6A',
          dark:    '#6B9A3A',
          pale:    '#EEF5E3',
        },
        // ── Accent (pink/magenta — sparing CTA only) ─────────────────────
        accent: {
          DEFAULT: '#E8559A',
          light:   '#F080B8',
          pale:    '#FDEEF6',
        },
        // ── Semantic ──────────────────────────────────────────────────────
        positive: { DEFAULT: '#5BA84F', bg: '#EBF6EA' },
        negative: { DEFAULT: '#E45B6E', bg: '#FDEAED' },
        danger:   { DEFAULT: '#E45B6E', light: '#FDEAED' },
        success:  { DEFAULT: '#5BA84F', light: '#EBF6EA' },
        warning:  { DEFAULT: '#D97706', light: '#FEF3C7' },
        // ── CSS-var brand tokens (auto-switch light ↔ dark) ───────────────
        brand: {
          bg:      'var(--color-bg)',
          surface: 'var(--color-surface)',
          border:  'var(--color-border)',
          text:    'var(--color-text)',
          muted:   'var(--color-muted)',
          label:   'var(--color-label)',
          sidebar: 'var(--color-sidebar)',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card:  '20px',
        inner: '12px',
      },
      minHeight: { touch: '44px' },
      minWidth:  { touch: '44px' },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-down': 'slideDown 0.22s ease-out',
        'scale-in':   'scaleIn 0.15s ease-out',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' },                               to: { opacity: '1' }                },
        slideDown: { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:   { from: { opacity: '0', transform: 'scale(0.95)' },      to: { opacity: '1', transform: 'scale(1)' }      },
      },
      boxShadow: {
        'xs':       '0 1px 2px rgba(0,0,0,0.04)',
        'soft':     '0 2px 8px rgba(0,0,0,0.06)',
        'card':     '0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        'card-md':  '0 6px 20px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)',
        'pill':     '0 2px 8px rgba(132,184,76,0.3)',
        'dropdown': '0 10px 30px rgba(0,0,0,0.1), 0 4px 10px rgba(0,0,0,0.05)',
        'inset-sm': 'inset 0 1px 2px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
}
