import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#14181F",
        muted: "#5A6475",
        border: "#D9DEE8",
        page: "#F2F4F8",
        accent: {
          DEFAULT: "#0F6B63",
          tint: "#E3F2F0",
        },
        warning: {
          bg: "#FDF1DC",
          text: "#5E3406",
          border: "#E8C99A",
        },
        danger: "#8A1F14",
        nice: {
          bg: "#EEF0F4",
          text: "#3D4656",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      minHeight: {
        touch: "44px",
      },
      minWidth: {
        touch: "44px",
      },
      borderRadius: {
        lg: "10px",
        xl: "14px",
        "2xl": "18px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(20, 24, 31, 0.04), 0 6px 20px rgba(20, 24, 31, 0.05)",
        overlay: "0 12px 40px rgba(20, 24, 31, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
