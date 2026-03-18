interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  FX_API_URL: string;
}

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const requiredVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'FX_API_URL',
  ];

  const missing = requiredVars.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const port = Number(config.PORT ?? 3000);
  const smtpPort = Number(config.SMTP_PORT);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error('PORT must be a valid positive number');
  }

  if (Number.isNaN(smtpPort) || smtpPort <= 0) {
    throw new Error('SMTP_PORT must be a valid positive number');
  }

  return {
    PORT: port,
    NODE_ENV: String(config.NODE_ENV ?? 'development'),
    DATABASE_URL: String(config.DATABASE_URL),
    REDIS_URL: String(config.REDIS_URL),
    JWT_SECRET: String(config.JWT_SECRET),
    JWT_REFRESH_SECRET: String(config.JWT_REFRESH_SECRET),
    SMTP_HOST: String(config.SMTP_HOST),
    SMTP_PORT: smtpPort,
    SMTP_USER: String(config.SMTP_USER),
    SMTP_PASS: String(config.SMTP_PASS),
    FX_API_URL: String(config.FX_API_URL),
  };
}
