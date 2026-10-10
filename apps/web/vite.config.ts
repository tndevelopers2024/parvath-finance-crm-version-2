import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// API_URL and WEB_PORT let a second copy of the app run beside the usual one, for example against the test database.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT) || 5177,
    proxy: { "/api": process.env.API_URL || "http://127.0.0.1:4007" },
  },
  build: { chunkSizeWarningLimit: 900 },
});
