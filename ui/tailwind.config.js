/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],

  presets: [require("nativewind/preset")],

  theme: {
    extend: {
      colors: {
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
        hint: "#7D818D",
        field: "#F3F3F3",
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
      },
      borderRadius: {
        card: "20px",
        field: "12px",
      },
    },
  },

  plugins: [],
};
