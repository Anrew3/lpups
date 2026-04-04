/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}", "./electron/preload.ts"],
  theme: {
    extend: {
      colors: {
        brand: "#00c6ff",
      },
      fontFamily: {
        mono: ["'Cascadia Code'", "'Cascadia Mono'", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
