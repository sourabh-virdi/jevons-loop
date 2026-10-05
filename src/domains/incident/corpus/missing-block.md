---
id: missing-block
family: storage
intents: storage
---

# Missing block

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention storage and this failure pattern.

## Next steps
1. Confirm replica count is zero.
2. Page on-call.
3. Restore from the approved backup path.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
