/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef5fb',
          100: '#d7e8f5',
          200: '#b3d0e9',
          300: '#84b1d8',
          400: '#4f8cc4',
          500: '#2e6da8',
          600: '#1f5588',
          700: '#1a456e',
          800: '#173a5b',
          900: '#14304a',
          950: '#0c1f31',
        },
        navy: {
          800: '#13243b',
          900: '#0d1a2b',
          950: '#08111d',
        },
        gold: {
          50: '#fbf6e9',
          100: '#f5e9c8',
          200: '#ebd494',
          300: '#dfbd5e',
          400: '#d4a83c',
          500: '#c4932a',
          600: '#a87a23',
          700: '#855f20',
          800: '#6e4d21',
          900: '#5d4121',
        },
        status: {
          confirmed: '#2e6da8',
          inSaudi: '#2f855a',
          departing: '#b7791f',
          overdue: '#c53030',
          notArrived: '#718096',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'fade-in-delay-1': 'fadeInUp 0.6s ease-out 0.1s forwards',
        'fade-in-delay-2': 'fadeInUp 0.6s ease-out 0.2s forwards',
        'fade-in-delay-3': 'fadeInUp 0.6s ease-out 0.3s forwards',
        'fade-in-delay-4': 'fadeInUp 0.6s ease-out 0.4s forwards',
        'slide-in': 'slideIn 0.4s ease-out forwards',
        'scale-in': 'scaleIn 0.3s ease-out forwards',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
    },
  },
  plugins: [],
};
