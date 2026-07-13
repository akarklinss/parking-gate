import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/parking-gate/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Parking Gate",
        short_name: "ParkingGate",
        description: "Pasākumu auto iebraukšanas un izbraukšanas kontrole",
        theme_color: "#111827",
        background_color: "#eef1f5",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/parking-gate/",
        scope: "/parking-gate/",
        icons: [
          { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
          { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
        ]
      }
    })
  ]
});
