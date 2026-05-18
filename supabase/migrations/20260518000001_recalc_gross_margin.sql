-- Recompute grossMargin on existing Delivery rows using the corrected formula:
--   grossMargin = saleValue - purchaseValue - cessOnSale - mcDeduction
-- where:
--   cessOnSale   = 1% of saleValue (always deducted, irrespective of cessApplicable)
--   mcDeduction  = ((moisturePct - 14) / 100) * saleValue, only when moisturePct > 14
-- Cess and moisture deduction are based on sale rate (rate paid to us by the customer).
UPDATE "Delivery"
SET
  "grossMargin" = "saleValue"
                  - "purchaseValue"
                  - ("saleValue" * 0.01)
                  - CASE
                      WHEN COALESCE("moisturePct", 0) > 14
                      THEN (("moisturePct" - 14) / 100.0) * "saleValue"
                      ELSE 0
                    END,
  "updatedAt"   = NOW()
WHERE "saleValue" IS NOT NULL
  AND "purchaseValue" IS NOT NULL;
