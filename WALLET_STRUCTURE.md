# SimTree Wallet System Structure

This document explains the wallet system structure and transaction flow in the SimTree platform.

## Wallet Types

The platform has different types of wallets depending on the company type:

### SimTree (Platform Owner - Company ID 1)

SimTree has **three wallet types**:

1. **General Wallet**: Records the total eSIM sales (as credits) and refunds (as debits). The balance of this wallet is displayed as the official "SimTree Balance" on the dashboard.
2. **Provider Wallet**: Records eSIM provider costs (as debits) and refunds (as credits). When displayed, the balance is shown as a positive number representing the total amount paid to providers.
3. **Profit Wallet**: Records the profit margin (as credits) and refund reversals (as debits).

### Client Companies

Client companies have **only one wallet type**:

1. **General Wallet**: Records wallet credits (as credits), eSIM purchases (as debits), and refunds (as credits).

## Transaction Flow

### eSIM Purchase Flow

When a client company purchases an eSIM:

1. **Client Company**:
   - DEBIT in General Wallet for the total eSIM price

2. **SimTree**:
   - CREDIT in General Wallet for the total eSIM price
   - CREDIT in Provider Wallet for the provider cost
   - CREDIT in Profit Wallet for the profit margin (total price - provider cost)

### eSIM Refund Flow

When an eSIM is refunded:

1. **Client Company**:
   - CREDIT in General Wallet for the total refund amount

2. **SimTree**:
   - DEBIT in General Wallet for the total refund amount
   - DEBIT in Provider Wallet for the provider cost
   - DEBIT in Profit Wallet for the profit margin

## Implementation Details

### Wallet Creation

- When SimTree (Company ID 1) is created, all three wallet types are created automatically
- When a client company is created, only a general wallet is created

### Transaction Linking

Transactions are linked through the `relatedTransactionId` field to show related transactions across wallets.

### Migration

We've migrated client company provider/profit transactions to SimTree to ensure proper accounting:

1. Any profit/provider transactions that were incorrectly recorded in client company wallets have been migrated to the corresponding SimTree wallets
2. Client company profit/provider wallets have been set to zero balance

## Reporting

The wallet structure enables accurate reporting:

- SimTree's general wallet shows total revenue
- SimTree's provider wallet shows provider costs
- SimTree's profit wallet shows the platform profit margin
- Client company wallets show only their credits, purchases, and refunds

## User Interface Display

The wallet system has specific display rules in the dashboard:

- **SimTree Balance**: Shows only the balance of the general wallet to represent the total platform balance
- **Provider Balances**: Shows the absolute value of the provider wallet balance as a positive number, representing the total amount paid to providers
- **Company Balances**: Shows the combined balance across all client company general wallets
- **SimTree Multi-Wallet Display**: Shows all three wallet types with their respective balances (general, profit, provider)
- **Profit Transactions**: Shows the profit credit transactions and the related provider debit transactions to provide full visibility on profit margins

## Scripts

- `scripts/fix-wallet-structure.ts`: Migrates misplaced transactions and fixes the wallet structure
- `scripts/rebalance-wallets.ts`: Recalculates wallet balances based on transactions to ensure data integrity