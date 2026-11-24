import express from 'express';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { connectOracle } from './db.js';

try {
  const env = process.env;
  const required = ['DB_USER', 'DB_PASSWORD', 'DB_CONNECT_STRING', 'SESSION_SECRET'];
  const missing = required.filter(name => !env[name]?.trim());
  if (missing.length) throw new Error('Set ' + missing.join(', ') + ' in backend/.env.');
  if (env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  const db = await connectOracle(env);

const test = await db.run(async ({ rows }) => {
  return rows(`
    SELECT
      USER AS USERNAME,
      SYS_CONTEXT('USERENV', 'SERVICE_NAME') AS SERVICE_NAME
    FROM dual
  `);
});

console.log('Oracle Database Connected:', test[0]);




  const app = createApp(db, {
    secret: env.SESSION_SECRET,
    allowedOrigins: (env.FRONTEND_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173').split(',').map(origin => origin.trim()),
    googleKey: env.GOOGLE_ROUTES_API_KEY?.trim(),
    secureCookie: env.COOKIE_SECURE === 'true',
  });
  app.use(express.static(fileURLToPath(new URL('../frontend/dist/', import.meta.url))));
  const port = Number(env.PORT || 3000);
  const server = app.listen(port, env.HOST || '127.0.0.1', () => console.log('SmartRoute API listening on port ' + port));
  server.on('error', async error => {
    console.error(error.message);
    await db.close();
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => db.close().catch(console.error)));
  }
} catch (error) {
  console.error('Startup failed:', error.message);
  process.exitCode = 1;
}
