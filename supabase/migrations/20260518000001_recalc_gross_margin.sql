-- Recompute Delivery financial columns to reflect the corrected model:
--   * saleValue is the NET realisation from the customer:
--       saleValue = adjustedWeight × saleRate − cessOnSale − mcDeduction
--     where:
--       cessOnSale  = 1% × adjustedWeight × COALESCE(cessRate, saleRate)
--       mcDeduction = ((moisturePct − 14) / 100) × (adjustedWeight × saleRate),
--                     only when moisturePct > 14
--   * grossMargin = saleValue − purchaseValue
--     (cess and MC are already inside saleValue; no further subtraction)
--   * netPayable  = purchaseValue − balanceCess − mcDeduction
--     (MC pass-through to supplier matches what the customer deducted from us)
--
-- Invoices remain billed at gross (rate × weight). This backfill only touches the
-- Delivery row's financial fields; InvoiceItem.amount is not recomputed here.
UPDATE "Delivery"
SET
  "saleValue"   = ("adjustedWeight" * "saleRate")
                  - ("adjustedWeight" * COALESCE("cessRate", "saleRate") * 0.01)
                  - CASE
                      WHEN COALESCE("moisturePct", 0) > 14
                      THEN (("moisturePct" - 14) / 100.0) * ("adjustedWeight" * "saleRate")
                      ELSE 0
                    END,
  "grossMargin" = CASE
                    WHEN "purchaseValue" IS NOT NULL
                    THEN (("adjustedWeight" * "saleRate")
                          - ("adjustedWeight" * COALESCE("cessRate", "saleRate") * 0.01)
                          - CASE
                              WHEN COALESCE("moisturePct", 0) > 14
                              THEN (("moisturePct" - 14) / 100.0) * ("adjustedWeight" * "saleRate")
                              ELSE 0
                            END
                         ) - "purchaseValue"
                    ELSE NULL
                  END,
  "netPayable"  = CASE
                    WHEN "purchaseValue" IS NOT NULL
                    THEN "purchaseValue"
                         - CASE
                             WHEN "cessApplicable" = true
                             THEN "adjustedWeight" * COALESCE("cessRate", "saleRate") * 0.01 - COALESCE("cessPaid", 0)
                             ELSE -COALESCE("cessPaid", 0)
                           END
                         - CASE
                             WHEN COALESCE("moisturePct", 0) > 14
                             THEN (("moisturePct" - 14) / 100.0) * ("adjustedWeight" * "saleRate")
                             ELSE 0
                           END
                    ELSE NULL
                  END,
  "updatedAt"   = NOW()
WHERE "saleRate" IS NOT NULL
  AND "adjustedWeight" IS NOT NULL;
