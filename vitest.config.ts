import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/common/types.ts',
        'src/main/main.ts',
        'src/main/window-manager.ts',
        'src/preload/**',
        'src/renderer/main.ts',
        'src/renderer/components/**',
        'src/renderer/audio/audio-context-manager.ts',
        'src/renderer/audio/audio-file-player.ts',
        'src/renderer/audio/audio-source-manager.ts',
        'src/renderer/audio/spectrum-analyzer-service.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
