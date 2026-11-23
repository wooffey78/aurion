module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  ignorePatterns: ['assets/js/package.json'],
  rules: {
    'no-undef': 'error',
    'no-const-assign': 'error',
    'no-dupe-keys': 'error'
  }
};
