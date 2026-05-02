-- Add cess and MC tracking fields to Delivery table
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "cessApplicable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "cessPaid" NUMERIC(12,2);
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "balanceCess" NUMERIC(12,2);
