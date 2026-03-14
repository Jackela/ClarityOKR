import { ensureBuildArtifacts } from './helpers/build-check';
import { SimpleMockServer } from './helpers/simple-mock-server';

// Global mock server instance shared across all tests
export let globalMockServer: SimpleMockServer | undefined;

export default async function globalSetup() {
  console.log('[global-setup] Starting...');

  try {
    // 确保构建产物存在
    ensureBuildArtifacts();
    console.log('[global-setup] Build artifacts verified');

    // 启动全局 mock server
    globalMockServer = new SimpleMockServer();
    const port = await globalMockServer.start();
    
    // 设置环境变量供测试使用
    process.env.MOCK_SERVER_PORT = String(port);
    console.log(`[global-setup] Mock server started on port ${port}`);
    console.log('[global-setup] Done');
  } catch (error) {
    console.error('[global-setup] Failed:', error);
    // 确保 globalMockServer 为 undefined 而不是未初始化
    globalMockServer = undefined;
    throw error;
  }
}
