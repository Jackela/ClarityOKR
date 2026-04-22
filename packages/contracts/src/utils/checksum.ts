import { createHash } from 'node:crypto';

/**
 * Calculate a SHA-256 checksum for the given string data.
 *
 * @param data - The string data to hash
 * @returns Hexadecimal digest of the SHA-256 hash
 */
export function calculateChecksum(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}
