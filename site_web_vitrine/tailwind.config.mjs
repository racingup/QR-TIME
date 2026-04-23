/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Inter Display"', 'Inter', 'sans-serif'],
      },
      colors: {
        ink: {
          50: '#F7F7F8',
          100: '#ECEDEF',
          200: '#D6D8DC',
          300: '#B1B5BC',
          400: '#7E8591',
          500: '#565E6B',
          600: '#3C434E',
          700: '#2A2F38',
          800: '#1A1D24',
          900: '#0D0F14',
        },
        brand: {
          DEFAULT: '#1F5F82',
          soft: '#3A7BA0',
          deep: '#13455F',
        },
        accent: {
          DEFAULT: '#7BB342',
          soft: '#98C65F',
          deep: '#5F9030',
        },
        swiss: '#DA291C',
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        glass: '0 1px 0 0 rgba(255,255,255,0.6) inset, 0 8px 32px -8px rgba(13,15,20,0.12)',
        'glass-lg': '0 1px 0 0 rgba(255,255,255,0.7) inset, 0 20px 60px -20px rgba(13,15,20,0.22)',
        soft: '0 1px 2px rgba(13,15,20,0.04), 0 8px 24px -12px rgba(13,15,20,0.08)',
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      fontSize: {
        'display-xl': ['clamp(3rem, 6vw, 5.25rem)', { lineHeight: '1.02', letterSpacing: '-0.03em' }],
        'display-lg': ['clamp(2.25rem, 4vw, 3.5rem)', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
        'display-md': ['clamp(1.75rem, 2.5vw, 2.25rem)', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
      },
    },
  },
  plugins: [],
};
