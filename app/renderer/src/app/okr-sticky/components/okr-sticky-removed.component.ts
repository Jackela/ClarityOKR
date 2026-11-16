import type { ElementRef } from '@angular/core';
import { ChangeDetectionStrategy, Component, Input, ViewChild, signal } from '@angular/core';
import type { KeyResultRecord, KrProgressInfo } from '@clarityokr/contracts';

import { KrProgressHistoryComponent } from '../../closed-loop/kr-progress-history.component';
import { COPY, formatMonthDay, STATUS_LABEL } from '../../closed-loop/copy';

/** Active-list helper used by the parent to decide whether this section is shown. */
export function removedKrs(all: KeyResultRecord[]): KeyResultRecord[] {
  return all.filter((kr) => kr.removedAt !== null).sort((a, b) => a.position - b.position);
}

/**
 * Already-removed key results on the sticky note. The host is the existing
 * `section.removed` so the DOM tag, class and test id stay the same.
 */
@Component({
  selector: 'section[clarityokr-sticky-removed]',
  standalone: true,
  imports: [KrProgressHistoryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './okr-sticky-removed.component.html',
  styleUrls: ['./okr-sticky-removed.component.scss'],
})
export class OkrStickyRemovedComponent {
  readonly t = COPY;
  readonly removedOpen = signal(false);
  /** #53: removed KRs whose 「进度记录」 is open. */
  readonly removedHistory = signal<ReadonlySet<string>>(new Set());

  @Input({ required: true }) removed: KeyResultRecord[] = [];
  @Input({ required: true }) progress: Record<string, KrProgressInfo> = {};

  @ViewChild('removedToggle') private removedToggle?: ElementRef<HTMLElement>;

  toggleRemovedHistory(krId: string): void {
    const next = new Set(this.removedHistory());
    if (next.has(krId)) next.delete(krId);
    else next.add(krId);
    this.removedHistory.set(next);
  }

  lastProgress(kr: KeyResultRecord): string {
    return COPY.kr.lastProgress(kr.progress, STATUS_LABEL[kr.status]);
  }

  monthDay(iso: string | null): string {
    return iso ? formatMonthDay(iso) : '';
  }

  /** 「查看已移除」: open the section and move the focus to its heading. */
  viewRemoved(): void {
    this.removedOpen.set(true);
    setTimeout(() => this.removedToggle?.nativeElement.focus(), 0);
  }
}
