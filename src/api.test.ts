import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it('uses the configured backend origin without changing API routes', async () => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://chroma-test.onrender.com/');
  const { apiUrl } = await import('./api');
  expect(apiUrl('/api/colorize')).toBe('https://chroma-test.onrender.com/api/colorize');
});
it('uses the Vite proxy when no backend URL is configured', async () => {
  vi.stubEnv('VITE_API_BASE_URL', '');
  const { apiUrl } = await import('./api');
  expect(apiUrl('/api/health')).toBe('/api/health');
});
