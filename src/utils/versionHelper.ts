/**
 * Compares two semantic version strings.
 * 
 * @param v1 First version string (e.g., "1.2.3")
 * @param v2 Second version string (e.g., "1.10.0")
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if v1 === v2
 */
export function compareVersions(v1: string, v2: string): number {
  const cleanV1 = v1.replace(/^v/i, '').trim();
  const cleanV2 = v2.replace(/^v/i, '').trim();

  const parts1 = cleanV1.split('.').map(p => parseInt(p, 10));
  const parts2 = cleanV2.split('.').map(p => parseInt(p, 10));

  const maxLength = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLength; i++) {
    const val1 = isNaN(parts1[i]) ? 0 : parts1[i];
    const val2 = isNaN(parts2[i]) ? 0 : parts2[i];

    if (val1 > val2) {
      return 1;
    }
    if (val1 < val2) {
      return -1;
    }
  }

  return 0;
}
