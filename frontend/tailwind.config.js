/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-dark': 'var(--brand-dark)',
        'brand-surface': 'var(--brand-surface)',
        'node-ingestion': 'var(--node-ingestion)',
        'node-training': 'var(--node-training)',
        'node-deployment': 'var(--node-deployment)',
      },
    },
  },
  plugins: [],
}