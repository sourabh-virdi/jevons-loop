import { z } from "zod";
import accounts from "@/domains/support/fixtures/accounts.json";
import type { ToolDefinition } from "@/domains/types";

const lookup = z.object({
  customerId: z.string().optional(),
  last4: z.string().regex(/^\d{4}$/).optional(),
});

type Customer = (typeof accounts.customers)[number];

function findCustomer(input: z.infer<typeof lookup>): Customer {
  const match =
    accounts.customers.find((customer) => customer.id === input.customerId) ??
    accounts.customers.find((customer) => customer.cardLast4 === input.last4) ??
    accounts.customers[0];
  if (!match) throw new Error("No synthetic customer fixture is loaded");
  return match;
}

export const supportTools: ToolDefinition[] = [
  {
    name: "getCardStatus",
    description: "Read the status of a synthetic fixture card.",
    sideEffect: false,
    inputSchema: lookup,
    execute: (input) => {
      const customer = findCustomer(lookup.parse(input));
      return { customerId: customer.id, last4: customer.cardLast4, status: customer.cardStatus };
    },
  },
  {
    name: "getRecentTransactions",
    description: "Read recent synthetic transactions.",
    sideEffect: false,
    inputSchema: lookup,
    execute: (input) => {
      const customer = findCustomer(lookup.parse(input));
      return { customerId: customer.id, transactions: customer.transactions };
    },
  },
  {
    name: "getTopUpStatus",
    description: "Read the latest synthetic top-up.",
    sideEffect: false,
    inputSchema: lookup,
    execute: (input) => {
      const customer = findCustomer(lookup.parse(input));
      return { customerId: customer.id, topUp: customer.topUp };
    },
  },
  {
    name: "freezeCard",
    description: "Write action. Requires human confirmation and does not change the fixture.",
    sideEffect: true,
    inputSchema: lookup.extend({ confirmed: z.boolean().optional() }),
    execute: (input) => {
      const parsed = lookup.extend({ confirmed: z.boolean().optional() }).parse(input);
      const customer = findCustomer(parsed);
      if (parsed.confirmed !== true) {
        return {
          customerId: customer.id,
          status: "confirmation_required",
          message: "Freezing the card changes account state and needs a person to confirm.",
        };
      }
      return {
        customerId: customer.id,
        status: "frozen_in_mock",
        message: "Mock freeze recorded for this request only. The fixture file was not modified.",
      };
    },
  },
];
