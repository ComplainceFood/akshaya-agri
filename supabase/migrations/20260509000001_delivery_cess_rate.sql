-- Store the daily sale rate used for cess calculation separately from the delivery's saleRate
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "cessRate" NUMERIC(12,4);
