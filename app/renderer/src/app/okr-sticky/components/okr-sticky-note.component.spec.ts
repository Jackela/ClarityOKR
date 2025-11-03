/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import type { OkrStickyViewModel } from '../services/okr-projection.service';

import { OkrStickyNoteComponent } from './okr-sticky-note.component';

describe('OkrStickyNoteComponent', () => {
  let fixture: ComponentFixture<OkrStickyNoteComponent>;

  const viewModel: OkrStickyViewModel = {
    objective: '提升团队交付节奏',
    keyResults: [
      {
        id: 'kr-1',
        statement: '将迭代周期缩短到 3 周',
        metricLabel: '周期 <= 21 天',
        ownerLabel: '运营团队'
      },
      {
        id: 'kr-2',
        statement: '将上线缺陷率控制在 0.5%',
        metricLabel: null,
        ownerLabel: null
      }
    ],
    generatedAt: '2025-10-31T10:12:00.000Z',
    lastEditedAt: null,
    hasManualEdits: false,
    regenerationPolicy: 'append'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OkrStickyNoteComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(OkrStickyNoteComponent);
  });

  it('renders objective and key results with metadata badges', () => {
    fixture.componentInstance.okr = viewModel;
    fixture.detectChanges();

    const objective = fixture.nativeElement.querySelector('[data-testid="sticky-objective"]');
    expect(objective).not.toBeNull();
    expect(objective.textContent).toContain('提升团队交付节奏');

    const keyResults = fixture.nativeElement.querySelectorAll('[data-testid="sticky-key-result"]');
    expect(keyResults.length).toBe(2);
    expect(keyResults.item(0).textContent).toContain('将迭代周期缩短到 3 周');

    const badgeElements = Array.from<Element>(
      fixture.nativeElement.querySelectorAll('[data-testid="sticky-kr-badge"]')
    );
    const badges = badgeElements.map((element) => element.textContent?.trim());
    expect(badges).toContain('周期 <= 21 天');
    expect(badges).toContain('运营团队');
  });

  it('hides content when no OKR is provided', () => {
    fixture.componentInstance.okr = null;
    fixture.detectChanges();

    const objective = fixture.nativeElement.querySelector('[data-testid="sticky-objective"]');
    expect(objective).toBeNull();
  });
});
