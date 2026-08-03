import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        env: {
            ALTCHA_HMAC_SECRET: 'vitest-altcha-hmac-secret-only-for-tests-0000',
            JWT_SECRET: 'vitest-jwt-secret-only-for-tests-000000000000',
        },
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/**'],
        },
        // Specify the sequence to run tests if needed
        // sequence: {
        //   shuffle: true,
        // },
    },
});
