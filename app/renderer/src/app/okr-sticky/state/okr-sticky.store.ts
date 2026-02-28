import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';

import type { OkrStickyViewModel, KeyResultViewModel } from '../services/okr-projection.service';

export interface OkrStickyState {
  viewModel: OkrStickyViewModel | null;
}

const initialState: OkrStickyState = {
  viewModel: null,
};

@Injectable({ providedIn: 'root' })
export class OkrStickyStore extends ComponentStore<OkrStickyState> {
  readonly viewModel$ = this.select((state) => state.viewModel);
  readonly hasStickyNote$ = this.select((state) => state.viewModel !== null);

  constructor() {
    super(initialState);
  }

  readonly setViewModel = this.updater(
    (state, viewModel: OkrStickyViewModel | null): OkrStickyState => ({
      ...state,
      viewModel,
    }),
  );

  readonly addKeyResult = this.updater((state): OkrStickyState => {
    if (!state.viewModel) return state;
    const id = this.generateId();
    const newKeyResult: KeyResultViewModel = {
      id,
      statement: '新关键结果',
      metricLabel: null,
      ownerLabel: null,
    };
    return {
      ...state,
      viewModel: {
        ...state.viewModel,
        keyResults: [...state.viewModel.keyResults, newKeyResult],
      },
    };
  });

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2);
  }
}
