import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // WEB BLUETOOTH NEEDS A SECURE CONTEXT. localhost counts as one, so `npm run
  // dev` can talk to the socket on this machine; anywhere else has to be HTTPS.
  server: { host: true },
})
