import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import type { OkrStickyViewModel } from '../services/okr-projection.service';

@Component({
  selector: 'clarityokr-sticky-note',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './okr-sticky-note.component.html',
  styleUrls: ['./okr-sticky-note.component.scss']
})
export class OkrStickyNoteComponent {
  @Input() okr: OkrStickyViewModel | null = null;

  readonly trackByKeyResultId = (_: number, item: { id: string }) => item.id;
}
