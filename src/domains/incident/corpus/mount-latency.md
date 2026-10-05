---
id: mount-latency
family: filesystem
intents: filesystem
---

# Mount latency

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention filesystem and this failure pattern.

## Next steps
1. Identify the volume.
2. Check the storage path.
3. Move traffic only with confirmation.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
