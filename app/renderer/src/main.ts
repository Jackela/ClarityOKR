/**
 * Main entry point for the Angular renderer application.
 *
 * Zone.js is loaded via polyfills.ts which is configured in angular.json.
 * This explicit import ensures zone.js is loaded before Angular bootstraps,
 * which is critical for proper change detection in Electron environments.
 */
import './polyfills';

import { bootstrapApplication } from '@angular/platform-browser';
import { ErrorHandler } from '@angular/core';

import { AppComponent } from './app/app.component';
import { IpcLlmGateway } from './app/clarification/services/ipc-llm-gateway.service';
import { GlobalErrorHandler } from './app/core/error-handler';
import { Logger } from './app/core/services/logger.service';
import { environment } from './environments/environment';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: 'LlmGateway', useClass: IpcLlmGateway },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    Logger,
  ],
})
  .then((appRef) => {
    const logger = appRef.injector.get<Logger>(Logger);
    logger.setLevel(environment.logLevel);
  })
  .catch((err: unknown) => {
    const logger = new Logger();
    logger.error(err);
  });
