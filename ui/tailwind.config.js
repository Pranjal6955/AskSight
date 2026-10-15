/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "media",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Deep forest green — white on it is 8.11:1 (AAA), on canvas 7.83:1 (AAA).
        brand: {
          DEFAULT: "#005B48",
          deep: "#004537",
          // Disabled-but-readable: white on it is still 5.91:1, so a disabled
          // button never drops below AA. Never signal state with opacity alone.
          muted: "#356E60",
          // Link text: 11.29:1 on canvas.
          link: "#0A4034",
        },
        // Warm off-white page background.
        canvas: "#FDFBF4",
        // Inputs are pure white so the field boundary is unmistakable.
        input: "#FFFFFF",
        // 7.56:1 against white — clears the 3:1 bar for a UI boundary.
        inputBorder: "#4B5563",
        ink: "#000000",
        muted: "#3C424D",
        // 6.24:1 on white / 6.03:1 on canvas — must never fall below 4.5:1,
        // the previous #7D818D sat at 3.76:1 and failed.
        hint: "#5C6168",
        field: "#F3F3F3",
        fieldBorder: "#4B5563",
        card: {
          green: "#E3EFE4",
          orange: "#FDF1DF",
          grey: "#F5F2EC",
        },
        tile: {
          green: "#005B48",
          orange: "#FECB8B",
          grey: "#E0DDD6",
        },
        accent: "#B33F01",
        // 7.10:1 on canvas, 7.35:1 on white.
        error: "#A02C01",
        avatar: "#DBECDF",
        focus: "#005B48",
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
