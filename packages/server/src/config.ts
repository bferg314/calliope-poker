export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  redisUrl: string;
  /**
   * The address people outside this machine reach the server on, used to build
   * join links. Empty when PUBLIC_URL is unset, which makes those links relative
   * so each browser resolves them against the address it actually arrived on.
   * Guessing a default here is worse than having none: it hands every guest a
   * link to a host that is not theirs.
   */
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
    publicUrl: (env.PUBLIC_URL ?? '').replace(/\/+$/, ''),
    secret: env.SECRET ?? 'dev-secret',
    hostKey: env.HOST_KEY?.trim() ? env.HOST_KEY.trim() : null,
    production,
    webDist: env.WEB_DIST ?? (production ? new URL('../../web/dist', import.meta.url).pathname : null),
  };
}
