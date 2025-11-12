import next from 'eslint-config-next';

export default [

  ...next,

    {
    ignores: ['.next/**', 'node_modules/**', 'public/**'],

      rules: {
      '@next/next/no-img-element': 'off',
    },
  },
];
