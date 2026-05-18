-- Recompute Delivery financial columns to reflect the corrected model:
--   * balanceCess captures the entire cess effect on the deal:
--       cessApplicable=Yes → cessOnSale − cessPaid (we deduct from supplier; refund if overpaid)
--       cessApplicable=No  → −cessPaid             (we refund whatever the supplier paid)
--     where cessOnSale = 1% × adjustedWeight × COALESCE(cessRate, saleRate)
--   * saleValue is the NET realisation from the customer:
--       saleValue = adjustedWeight × saleRate − mcDeduction − balanceCess
--     where mcDeduction = ((moisturePct − 14) / 100) × (adjustedWeight × saleRate),
--     only when moisturePct > 14.
--     Cess is fully expressed via balanceCess; subtracting it mirrors what we either
--     recover from or refund to the supplier on the same line.
--   * netPayable  = purchaseValue − balanceCess − mcDeduction
--   * grossMargin = saleValue − netPayable
--
-- Invoices remain billed at gross (rate × weight). This backfill only touches the
-- Delivery row's financial fields; InvoiceItem.amount is not recomputed here.
UPDATE "Delivery"
SET
  "saleValue"   = ("adjustedWeight" * "saleRate")
                  - CASE
                      WHEN COALESCE("moisturePct", 0) > 14
                      THEN (("moisturePct" - 14) / 100.0) * ("adjustedWeight" * "saleRate")
                      ELSE 0
                    END
                  - CASE
                      WHEN "cessApplicable" = true
                      THEN "adjustedWeight" * COALESCE("cessRate", "saleRate") * 0.01 - COALESCE("cessPaid", 0)
                      ELSE -COALESCE("cessPaid", 0)
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
  "grossMargin" = CASE
                    WHEN "purchaseValue" IS NOT NULL
                    THEN
                      -- saleValue (gross − MC − balanceCess)
                      (("adjustedWeight" * "saleRate")
                        - CASE
                            WHEN COALESCE("moisturePct", 0) > 14
                            THEN (("moisturePct" - 14) / 100.0) * ("adjustedWeight" * "saleRate")
                            ELSE 0
                          END
                        - CASE
                            WHEN "cessApplicable" = true
                            THEN "adjustedWeight" * COALESCE("cessRate", "saleRate") * 0.01 - COALESCE("cessPaid", 0)
                            ELSE -COALESCE("cessPaid", 0)
                          END)
                      -
                      -- netPayable (purchase − balanceCess − MC)
                      ("purchaseValue"
                        - CASE
                            WHEN "cessApplicable" = true
                            THEN "adjustedWeight" * COALESCE("cessRate", "saleRate") * 0.01 - COALESCE("cessPaid", 0)
                            ELSE -COALESCE("cessPaid", 0)
                          END
                        - CASE
                            WHEN COALESCE("moisturePct", 0) > 14
                            THEN (("moisturePct" - 14) / 100.0) * ("adjustedWeight" * "saleRate")
                            ELSE 0
                          END)
                    ELSE NULL
                  END,
  "updatedAt"   = NOW()
WHERE "saleRate" IS NOT NULL
  AND "adjustedWeight" IS NOT NULL;
