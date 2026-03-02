import type { Config } from 'tailwindcss'
import forms from '@tailwindcss/forms'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        toolbar: 'auto auto minmax(0, 1fr)',
      },
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
