import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Don't pre-bundle the local map-core package — otherwise Vite caches it and a
  // rebuild of its dist isn't picked up without `--force`. Excluded = its fresh
  // dist is served on each dev start (the dev script rebuilds it first).
  optimizeDeps: {
    exclude: ['@media-map/map-core'],
  },
})
