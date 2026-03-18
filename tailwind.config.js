/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Inter", "sans-serif"],
            },
            colors: {
                // Learnify brand — Blue (đẹp, chuyên nghiệp)
                brand: {
                    50: "#eff6ff",
                    100: "#dbeafe",
                    200: "#bfdbfe",
                    300: "#93c5fd",
                    400: "#60a5fa",
                    500: "#3b82f6",   // blue-500
                    600: "#2563eb",   // primary CTA
                    700: "#1d4ed8",
                    800: "#1e40af",
                    900: "#1e3a8a",
                    950: "#172554",
                },
                // Learnify accent — Green
                accent: {
                    DEFAULT: "#16a34a",
                    light: "#22c55e",
                    dark: "#15803d",
                },
                // Light surfaces
                surface: {
                    DEFAULT: "#f1f5f9",   // nền xám xanh nhạt
                    card: "#ffffff",
                    border: "#e2e8f0",
                    muted: "#94a3b8",
                    nav: "#1e293b",   // topbar navy
                },
            },
            backgroundImage: {
                "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
                // Blue gradient CTA
                "gradient-brand":
                    "linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)",
            },
            boxShadow: {
                card: "0 1px 4px 0 rgba(0,0,0,0.07)",
                md: "0 4px 16px 0 rgba(0,0,0,0.10)",
            },
            animation: {
                "fade-in": "fadeIn 0.4s ease-in-out",
                "slide-up": "slideUp 0.3s ease-out",
            },
            keyframes: {
                fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
                slideUp: { "0%": { transform: "translateY(16px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
            },
        },
    },
    plugins: [],
};
