import { configService } from './services/config.service';

// Configuration for server and ports - now using dynamic config
export const getServerConfig = async () => {
  const config = await configService.getServerConfig();
  return {
    DEV_PORT: config.devPort,
    PROD_PORT: process.env.PORT || config.prodPort,
    FALLBACK_PORT: 3000, // Keep as fallback
    HOST: config.host
  };
};

// Legacy export for backwards compatibility
export const SERVER_CONFIG = {
  DEV_PORT: process.env.PORT || 3000,
  PROD_PORT: process.env.PORT || 3000,
  FALLBACK_PORT: 3000,
  HOST: '0.0.0.0'
};