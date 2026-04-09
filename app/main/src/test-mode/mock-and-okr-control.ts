import type { MockResponseConfig, OKRDocument } from '@clarityokr/contracts';
import type { IMockControl, IOkrControl, TestModeDependencies } from './types.js';
import type { StateObservationModule } from './state-observation.js';

export class MockControlModule implements IMockControl {
  private mockLLMResponses: Map<string, unknown> = new Map();
  private mockResponseConfig: MockResponseConfig = {};

  constructor(private readonly stateObserver: StateObservationModule) {}

  setMockLLMResponse(type: 'nextQuestion' | 'draft', response: unknown): void {
    this.mockLLMResponses.set(type, response);
    this.stateObserver.notifyStateChange();
  }

  clearMockResponses(): void {
    this.mockLLMResponses.clear();
    this.mockResponseConfig = {};
    this.stateObserver.notifyStateChange();
  }

  setMockResponseConfig(config: MockResponseConfig): void {
    this.mockResponseConfig = config;
    this.stateObserver.notifyStateChange();
  }

  getMockResponseConfig(): MockResponseConfig {
    return { ...this.mockResponseConfig };
  }

  getMockResponse(type: string): unknown {
    return this.mockLLMResponses.get(type);
  }
}

export class OkrControlModule implements IOkrControl {
  constructor(
    private readonly deps: TestModeDependencies,
    private readonly stateObserver: StateObservationModule,
  ) {}

  async getLatestOKR(): Promise<OKRDocument | null> {
    return this.deps.okrRepo.loadLatest();
  }

  async saveOKR(okr: OKRDocument): Promise<void> {
    await this.deps.okrRepo.save(okr);
  }

  async clearOKRs(): Promise<void> {
    const { promises: fsPromises } = await import('node:fs');
    const path = await import('node:path');
    const dataDir = process.env.CLARITY_OKR_DATA_DIR ?? path.join(process.cwd(), 'data');
    const okrFile = path.join(dataDir, 'okr-document.json');

    try {
      await fsPromises.unlink(okrFile);
    } catch {
      // File may not exist, that's fine
    }
  }
}
