/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
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
        brand: {
          bg:      '#F3F4F6',
          surface: '#FFFFFF',
          border:  '#E5E7EB',
          text:    '#111827',
          muted:   '#6B7280',
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
    },
  },
  plugins: [],
}
