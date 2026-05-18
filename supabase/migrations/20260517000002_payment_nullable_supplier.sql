-- Allow bank-imported payments to be saved without a supplier/customer mapping.
-- The paidTo and accountRef fields store the raw beneficiary info for later matching.

ALTER TABLE "SupplierPayment"
  ALTER COLUMN "supplierId" DROP NOT NULL;

ALTER TABLE "SupplierPayment"
  ADD COLUMN IF NOT EXISTS "paidTo"     TEXT,
  ADD COLUMN IF NOT EXISTS "accountRef" TEXT,
  ADD COLUMN IF NOT EXISTS "bankRef"    TEXT;

ALTER TABLE "CustomerReceipt"
  ALTER COLUMN "customerId" DROP NOT NULL;

ALTER TABLE "CustomerReceipt"
  ADD COLUMN IF NOT EXISTS "paidTo"     TEXT,
  ADD COLUMN IF NOT EXISTS "accountRef" TEXT,
  ADD COLUMN IF NOT EXISTS "bankRef"    TEXT;
