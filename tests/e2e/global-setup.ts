import getPort from 'get-port';
import { SimpleMockServer } from './helpers/simple-mock-server';
import { ensureBuildArtifacts } from './helpers/build-check';

let globalMockServer: SimpleMockServer;

export default async function globalSetup() {
  // 确保构建产物存在
  ensureBuildArtifacts();

  // 启动全局 mock server
  globalMockServer = new SimpleMockServer();
  const port = await getPort(); // 自动分配可用端口
  await globalMockServer.start(port);

  // 将端口写入环境变量供测试使用
  process.env.MOCK_SERVER_PORT = String(port);

  console.log(`[global-setup] Mock server started on port ${port}`);

  return async () => {
    // teardown
    await globalMockServer.stop();
    console.log('[global-setup] Mock server stopped');
  };
}

export { globalMockServer };
