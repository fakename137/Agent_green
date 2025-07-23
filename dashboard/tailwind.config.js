module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './public/index.html',
  ],
  theme: {
    extend: {
      fontFamily: {
        degen: [
          'Orbitron',
          'Press Start 2P',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace',
        ],
      },
      colors: {
        neon: {
          pink: '#ff00cc',
          blue: '#00eaff',
          green: '#00ff99',
          purple: '#a259ff',
        },
        glass: 'rgba(255,255,255,0.08)',
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
        neon: '0 0 16px #ff00cc, 0 0 32px #00eaff',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
};
