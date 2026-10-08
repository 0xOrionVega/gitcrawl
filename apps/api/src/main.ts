import { loadConfig } from './config.js';
import { buildServer } from './server.js';

const cfg = loadConfig();
const app = await buildServer(cfg);
if (!cfg.githubToken) app.log.warn('GITHUB_TOKEN is not set: the API will use the low unauthenticated GitHub limit (60 requests/hour).');
if (!cfg.webDist) app.log.info('WEB_DIST is empty: serving the API only.');
await app.listen({ port: cfg.port, host: cfg.host });

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
