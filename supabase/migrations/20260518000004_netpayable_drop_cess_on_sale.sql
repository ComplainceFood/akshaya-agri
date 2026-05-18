-- Remove cessOnSale (E1) from netPayable.
--
-- Rationale: cessOnSale is the customer's 1% deduction from us. It is NOT recovered
-- from the supplier — that would be a double-deduction (and would also wipe it
-- out of the margin entirely, since the same term would cancel between saleValue
-- and netPayable). MC stays pass-through (the customer deducts MC from what they
-- pay us, and we deduct the same MC from the supplier on netPayable). balanceCess
-- (= −cessPaid) stays as supplier refund.
--
-- Formulas after this migration:
--   saleValue   = grossSale − mcDeduction − cessOnSale − balanceCess
--   netPayable  = purchaseValue − mcDeduction − balanceCess         (no E1)
--   grossMargin = saleValue − netPayable
--               = (grossSale − purchaseValue) − cessOnSale

UPDATE "Delivery" d
SET
  "netPayable"  = CASE
                    WHEN d."purchaseValue" IS NOT NULL
                    THEN d."purchaseValue"
                         - CASE
                             WHEN COALESCE(d."moisturePct", 0) > 14
                             THEN ((d."moisturePct" - 14) / 100.0) * (d."adjustedWeight" * d."saleRate")
                             ELSE 0
                           END
                         - (-COALESCE(d."cessPaid", 0))
                    ELSE NULL
                  END,
  "grossMargin" = CASE
                    WHEN d."purchaseValue" IS NOT NULL
                    THEN (d."adjustedWeight" * d."saleRate") - d."purchaseValue"
                         - CASE
                             WHEN c."cessApplicable" = true
                             THEN d."adjustedWeight" * COALESCE(d."cessRate", d."saleRate") * 0.01
                             ELSE 0
                           END
                    ELSE NULL
                  END,
  "updatedAt"   = NOW()
FROM "Commodity" c
WHERE d."commodityId" = c.id
  AND d."saleRate"        IS NOT NULL
  AND d."adjustedWeight"  IS NOT NULL;
