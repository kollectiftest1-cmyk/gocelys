import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// En développement, /api et /media sont relayés vers le backend Django (port 8000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/media": "http://127.0.0.1:8000",
    },
  },
});
