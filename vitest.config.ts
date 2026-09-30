import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: { 'import.meta.client': 'true' },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts']
  }
})
