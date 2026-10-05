---
id: compute-panic
family: compute
intents: compute
---

# Kernel panic

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention compute and this failure pattern.

## Next steps
1. Capture the panic string.
2. Keep the node out of the scheduler.
3. Page on-call if users cannot start jobs.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
