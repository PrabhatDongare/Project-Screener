/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

// Airtable-style design system (see ../airtable-design.md). Values live in globals.css and flip with the
// theme, so components never need "dark:" variants.
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        // doc scale: sm 6 (inputs) / md 10 (content cards) / lg 12 (buttons + signature cards)
        sm: '6px',
        md: '10px',
        lg: '12px',
      },
      colors: {
        canvas: token('canvas'),
        panel: token('panel'),
        sunken: token('sunken'),      // surface-soft
        strong: token('strong'),      // surface-strong
        line: token('line'),          // hairline
        ink: token('ink'),
        body: token('body'),
        mute: token('mute'),
        faint: token('faint'),        // border-strong / placeholders
        primary: token('primary'),    // near-black CTA (white in dark mode)
        onprimary: token('onprimary'),
        link: token('link'),
        accent: token('link'),        // alias: links, focus, info
        infoborder: token('infoborder'),
        ok: token('ok'),
        okbg: token('okbg'),
        warn: token('warn'),
        warnbg: token('warnbg'),
        bad: token('bad'),
        badbg: token('badbg'),
        infobg: token('infobg'),
        sigdark: token('sigdark'),
        sigforest: token('sigforest'),
        sigcoral: token('sigcoral'),
        sigcream: token('sigcream'),
      },
    },
  },
  plugins: [],
};
