import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef5ff",
          100: "#d9e7ff",
          200: "#bcd4ff",
          300: "#8eb8ff",
          400: "#5992ff",
          500: "#336bff",
          600: "#1f4df5",
          700: "#1a3de0",
          800: "#1c36b5",
          900: "#1d358f",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Arial", "Heebo", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
