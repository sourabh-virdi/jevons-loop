---
id: scheduler-backlog
family: scheduler
intents: scheduler
---

# Scheduler backlog

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention scheduler and this failure pattern.

## Next steps
1. Read queue depth.
2. Look for a stuck reservation.
3. Pause new submissions if the backlog keeps growing.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
