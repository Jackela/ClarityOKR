import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import type { OkrStickyViewModel } from '../services/okr-projection.service';

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

  readonly setViewModel = this.updater((state, viewModel: OkrStickyViewModel | null) => ({
    ...state,
    viewModel,
  }));

  readonly addKeyResult = this.updater((state) => {
    if (!state.viewModel) return state;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    return {
      ...state,
      viewModel: {
        ...state.viewModel,
        keyResults: [
          ...state.viewModel.keyResults,
          {
            id,
            statement: '新关键结果',
            metricLabel: null,
            ownerLabel: null,
          },
        ],
      },
    };
  });
}
