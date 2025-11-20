import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const defineEnv = (key: string) =>
    env[key] !== undefined ? JSON.stringify(env[key]) : "undefined";

  return {
    plugins: [react(), tailwindcss()],
    define: {
      "import.meta.env.API_URL": defineEnv("API_URL"),
      "import.meta.env.RPC_URL": defineEnv("RPC_URL"),
      "import.meta.env.DEV_TOKEN": defineEnv("DEV_TOKEN"),
      "import.meta.env.SENTRA_NFT_URI": defineEnv("SENTRA_NFT_URI"),
    },
  };
});
