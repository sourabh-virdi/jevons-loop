const SECRET_PATTERNS: RegExp[] = [
  /bearer\s+[a-z0-9._\-+/=]{8,}/gi,
  /\b(api[_-]?key|token|password|secret)\s*[:=]\s*\S+/gi,
  /\bsk-[a-z0-9]{10,}\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
];

export function redactSecrets(text: string): string {
  let next = text;
  for (const pattern of SECRET_PATTERNS) {
    next = next.replace(pattern, "[REDACTED-SECRET]");
  }
  return next;
}

export function preview(value: unknown, max = 500): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const redacted = redactSecrets(text ?? "");
  return redacted.length <= max ? redacted : `${redacted.slice(0, max)}…`;
}
