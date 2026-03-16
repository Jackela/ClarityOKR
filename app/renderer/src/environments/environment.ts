import type { LogLevel } from '../app/core/services/logger.service';
import { LogLevel as LogLevelValue } from '../app/core/services/logger.service';

export const environment: {
  production: boolean;
  logLevel: LogLevel;
} = {
  production: false,
  logLevel: LogLevelValue.DEBUG,
};
