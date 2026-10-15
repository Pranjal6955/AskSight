/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "media",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Light theme (default)
        brand: {
          DEFAULT: "#08513F",
          deep: "#073E2F",
          link: "#0A4034",
        },
        canvas: "#FDFBF4",
        mint: "#EFF4EA",
        peach: "#FEE6C5",
        ink: "#000000",
        muted: "#3C424D",
        hint: "#5C6168",
        field: "#F3F3F3",
        fieldBorder: "#D1D5DB",
        card: {
          green: "#E3EFE4",
          orange: "#FDF1DF",
          grey: "#F5F2EC",
        },
        tile: {
          green: "#08513F",
          orange: "#FECB8B",
          grey: "#E0DDD6",
        },
        accent: "#B33F01",
        avatar: "#DBECDF",
        error: "#B33F01",
        focus: "#08513F",
        // Dark theme variants via dark: prefix
      },
      borderRadius: {
        card: "20px",
        field: "12px",
      },
      minWidth: {
        touch: "44px",
      },
      minHeight: {
        touch: "44px",
      },
    },
  },
  plugins: [],
};