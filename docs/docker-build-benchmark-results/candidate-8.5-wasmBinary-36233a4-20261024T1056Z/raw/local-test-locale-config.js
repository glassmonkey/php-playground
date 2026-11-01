import base from '../../../../vitest.config.js';
import { fileURLToPath } from 'node:url';

export default {
  ...base,
  test: {
    ...base.test,
    setupFiles: [
      '@vitest/web-worker',
      fileURLToPath(new URL('./local-test-locale-setup.js', import.meta.url)),
    ],
  },
};
