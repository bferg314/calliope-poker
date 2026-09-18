export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  redisUrl: string;
  publicUrl: string;
  secret: string;
  /**
   * When set, only people who have entered this key may open a table. Everyone
   * else can still join one by code or link. Unset means anybody who can reach
   * the server can open tables.
   */
  hostKey: string | null;
  production: boolean;
  /** Directory with the built web app, served in production. */
  webDist: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL ?? 'postgres://calliope:change-me@localhost:5432/calliope',
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    publicUrl: (env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
    secret: env.SECRET ?? 'dev-secret',
    hostKey: env.HOST_KEY?.trim() ? env.HOST_KEY.trim() : null,
    production,
    webDist: env.WEB_DIST ?? (production ? new URL('../../web/dist', import.meta.url).pathname : null),
  };
}
