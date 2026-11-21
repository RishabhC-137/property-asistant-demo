import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** One self-contained script for other websites: `dist-embed/embed.js` (React and styles included). */
const chatUiSrc = (file: string) => fileURLToPath(new URL(`../../packages/chat-ui/src/${file}`, import.meta.url));

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: [
            { find: /^@property-assistant\/chat-ui$/, replacement: chatUiSrc("index.ts") },
            { find: /^@property-assistant\/chat-ui\/styles\.css\?inline$/, replacement: `${chatUiSrc("styles.css")}?inline` },
        ],
    },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
        outDir: "dist-embed",
        emptyOutDir: true,
        lib: { entry: "src/embed.tsx", name: "CatalogChat", formats: ["iife"], fileName: () => "embed.js" },
    },
});
