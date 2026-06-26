import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["broderick-unflaked-unhastily.ngrok-free.dev"],
    port: 3000,
    open: true,
  },
});
