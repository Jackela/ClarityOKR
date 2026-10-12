/**
 * A long path for display (spec §6.3: 「路径中间省略」): the start and the end are kept, the
 * middle becomes `…`. The end (with the file name) gets the larger share. The full path stays
 * in the tooltip and the accessible name.
 */
export function middleEllipsis(path: string, maxLength = 44): string {
  const chars = Array.from(path);
  if (chars.length <= maxLength) return path;
  const tail = Math.ceil((maxLength - 1) * 0.6);
  const head = maxLength - 1 - tail;
  return `${chars.slice(0, head).join('')}…${chars.slice(chars.length - tail).join('')}`;
}
