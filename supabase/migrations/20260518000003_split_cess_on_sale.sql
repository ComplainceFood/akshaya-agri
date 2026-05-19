-- Split cess into two separate deductions on the Delivery row:
--   cessOnSale  = 1% × adjustedWeight × COALESCE(cessRate, saleRate)  (when Commodity.cessApplicable)
--                = 0                                                    (when Commodity.cessApplicable = false)
--   balanceCess = −cessPaid   (always; represents refund of any supplier-paid cess)
--
-- Both terms are deducted symmetrically from saleValue and netPayable.
-- Previously balanceCess folded the on-sale cess and the refund together
-- (balanceCess = cessOnSale − cessPaid). They are now two separate columns
-- so the refund line is visible and supplier-side bookkeeping is unambiguous.
--
-- Formulas after this migration:
--   mcDeduction = IF(moisturePct > 14, (moisturePct − 14)/100 × grossSale, 0)
--   saleValue   = grossSale − mcDeduction − cessOnSale − balanceCess
--   netPayable  = purchaseValue − mcDeduction − cessOnSale − balanceCess
--   grossMargin = saleValue − netPayable     (which simplifies to grossSale − purchaseValue)

-- 1. Add cessOnSale column (NUMERIC(12,2), nullable - populated only when saleRate is known)
ALTER TABLE "Delivery"
  ADD COLUMN IF NOT EXISTS "cessOnSale" NUMERIC(12,2);

-- 2. Recompute cessOnSale, balanceCess, saleValue, netPayable, grossMargin
UPDATE "Delivery" d
SET
  "cessOnSale"  = CASE
                    WHEN c."cessApplicable" = true
                    THEN d."adjustedWeight" * COALESCE(d."cessRate", d."saleRate") * 0.01
                    ELSE 0
                  END,
  "balanceCess" = -COALESCE(d."cessPaid", 0),
  "saleValue"   = (d."adjustedWeight" * d."saleRate")
                  - CASE
                      WHEN COALESCE(d."moisturePct", 0) > 14
                      THEN ((d."moisturePct" - 14) / 100.0) * (d."adjustedWeight" * d."saleRate")
                      ELSE 0
                    END
                  - CASE
                      WHEN c."cessApplicable" = true
                      THEN d."adjustedWeight" * COALESCE(d."cessRate", d."saleRate") * 0.01
                      ELSE 0
                    END
                  - (-COALESCE(d."cessPaid", 0)),
  "netPayable"  = CASE
                    WHEN d."purchaseValue" IS NOT NULL
                    THEN d."purchaseValue"
                         - CASE
                             WHEN COALESCE(d."moisturePct", 0) > 14
                             THEN ((d."moisturePct" - 14) / 100.0) * (d."adjustedWeight" * d."saleRate")
                             ELSE 0
                           END
                         - CASE
                             WHEN c."cessApplicable" = true
                             THEN d."adjustedWeight" * COALESCE(d."cessRate", d."saleRate") * 0.01
                             ELSE 0
                           END
                         - (-COALESCE(d."cessPaid", 0))
                    ELSE NULL
                  END,
  "grossMargin" = CASE
                    WHEN d."purchaseValue" IS NOT NULL
                    THEN (d."adjustedWeight" * d."saleRate") - d."purchaseValue"
                    ELSE NULL
                  END,
  "updatedAt"   = NOW()
FROM "Commodity" c
WHERE d."commodityId" = c.id
  AND d."saleRate"        IS NOT NULL
  AND d."adjustedWeight"  IS NOT NULL;
