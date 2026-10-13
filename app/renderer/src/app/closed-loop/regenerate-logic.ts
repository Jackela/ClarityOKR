import type { RegenerateSummary } from '@clarityokr/contracts';

import { COPY } from './copy';

export interface RegenerateBanner {
  /** `warn` when something was removed (amber), else `info` (blue). */
  tone: 'info' | 'warn';
  main: string;
  sub: string | null;
  /** 「查看已移除」 is offered. */
  viewRemoved: boolean;
}

/** The result banner of spec §3.7 for one regeneration summary. */
export function bannerFor(summary: RegenerateSummary): RegenerateBanner {
  const t = COPY.regen;
  switch (summary.outcome) {
    case 'updated':
      return { tone: 'info', main: t.updated(summary.requested), sub: null, viewRemoved: false };
    case 'reordered':
      return { tone: 'info', main: t.reordered, sub: null, viewRemoved: false };
    case 'partial_updated':
      return {
        tone: 'info',
        main: t.partialUpdated(summary.requested),
        sub: null,
        viewRemoved: false,
      };
    case 'partial_removed':
      return {
        tone: 'warn',
        main: t.partialRemoved(summary.requested, summary.removed),
        sub: null,
        viewRemoved: true,
      };
    case 'changed':
      return {
        tone: summary.removed > 0 ? 'warn' : 'info',
        main: t.changedMain(summary.kept, summary.added, summary.removed),
        sub:
          summary.missingIds > 0
            ? t.changedMissing(summary.kept, summary.missingIds, summary.removed)
            : t.changedConfirm,
        viewRemoved: summary.removed > 0,
      };
  }
}

/** The one sentence `role=status` announces (main + sub). */
export function bannerAnnouncement(banner: RegenerateBanner): string {
  return banner.sub ? `${banner.main}${banner.sub}` : banner.main;
}
