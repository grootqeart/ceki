/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        felt: '#0b6e4f',
        feltDark: '#084a35',
      },
    },
  },
  plugins: [],
};
