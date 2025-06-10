module.exports = {
  theme: {
    extend: {
      colors: {
        text:      'var(--text)',
        background:'var(--background)',
        primary:   'var(--primary)',
        secondary: 'var(--secondary)',
        accent:    'var(--accent)',
      }
    }
  },
  plugins: [require('@tailwindcss/forms')],
};
