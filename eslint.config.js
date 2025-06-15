import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs,jsx}"], plugins: { js }, extends: ["js/recommended"] },
  { files: ["api/**/*.{js,mjs,cjs,jsx}"], languageOptions: { globals: globals.node } },
  { 
    files: ["src/**/*.{js,mjs,cjs,jsx}"], 
    languageOptions: { globals: globals.browser },
    rules: {
      // Prevent circular dependencies by restricting certain import patterns
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../../../*", "../../../../*", "../../../../../*"],
              message: "Avoid deep relative imports. Use absolute imports or refactor the module structure."
            }
          ],
          paths: [
            // Prevent physics modules from importing from higher-level modules
            {
              name: "../../components/**",
              message: "Physics modules should not import from components. Extract shared logic to utils or services."
            },
            {
              name: "../../managers/**", 
              message: "Physics modules should not import from managers. Use dependency injection or events."
            }
          ]
        }
      ]
    },
    settings: {
      react: {
        version: "detect"
      }
    }
  },
  pluginReact.configs.flat.recommended,
]);