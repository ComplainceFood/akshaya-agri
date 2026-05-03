-- Invoice tables for Akshaya Agri Solutions
-- Run in Supabase SQL Editor

-- First check actual id types (run this separately if unsure):
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name IN ('Customer','Commodity','Delivery') AND column_name = 'id';

CREATE TABLE IF NOT EXISTS "Invoice" (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "invoiceNumber"  TEXT NOT NULL UNIQUE,
  "customerId"     TEXT NOT NULL REFERENCES "Customer"(id),
  "commodityId"    TEXT REFERENCES "Commodity"(id),
  "invoiceDate"    DATE NOT NULL,
  "totalWeight"    NUMERIC(12,3),
  "totalAmount"    NUMERIC(14,2) NOT NULL,
  status           TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT | SENT | PAID
  "sentAt"         TIMESTAMPTZ,
  notes            TEXT,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "InvoiceItem" (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "invoiceId"     TEXT NOT NULL REFERENCES "Invoice"(id) ON DELETE CASCADE,
  "deliveryId"    TEXT REFERENCES "Delivery"(id),
  "lrNumber"      TEXT,
  "vehicleNumber" TEXT,
  weight          NUMERIC(12,3),
  "saleRate"      NUMERIC(10,2),
  amount          NUMERIC(14,2) NOT NULL
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_invoice_customer ON "Invoice"("customerId");
CREATE INDEX IF NOT EXISTS idx_invoice_date     ON "Invoice"("invoiceDate");
CREATE INDEX IF NOT EXISTS idx_invoiceitem_inv  ON "InvoiceItem"("invoiceId");

-- Ensure Customer has email + pincode columns for invoices
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "billingPincode" TEXT;

-- Ensure Delivery has commodityId (TEXT to match Commodity.id type)
-- Only run if it doesn't exist yet:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Delivery' AND column_name = 'commodityId'
  ) THEN
    ALTER TABLE "Delivery" ADD COLUMN "commodityId" TEXT REFERENCES "Commodity"(id);
  END IF;
END $$;
