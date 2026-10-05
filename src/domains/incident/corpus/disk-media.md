---
id: disk-media
family: storage
intents: storage
---

# Disk media error

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention storage and this failure pattern.

## Next steps
1. Identify the device.
2. Stop new writes to that volume.
3. Replace the disk through the hardware runbook.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
