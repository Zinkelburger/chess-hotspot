// tailwind.config.ts
import type { Config } from 'tailwindcss'
import forms from '@tailwindcss/forms'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        text:       'var(--text)',
        background: 'var(--background)',
        primary:    'var(--primary)',
        secondary:  'var(--secondary)',
        accent:     'var(--accent)',
      },
      fontFamily: {
        sans: ['"Ubuntu"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [forms],
}

export default config
