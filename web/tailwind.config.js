/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tokens sémantiques — changent automatiquement avec .dark sur <html>
        // Format "rgb(var(--x) / <alpha-value>)" permet l'usage d'opacités (bg-navy/20, etc.)
        bg:            "rgb(var(--bg) / <alpha-value>)",
        surface:       "rgb(var(--surface) / <alpha-value>)",
        "surface-alt": "rgb(var(--surface-alt) / <alpha-value>)",
        edge:          "rgb(var(--edge) / <alpha-value>)",
        primary:       "rgb(var(--primary) / <alpha-value>)",
        secondary:     "rgb(var(--secondary) / <alpha-value>)",
        muted:         "rgb(var(--muted) / <alpha-value>)",
        navy: {
          DEFAULT: "rgb(var(--navy) / <alpha-value>)",
          hover:   "rgb(var(--navy-hover) / <alpha-value>)",
        },
        accent:        "rgb(var(--accent) / <alpha-value>)",
        // Couleurs sémantiques finance — inchangées
        up:      "#22c55e",
        down:    "#ef4444",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
