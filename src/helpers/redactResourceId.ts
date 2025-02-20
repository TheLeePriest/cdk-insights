import crypto from 'crypto';

// Function to hash resource ID
export function anonymizeResourceId(resourceId: string): string {
  return crypto.createHash('sha256').update(resourceId).digest('hex');
}
