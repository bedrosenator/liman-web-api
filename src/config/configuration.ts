export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  environment: process.env.NODE_ENV ?? 'development',
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? undefined,
  },
  sqlite: {
    databasePath: process.env.SQLITE_PATH ?? './data/liman_master.sqlite',
  },
  apiKey: process.env.MASTER_API_KEY ?? 'liman-secret-key-change-in-production',
});
