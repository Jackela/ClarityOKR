# E2E Test Fixes Summary

## Changes Made

### 1. Fixed Test Timing Issues (Batches 1-3)

- Replaced `waitForSelector` with `expect().toBeVisible()` for reliable loading state detection
- Added missing loading state waits in draft test
- Fixed timing in interview-flow, next-question, and draft tests

### 2. Improved Mock Server Architecture

- Added request type detection (draft vs nextQuestion)
- Changed error signaling to use `null` return from nextQuestion function
- Prioritized draft requests when draft config is set
- Fixed ProcessEnv type error in getElectronEnv

### 3. Fixed Sticky Window Detection

- Created `findStickyWindow()` helper using Electron API
- Updated both sticky window tests to use the new helper
- Removed unused code and imports

### 4. Fixed Port Consistency

- Removed dynamic port assignment based on workerIndex
- All tests now use consistent port 7777

## Remaining Issue

The fundamental issue persists: **The mock server isn't reliably handling requests from the Electron app.**

### Symptoms:

1. Tests either don't see loading indicator at all (mock server not responding)
2. OR loading indicator stays visible forever (mock server responded once but not again)

### Root Cause Analysis:

The issue appears to be in the request/response flow between the Electron main process and the mock server. When tests set `mockServer.setResponses()`, the configuration is applied, but the mock server may not be receiving the HTTP requests from the app, or the response isn't being processed correctly.

### Possible Causes:

1. **Port conflicts**: Even with `workers: 1`, tests may be interfering with each other
2. **Request body parsing**: The mock server may not be correctly parsing the request body to determine request type
3. **Response timing**: The mock server responds, but the app doesn't process it before timeout
4. **State persistence**: Mock server state may be persisting between tests unexpectedly

## Recommendations for Further Investigation:

1. **Add detailed logging** to the mock server to trace every request/response
2. **Check if the app is actually making HTTP requests** by adding logging to the LLM gateway
3. **Verify request body format** - ensure the app sends the expected JSON structure
4. **Test mock server independently** - create a simple test that just verifies the mock server responds correctly
5. **Consider using a real HTTP library** like `nock` or `msw` instead of a custom mock server

## Files Modified:

- `tests/e2e/specs/clarification/interview-flow.spec.ts`
- `tests/e2e/specs/llm/next-question.e2e.spec.ts`
- `tests/e2e/specs/llm/draft.e2e.spec.ts`
- `tests/e2e/specs/error-handling/network-errors.spec.ts`
- `tests/e2e/specs/okr-sticky/sticky-window.spec.ts`
- `tests/e2e/specs/okr-sticky/sticky-window-reopen.spec.ts`
- `tests/e2e/fixtures/index.ts`
- `tests/e2e/fixtures/mock-server.ts`
- `tests/e2e/helpers/build-check.ts`
