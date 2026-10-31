import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      // Existing effects reset state on prop changes; keep visible until those components are refactored.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "next-env.d.ts"]),
]);
