import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * In development the browser talks only to Vite (port 5173), and Vite
 * forwards API calls to the backend. Same origin → no CORS setup needed.
 * Override the backend location with API_PROXY_TARGET.
 */
const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4000";

/** Use the chat-ui *source* so edits to the package hot-reload instantly. */
const chatUiSrc = (file: string) => fileURLToPath(new URL(`../../packages/chat-ui/src/${file}`, import.meta.url));

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: [
            { find: /^@property-assistant\/chat-ui$/, replacement: chatUiSrc("index.ts") },
            { find: /^@property-assistant\/chat-ui\/styles\.css$/, replacement: chatUiSrc("styles.css") },
        ],
    },
    server: {
        port: 5173,
        strictPort: true,
        // Lets Cloudflare quick tunnels reach the dev server.
        allowedHosts: [".trycloudflare.com"],
        proxy: {
            "/api": { target: apiTarget, changeOrigin: true },
            "/ready": { target: apiTarget, changeOrigin: true },
            "/health": { target: apiTarget, changeOrigin: true },
        },
    },
});
