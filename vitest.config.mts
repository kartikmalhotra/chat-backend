import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/chat_backend_test?schema=public',
      FIREBASE_PROJECT_ID: 'chat-backend-test',
      FIRESTORE_EMULATOR_HOST: 'localhost:8080',
      LOG_LEVEL: 'silent',
    },
  },
});
