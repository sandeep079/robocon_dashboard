import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow connections from LAN
    port: 5173,      // Optional: Ensure the port is correct
    strictPort: true, // Optional: Exit if port is in use
  }
})