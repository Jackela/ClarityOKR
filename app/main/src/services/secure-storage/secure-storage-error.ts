/**
 * Secure Storage Error
 *
 * Error thrown when secure storage operations fail.
 * Provides consistent error handling without exposing sensitive details.
 * The original error is preserved in the `cause` property for debugging.
 *
 * @example
 * ```typescript
 * try {
 *   const key = keyManager.getOrCreateKey();
 * } catch (error) {
 *   if (error instanceof SecureStorageError) {
 *     console.error('Storage failed:', error.message);
 *   }
 * }
 * ```
 */
export class SecureStorageError extends Error {
  /**
   * Creates a new SecureStorageError.
   *
   * @param message - Human-readable error description
   * @param cause - Original error that caused this failure (optional)
   */
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SecureStorageError';
  }
}
