import next from 'eslint-config-next';

const eslintConfig = [
  ...next,
  {
    ignores: [".next/**", "node_modules/**", "public/**"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
