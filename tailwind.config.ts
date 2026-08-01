import type { Config } from 'tailwindcss'

/**
 * HabitHero — "Cozy" design system tokens.
 * Extracted from design/HabitHero Cozy.html: warm cream paper backgrounds,
 * brown ink text, a friendly blue primary, an amber XP/reward accent,
 * green success and a terracotta danger. Rounded, tactile, kid-friendly.
 */
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm paper / cream surfaces (page + card backgrounds)
        cream: {
          50: '#FFFDF6',
          100: '#FDFAF2',
          200: '#FBF5E9',
          300: '#F6EFE1',
          400: '#F0E5D3',
          500: '#E9DCC6',
          600: '#E4D5BD',
          700: '#E1D1B6',
        },
        // Brown ink — text + hairline borders
        ink: {
          900: '#3F3227',
          800: '#5C4B38',
          700: '#8C7961',
          600: '#98856D',
          500: '#A6947B',
          400: '#B4A38C',
          300: '#BDAC95',
        },
        // Primary — friendly blue
        primary: {
          300: '#A8CBEA',
          400: '#6FA8DC',
          500: '#4A93D6',
          600: '#3E86C9',
          700: '#27619B',
          DEFAULT: '#3E86C9',
        },
        // XP / reward / celebration — warm amber
        xp: {
          200: '#FFE0B0',
          300: '#FFD394',
          400: '#FFCB6B',
          500: '#F2A93B',
          600: '#C9891F',
          700: '#B0721A',
          DEFAULT: '#F2A93B',
        },
        // Success — green
        success: {
          100: '#E8F1DA',
          300: '#8BE0A8',
          400: '#6BA43C',
          500: '#4E8A34',
          DEFAULT: '#4E8A34',
        },
        // Danger / reject — terracotta
        danger: {
          100: '#FBE1D6',
          500: '#C0573A',
          DEFAULT: '#C0573A',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-cozy)',
          'Nunito',
          'Mali',
          'ui-rounded',
          '"SF Pro Rounded"',
          'system-ui',
          'sans-serif',
        ],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '28px',
        card: '20px',
        pill: '999px',
      },
      boxShadow: {
        // Soft warm ambient shadows
        soft: '0 2px 6px rgba(122,90,50,.10)',
        card: '0 12px 30px rgba(122,90,50,.14)',
        pop: '0 5px 0 rgba(233,220,198,1)',
      },
      backgroundImage: {
        'xp-fill': 'linear-gradient(135deg,#F2A93B,#FFD394)',
        'primary-fill': 'linear-gradient(135deg,#3E86C9,#6FA8DC 60%,#A8CBEA)',
        'success-fill': 'linear-gradient(135deg,#6BA43C,#8BE0A8)',
        // Candy stripe for the XP bar — exact design values.
        'xp-candy': 'repeating-linear-gradient(115deg,#F2A93B 0 14px,#FFCB6B 14px 28px)',
      },
      keyframes: {
        // Diagonal sheen sweeping across the XP fill.
        xpShine: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
        // Candy stripe sliding along the XP fill (design: hh-stripe).
        hhStripe: {
          from: { backgroundPosition: '0 0' },
          to: { backgroundPosition: '62px 0' },
        },
        // Pulsing glow around the streak chip (design: hh-glow).
        hhGlow: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(242,169,59,.45)' },
          '50%': { boxShadow: '0 0 0 8px rgba(255,149,0,0)' },
        },
        // Right slide-out drawer entrance (design: hh-slide).
        hhSlide: {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        xpShine: 'xpShine 2.4s ease-in-out infinite',
        hhStripe: 'hhStripe 4.5s linear infinite',
        hhGlow: 'hhGlow 2s ease-in-out infinite',
        hhSlide: 'hhSlide 0.22s ease-out',
      },
    },
  },
  plugins: [],
}

export default config
