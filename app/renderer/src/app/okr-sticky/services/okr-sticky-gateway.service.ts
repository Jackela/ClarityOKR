import { Injectable } from '@angular/core';
import {
  generateOKRRequestSchema,
  generateOKRResponseSchema,
  okrDocumentSchema,
} from '@clarityokr/contracts';
import type { GenerateOKRRequest, OKRDocument } from '@clarityokr/contracts';
import type { Observable } from 'rxjs';

import type { OkrStickyViewModel } from './okr-projection.service';
import { OkrProjectionService } from './okr-projection.service';
import { OkrStickyStore } from '../state/okr-sticky.store';
import { getClarityBridge, getClarityBridgeOrUndefined } from '../../shared/bridge';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
