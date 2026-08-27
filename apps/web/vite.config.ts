import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? "/SeePlusPlus/" : "/",
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@codemirror") || id.includes("@uiw/react-codemirror")) return "editor";
          if (id.includes("@dagrejs")) return "graph";
          if (
            id.includes("node_modules/react") ||
            id.includes("lucide-react") ||
            id.includes("zustand")
          )
            return "ui";
          return undefined;
        },
      },
    },
  },
  server: { port: 4000, proxy: { "/v1": "http://localhost:3000" } },
});
