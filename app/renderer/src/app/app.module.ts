import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { ClarificationWizardComponent } from './clarification/components/clarification-wizard.component';
import { OkrStickyNoteComponent } from './okr-sticky/components/okr-sticky-note.component';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, ReactiveFormsModule, ClarificationWizardComponent, OkrStickyNoteComponent],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}
