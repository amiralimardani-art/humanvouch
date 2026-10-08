// Largest content accepted for a vouch or an attestation lookup: 8 KiB of UTF-8, enough for a
// long-form article. Shared by the browser (before proving) and the x402 endpoint (before hashing).
export const MAX_CONTENT_BYTES = 8 * 1024;

export function contentTooLarge(text: string): boolean {
  return new TextEncoder().encode(text).length > MAX_CONTENT_BYTES;
}
