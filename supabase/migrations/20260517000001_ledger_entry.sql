-- LedgerEntry: manual journal entries (bank statement imports, adjustments)
CREATE TABLE IF NOT EXISTS "LedgerEntry" (
  "id"          TEXT PRIMARY KEY,
  "entryDate"   DATE NOT NULL,
  "type"        TEXT NOT NULL CHECK ("type" IN ('DEBIT', 'CREDIT')),
  "category"    TEXT NOT NULL,  -- e.g. BANK_TRANSFER, EXPENSE, INCOME, ADJUSTMENT
  "description" TEXT NOT NULL,
  "amount"      NUMERIC(14,2) NOT NULL,
  "reference"   TEXT,           -- cheque/UTR number, bank ref
  "bankAccount" TEXT,           -- which bank account
  "notes"       TEXT,
  "source"      TEXT NOT NULL DEFAULT 'MANUAL',  -- MANUAL | BANK_IMPORT
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entry_date ON "LedgerEntry" ("entryDate");
CREATE INDEX IF NOT EXISTS idx_ledger_entry_type ON "LedgerEntry" ("type");
