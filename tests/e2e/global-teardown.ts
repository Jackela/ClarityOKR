/**
 * Global teardown for E2E tests
 * Runs once after all tests complete
 */
export default async function globalTeardown() {
  console.log('[global-teardown] Running post-test cleanup...');
  
  // Clean up any leftover test artifacts
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.join(currentDir, '..', '..', 'data');
  
  // Clean up any remaining JSON files in data directory
  if (fs.existsSync(dataDir)) {
    try {
      const files = fs.readdirSync(dataDir);
      for (const file of files) {
        if (file.endsWith('.json') && file.includes('test')) {
          try {
            fs.unlinkSync(path.join(dataDir, file));
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    } catch {
      // Ignore directory errors
    }
  }
  
  console.log('[global-teardown] Cleanup complete');
}
