/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import { LogLevel } from '../app/core/services/logger.service';

export const environment = {
  production: false,
  logLevel: LogLevel.DEBUG,
};
