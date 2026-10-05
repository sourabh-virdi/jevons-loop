---
id: fs-readonly
family: filesystem
intents: filesystem
---

# Read-only remount

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention filesystem and this failure pattern.

## Next steps
1. Check the kernel log for the remount reason.
2. Do not run mkfs.
3. Remount read-write only after a person confirms the volume is consistent.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
