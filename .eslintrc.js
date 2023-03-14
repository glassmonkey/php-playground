module.exports = {
	env: {
		browser: true,
		es2021: true,
	},
	settings: {
		jsdoc: {
			tagNamePreference: {
				return: 'returns',
				internal: 'internal',
			},
		},
	},
	extends: [
		'eslint:recommended',
		'plugin:react/recommended',
		'plugin:@typescript-eslint/recommended',
	],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module',
	},
	root: true,
	ignorePatterns: [
		"src/php-wasm/__tests__/*.ts",
		"src/wasm/build-assets/*.js"
	],
	plugins: ['react', '@typescript-eslint'],
	rules: {
		'no-inner-declarations': 0,
		'no-use-before-define': 'off',
		'react/prop-types': 0,
		'no-console': 0,
		'no-empty': 0,
		'no-async-promise-executor': 0,
		'no-constant-condition': 0,
		'no-nested-ternary': 0,
		'jsx-a11y/click-events-have-key-events': 0,
		'jsx-a11y/no-static-element-interactions': 0,
		'@typescript-eslint/ban-ts-comment': 0,
		'@typescript-eslint/no-non-null-assertion': 0,
	},
};