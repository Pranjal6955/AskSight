/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#000000",
          deep: "#000000",
          muted: "#404040",
          link: "#000000",
        },
        canvas: "#FAF7F0",
        input: "#FFFFFF",
        inputBorder: "#737373",
        ink: "#000000",
        muted: "#404040",
        hint: "#404040",
        field: "#F2F2F2",
        fieldBorder: "#737373",
        card: {
          green: "#F2F2F2",
          orange: "#F2F2F2",
          grey: "#F2F2F2",
        },
        tile: {
          green: "#000000",
          orange: "#F2F2F2",
          grey: "#F2F2F2",
        },
        accent: "#000000",
        error: "#B42318",
        avatar: "#F2F2F2",
        focus: "#000000",
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
