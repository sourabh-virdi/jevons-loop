import { incidentPack } from "@/domains/incident/pack";
import { supportPack } from "@/domains/support/pack";
import type { DomainPack } from "@/domains/types";
import type { DomainId } from "@/types/contracts";

const packs: Record<DomainId, DomainPack> = {
  support: supportPack,
  incident: incidentPack,
};

export function isDomainId(value: string): value is DomainId {
  return value === "support" || value === "incident";
}

export function getDomain(id: string): DomainPack {
  if (!isDomainId(id)) throw new Error(`Unknown domain "${id}". Expected support or incident.`);
  return packs[id];
}

export function listDomains(): DomainPack[] {
  return [supportPack, incidentPack];
}
