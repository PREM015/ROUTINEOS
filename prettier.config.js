module.exports = {
  singleQuote: true,
  // The codebase uses semicolons (917 of 921 source files), so the config must
  // match reality or `npm run format` rewrites the entire repository's style.
  semi: true,
  trailingComma: 'all',
  printWidth: 100,
  plugins: ['prettier-plugin-tailwindcss'],
};