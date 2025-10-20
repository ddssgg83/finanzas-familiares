// eslint.config.mjs
import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "@next/eslint-plugin-next";

export default [
  { files: ["**/*.{js,mjs,cjs,ts,tsx}"] },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  next.configs.recommended,
  {
    rules: {
      // Allow 'any' type for MVP stage
      "@typescript-eslint/no-explicit-any": "off",

      // (Optional) Allow using @ts-ignore or similar comments
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
];
