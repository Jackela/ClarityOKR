/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import type { LogLevel } from '../app/core/services/logger.service';
import { LogLevel as LogLevelValue } from '../app/core/services/logger.service';

export const environment: {
  production: boolean;
  logLevel: LogLevel;
} = {
  production: true,
  logLevel: LogLevelValue.ERROR,
};
