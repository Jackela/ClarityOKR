import { ensureBuildArtifacts } from './helpers/build-check';

export default async function globalSetup() {
  ensureBuildArtifacts();
}
