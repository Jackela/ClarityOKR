import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { ClarificationWizardComponent } from './clarification/components/clarification-wizard.component';
import { OkrStickyNoteComponent } from './okr-sticky/components/okr-sticky-note.component';

import { IpcLlmGateway } from './clarification/services/ipc-llm-gateway.service';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    ReactiveFormsModule,
    ClarificationWizardComponent,
    OkrStickyNoteComponent,
  ],
  providers: [{ provide: 'LlmGateway', useClass: IpcLlmGateway }],
  bootstrap: [AppComponent],
})
export class AppModule {}
