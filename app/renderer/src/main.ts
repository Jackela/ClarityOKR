/**
 * Main entry point for the Angular renderer application.
 *
 * Zone.js is loaded via polyfills.ts which is configured in angular.json.
 * This explicit import ensures zone.js is loaded before Angular bootstraps,
 * which is critical for proper change detection in Electron environments.
 */
import './polyfills';

import { bootstrapApplication } from '@angular/platform-browser';
import { ErrorHandler, inject, provideAppInitializer } from '@angular/core';

import { AppComponent } from './app/app.component';
import { ReminderStore } from './app/closed-loop/reminder.store';
import { IpcLlmGateway } from './app/clarification/services/ipc-llm-gateway.service';
import { GlobalErrorHandler } from './app/core/error-handler';
import { Logger } from './app/core/services/logger.service';
import { environment } from './environments/environment';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: 'LlmGateway', useClass: IpcLlmGateway },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    Logger,
    // #84 review: reminders run in every window that can show the note (the main-window
    // results panel and the sticky shell), not only inside the shell.
    provideAppInitializer(() => inject(ReminderStore).start()),
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
