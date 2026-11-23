import {
  IPC_CHANNELS,
  isAllowedChannel,
  isLlmGenerateDraftPayloadNew,
  isLlmGenerateDraftPayloadOld,
  isLlmNextQuestionPayloadNew,
  isLlmNextQuestionPayloadOld,
  validateChannel,
} from '@clarityokr/contracts';

/** #151: the IPC allowlist and the LLM payload type guards. */
describe('IPC channel allowlist', () => {
  it('accepts every declared channel and rejects others', () => {
    for (const channel of Object.values(IPC_CHANNELS)) {
      expect(isAllowedChannel(channel)).toBe(true);
      expect(() => validateChannel(channel)).not.toThrow();
    }
    expect(isAllowedChannel('clarityokr:not-a-channel')).toBe(false);
    expect(() => validateChannel('evil')).toThrow(
      'Unauthorized IPC channel: evil. This channel is not in the allowlist.',
    );
  });
});

describe('LLM payload guards', () => {
  it('next-question: new format', () => {
    expect(
      isLlmNextQuestionPayloadNew({ sessionId: 's', currentQuestionId: 'q', context: {} }),
    ).toBe(true);
    for (const payload of [
      null,
      'x',
      {},
      { sessionId: 1, currentQuestionId: 'q' },
      { sessionId: 's' },
      { sessionId: 's', currentQuestionId: 2 },
    ])
      expect(isLlmNextQuestionPayloadNew(payload)).toBe(false);
  });

  it('next-question: old format', () => {
    expect(isLlmNextQuestionPayloadOld({ context: {}, lastChoice: { questionId: 'q' } })).toBe(
      true,
    );
    for (const payload of [
      null,
      7,
      { lastChoice: { questionId: 'q' } },
      { context: {} },
      { context: {}, lastChoice: 'q' },
      { context: {}, lastChoice: null },
      { context: {}, lastChoice: {} },
    ])
      expect(isLlmNextQuestionPayloadOld(payload)).toBe(false);
  });

  it('generate-draft: new and old formats', () => {
    expect(isLlmGenerateDraftPayloadNew({ sessionId: 's' })).toBe(true);
    for (const payload of [null, 'x', {}, { sessionId: 3 }])
      expect(isLlmGenerateDraftPayloadNew(payload)).toBe(false);
    expect(isLlmGenerateDraftPayloadOld({ context: {} })).toBe(true);
    for (const payload of [null, 'x', {}, { context: 'c' }, { context: null }])
      expect(isLlmGenerateDraftPayloadOld(payload)).toBe(false);
  });
});
