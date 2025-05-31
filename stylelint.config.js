module.exports = {
  extends: [
    "stylelint-config-standard", // Standard Stylelint rules
    "stylelint-config-css-modules", // Config for CSS Modules compatibility
  ],
  rules: {
    // General rules - customize as needed
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: ["value", "import", "export"], // Retain for clarity if preferred
      },
    ],
    "font-family-name-quotes": "always-where-recommended",
    "color-hex-length": "long",
    "shorthand-property-no-redundant-values": null,
    "declaration-block-no-redundant-longhand-properties": null,
    "comment-empty-line-before": null,
    "rule-empty-line-before": [
      "always-multi-line",
      {
        except: ["first-nested"],
        ignore: ["after-comment"],
      },
    ],

    // Performance and best practices
    "no-duplicate-selectors": true,
    "color-no-invalid-hex": true,
    "font-family-no-duplicate-names": true,
    "function-calc-no-unspaced-operator": true,
    "unit-no-unknown": true,
    "property-no-unknown": true,
    "declaration-block-no-duplicate-properties": true,

    // CSS Custom Properties (CSS Variables)
    "custom-property-pattern": "^([a-z][a-z0-9]*)(-[a-z0-9]+)*$",

    // Default class pattern (kebab-case) - will be overridden for .module.css
    // stylelint-config-css-modules should handle class patterns appropriately for modules.
    "selector-class-pattern": [
      "^([a-z][a-zA-Z0-9]+|([a-z][a-z0-9]*)(-[a-z0-9]+)*)$", // Allows camelCase OR kebab-case
      {
        message:
          "Classname should be camelCase (e.g. myClass) for CSS Modules or kebab-case (e.g. my-class) for global CSS.",
      },
    ],
  },
  overrides: [
    {
      files: ["**/*.css", "!**/*.module.css"], // For regular CSS files
      rules: {
        // Enforce kebab-case for non-module CSS if not already covered by standard
        "selector-class-pattern": [
          "^([a-z][a-z0-9]*)(-[a-z0-9]+)*$",
          {
            message: "Selector should be in kebab-case (e.g. .my-class)",
          },
        ],
      },
    },
    {
      files: ["**/*.module.css"], // Specifically for CSS Modules
      rules: {
        // stylelint-config-css-modules should correctly allow camelCase for modules.
        // If specific enforcement is still needed:
        "selector-class-pattern": [
          "^([a-z][a-zA-Z0-9]+)$", // Enforce camelCase for CSS Modules
          {
            resolveNestedSelectors: true, // Important for CSS Modules
            message: "Class selectors in CSS Modules must be camelCase (e.g. .myClass)",
          },
        ],
      },
    },
  ],
};
