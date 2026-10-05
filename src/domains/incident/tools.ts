import { z } from "zod";
import services from "@/domains/incident/fixtures/services.json";
import type { ToolDefinition } from "@/domains/types";

export const incidentTools: ToolDefinition[] = [
  {
    name: "searchLogs",
    description: "Search synthetic operational log lines.",
    sideEffect: false,
    inputSchema: z.object({ query: z.string().min(1), component: z.string().optional() }),
    execute: (input) => {
      const parsed = z.object({ query: z.string().min(1), component: z.string().optional() }).parse(input);
      const q = parsed.query.toLowerCase();
      return {
        matches: services.logs.filter((line) => {
          const componentOk = parsed.component ? line.component === parsed.component : true;
          return componentOk && (line.line.toLowerCase().includes(q) || line.component.includes(q));
        }),
      };
    },
  },
  {
    name: "getServiceStatus",
    description: "Read synthetic service status.",
    sideEffect: false,
    inputSchema: z.object({ service: z.string().optional(), component: z.string().optional() }),
    execute: (input) => {
      const parsed = z.object({ service: z.string().optional(), component: z.string().optional() }).parse(input);
      const matches = services.services.filter((service) => {
        if (parsed.service) return service.name === parsed.service || service.id === parsed.service;
        if (parsed.component) return service.component === parsed.component;
        return true;
      });
      return { services: matches };
    },
  },
  {
    name: "getRecentDeploys",
    description: "Read synthetic deploy history.",
    sideEffect: false,
    inputSchema: z.object({ service: z.string().optional() }),
    execute: (input) => {
      const parsed = z.object({ service: z.string().optional() }).parse(input);
      const deploys = services.deploys.filter((deploy) => (parsed.service ? deploy.service === parsed.service : true));
      return { deploys };
    },
  },
  {
    name: "createIncidentTicket",
    description: "Write action. Requires human confirmation and does not open a real ticket.",
    sideEffect: true,
    inputSchema: z.object({
      summary: z.string().min(1),
      severity: z.number().int().min(0).max(3).optional(),
      confirmed: z.boolean().optional(),
    }),
    execute: (input) => {
      const parsed = z
        .object({
          summary: z.string().min(1),
          severity: z.number().int().min(0).max(3).optional(),
          confirmed: z.boolean().optional(),
        })
        .parse(input);
      if (parsed.confirmed !== true) {
        return { status: "confirmation_required", summary: parsed.summary };
      }
      return { status: "mock_ticket_created", id: "INC-FIXTURE-001", summary: parsed.summary };
    },
  },
];
