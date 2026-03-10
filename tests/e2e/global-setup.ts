import { ensureBuildArtifacts } from './helpers/build-check';

export default async function globalSetup() {
  console.log('[global-setup] Starting...');

  // 确保构建产物存在
  ensureBuildArtifacts();

  console.log('[global-setup] Done');
}
