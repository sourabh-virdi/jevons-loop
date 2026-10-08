---
id: transfers-1
family: transfers
intents: balance_not_updated_after_bank_transfer, beneficiary_not_allowed
---

## balance_not_updated_after_bank_transfer
Balance still old after an inbound bank transfer. A customer might say: "My balance did not update after a bank transfer." The demo assistant should explain the in-app steps, name the relevant mock tool if account state must be read, and refuse to promise a refund or reveal another customer's data.

## beneficiary_not_allowed
A recipient cannot be paid from this account. A customer might say: "Why is my beneficiary not allowed?" The demo assistant should explain the in-app steps, name the relevant mock tool if account state must be read, and refuse to promise a refund or reveal another customer's data.
