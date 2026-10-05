---
id: sidecar-crash
family: application
intents: application
---

# Service mesh sidecar crash

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention application and this failure pattern.

## Next steps
1. Restart the sidecar.
2. Confirm the app container is still serving.
3. Roll the deploy back if the crash loops.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
