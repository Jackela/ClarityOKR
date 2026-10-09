import { ensureBuildArtifacts } from './helpers/build-check';

/** Global setup checks artifacts; HTTP mocks belong to their test/worker fixtures. */
export default async function globalSetup(): Promise<void> {
  ensureBuildArtifacts();
}
