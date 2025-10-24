import { fixupConfigRules, fixupPluginRules } from "@eslint/compat";
import react from "eslint-plugin-react";
import reactHooksPkg from "eslint-plugin-react-hooks";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import jsxa11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-plugin-prettier";
import cssModules from "eslint-plugin-css-modules";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const { configs: reactHooksConfigs } = reactHooksPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: ["**/public/**/*", "**/coverage", "**/.local", "coverage/*", "**/.venv"],
  },
  ...fixupConfigRules(compat.extends("prettier", "plugin:jsx-a11y/recommended")),
  ...reactHooksConfigs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      react,
      "@typescript-eslint": typescriptEslint,
      prettier,
      jsxa11y,
      "css-modules": fixupPluginRules(cssModules),
    },

    languageOptions: {
      globals: {
        ...globals.browser,
      },

      parser: tsParser,
      ecmaVersion: 2021,
      sourceType: "module",

      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    settings: {
      react: {
        version: "detect",
      },
    },

    rules: {
      "no-warning-comments": [
        "error",
        {
          terms: ["fixme", "tbd", "xxx"],
          location: "anywhere",
        },
      ],

      // Add recommended CSS Modules rules
      ...cssModules.configs.recommended.rules,

      // User's specific CSS Modules rules (these will override recommended if there are conflicts)
      "css-modules/no-undef-class": ["error", { camelCase: true }],
      "css-modules/no-unused-class": ["error", { camelCase: true }],

      "no-implied-eval": "error",
      "no-bitwise": "error",
      "no-eval": "error",
      "no-extend-native": "error",
      "no-array-constructor": "error",
      "no-caller": "error",

      "no-constant-condition": [
        "error",
        {
          checkLoops: false,
        },
      ],

      "no-empty": [
        "error",
        {
          allowEmptyCatch: true,
        },
      ],

      "no-extra-bind": "error",
      "no-extra-label": "error",

      "no-implicit-coercion": [
        "error",
        {
          string: true,
          boolean: false,
          number: false,
        },
      ],

      "no-implicit-globals": "error",
      "no-label-var": "error",
      "no-loop-func": "error",
      "no-multi-spaces": "error",
      "no-multi-str": "error",
      "no-new": "error",
      "no-new-func": "error",
      "no-new-object": "error",
      "no-new-wrappers": "error",
      "no-octal-escape": "error",
      "no-proto": "error",
      "no-prototype-builtins": "error",

      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-redux",
              importNames: ["useSelector", "shallowEqual"],
              message:
                "Use useAppSelector() instead of useSelector(), and refEqual()/shallowEqual()/deepEqual() from useAppSelector.ts versus other locations. These functions provide better app-specific defaults.",
            },
            {
              name: "assert",
              importNames: ["deepEqual"],
              message: "Use 'useAppSelector.ts/deepEqual'.",
            },
            {
              name: "react-redux",
              importNames: ["useDispatch"],
              message:
                "Use utils/useAppDispatch() instead of useDispatch(). This will allow usage of the full store types",
            },
          ],
        },
      ],

      "no-return-assign": "error",
      "no-script-url": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "no-self-compare": "error",
      "no-sequences": "error",
      "no-shadow-restricted-names": "error",
      "no-throw-literal": "error",
      "no-unmodified-loop-condition": "error",

      "no-unneeded-ternary": [
        "error",
        {
          defaultAssignment: false,
        },
      ],

      // Replace base rule with TypeScript version for better TS support
      "no-unused-expressions": "off",
      "@typescript-eslint/no-unused-expressions": "error",

      "no-useless-call": "error",
      "no-void": "error",
      "no-with": "error",
      "prefer-numeric-literals": "error",
      "unicode-bom": ["error"],
      "no-misleading-character-class": "error",
      "no-new-require": "error",
      "no-useless-computed-key": "error",
      "prefer-const": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],

      "prettier/prettier": [
        "error",
        {
          endOfLine: "auto",
        },
      ],

      "no-import-assign": "error",
      "no-unreachable": "error",
      "react/jsx-no-target-blank": "off",

      // React-specific rules
      "react/react-in-jsx-scope": "off", // Not needed in React 17+
      "react/prop-types": "off", // Using TypeScript for prop validation
      "react/jsx-uses-react": "off", // Not needed in React 17+
      "react/jsx-uses-vars": "error",
      "react/no-unescaped-entities": "error",
      "react/no-children-prop": "error",
      "react/no-danger-with-children": "error",
      "react/no-deprecated": "error",
      "react/no-direct-mutation-state": "error",
      "react/no-find-dom-node": "error",
      "react/no-is-mounted": "error",
      "react/no-render-return-value": "error",
      "react/no-string-refs": "error",
      "react/no-unknown-property": "error",
      "react/require-render-return": "error",

      // React Hooks rules (already extended, but good to be explicit)
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
