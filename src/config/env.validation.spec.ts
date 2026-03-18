import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const baseConfig = {
    DATABASE_URL: 'postgresql://localhost:5432/fx',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_USER: 'test@example.com',
    SMTP_PASS: 'password',
    FX_API_URL: 'https://api.exchangerate-api.com/v4/latest',
  };

  it('should validate and normalize environment variables', () => {
    const result = validateEnv({
      ...baseConfig,
      PORT: '3001',
      NODE_ENV: 'development',
    });

    expect(result.PORT).toBe(3001);
    expect(result.NODE_ENV).toBe('development');
    expect(result.SMTP_PORT).toBe(587);
  });

  it('should apply defaults for optional values', () => {
    const result = validateEnv(baseConfig);

    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('development');
  });

  it('should throw when required vars are missing', () => {
    expect(() => validateEnv({})).toThrow('Missing required environment variables');
  });

  it('should throw when PORT is invalid', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        PORT: 'invalid',
      }),
    ).toThrow('PORT must be a valid positive number');
  });

  it('should throw when SMTP_PORT is invalid', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        SMTP_PORT: 'invalid',
      }),
    ).toThrow('SMTP_PORT must be a valid positive number');
  });
});
