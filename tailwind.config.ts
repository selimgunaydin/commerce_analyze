import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        muted: "#627084",
        line: "#d8dee8",
        panel: "#f7f9fc",
        accent: "#0f7b6c",
        warn: "#b7791f"
      }
    }
  },
  plugins: []
};

export default config;
