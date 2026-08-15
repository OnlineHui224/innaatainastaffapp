/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Enterprise blue — primary interactive colour */
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
        /* Deep navy — application chrome, headers, critical surfaces */
        navy: {
          50: '#f2f5f8',
          100: '#e2e8ef',
          200: '#c2cede',
          300: '#93a8c1',
          400: '#5d7793',
          500: '#38506e',
          600: '#27405c',
          700: '#1c3149',
          800: '#13243b',
          900: '#0d1a2b',
          950: '#08111d',
        },
        /* Gold — accent only. Never a navigation fill. */
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
        /* Reserved for genuine operational identifiers only */
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        /* Restrained radius scale — structural, not pill-shaped */
        DEFAULT: '3px',
        sm: '2px',
        md: '4px',
        lg: '6px',
        xl: '8px',
        '2xl': '10px',
      },
      boxShadow: {
        /* Minimal elevation — rules and borders carry the structure */
        panel: '0 1px 2px 0 rgb(13 26 43 / 0.04)',
        raised: '0 2px 6px -1px rgb(13 26 43 / 0.08), 0 1px 2px -1px rgb(13 26 43 / 0.04)',
        overlay: '0 12px 32px -8px rgb(8 17 29 / 0.28)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.25s ease-out forwards',
        'slide-in': 'slideIn 0.2s ease-out forwards',
        'scale-in': 'scaleIn 0.15s ease-out forwards',
        shimmer: 'shimmer 1.6s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-800px 0' },
          '100%': { backgroundPosition: '800px 0' },
        },
      },
    },
  },
  plugins: [],
};
