---
id: memory-ecc
family: memory
intents: memory
---

# ECC correction failure

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention memory and this failure pattern.

## Next steps
1. Identify the DIMM from the log.
2. Mark the bank offline after confirmation.
3. Open a hardware ticket.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
