import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react/no-unescaped-entities": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "tools/**",
    "packages/**",
    "x_downloads/**",
    "katmer-defuddle/**",

    // .gitignore の「Ignore test and debug scripts」と同じもの。
    //
    // eslint は .gitignore を見ないので、手元にだけある使い捨ての
    // スクリプトが警告の総数に混ざる。この作業は「PR の前後で総数が
    // 増えていないこと」で判断しているので、人によって数が違うと
    // 判断そのものが狂う。実測で 444 と 434（10 件ぶん）ずれていた。
    "check_*.ts",
    "test_*.ts",
    "export_*.ts",
    "scratch/**",
  ]),
]);

export default eslintConfig;
