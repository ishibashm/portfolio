/**
 * A lightweight PII masking utility for Zero-Trust Architecture.
 * In a full production environment, this should be replaced with a call to an internal Microsoft Presidio API.
 */
export function maskPII(text: string): string {
  if (!text) return text;
  
  // Basic regex fallback for Email and Phone numbers
  let masked = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '<EMAIL>');
  masked = masked.replace(/\b\d{2,4}-\d{2,4}-\d{4}\b/g, '<PHONE>');
  
  // Future implementation: call Presidio API
  // const res = await fetch('http://localhost:5001/analyze', ...);
  
  return masked;
}
