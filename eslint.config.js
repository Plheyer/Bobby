const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
    expoConfig,
    {
        rules: {
            'react-native/no-inline-styles': 'off',
            'react/react-in-jsx-scope': 'off',
        },
    },
    prettierRecommended,
]);
