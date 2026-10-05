---
id: app-oom
family: application
intents: application
---

# Application OOM

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention application and this failure pattern.

## Next steps
1. Find the job id.
2. Capture the memory limit.
3. Restart the job only after the owner agrees.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
