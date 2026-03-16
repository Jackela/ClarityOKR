import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { IpcLlmGateway } from './app/clarification/services/ipc-llm-gateway.service';
import { Logger } from './app/core/services/logger.service';
import { environment } from './environments/environment';

bootstrapApplication(AppComponent, {
  providers: [{ provide: 'LlmGateway', useClass: IpcLlmGateway }, Logger],
})
  .then((appRef) => {
    const logger = appRef.injector.get<Logger>(Logger);
    logger.setLevel(environment.logLevel);
  })
  .catch((err: unknown) => {
    const logger = new Logger();
    logger.error(err);
  });
