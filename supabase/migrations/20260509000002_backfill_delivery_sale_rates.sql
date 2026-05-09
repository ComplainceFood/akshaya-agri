-- Backfill saleRate and cessRate on all Delivery rows from DailySaleRate for matching date + commodity.
-- Also recalculates saleValue, grossMargin, balanceCess, netPayable to match.
UPDATE "Delivery" d
SET
  "saleRate"    = dsr."ratePerQuintal",
  "cessRate"    = dsr."ratePerQuintal",
  "saleValue"   = d."adjustedWeight" * dsr."ratePerQuintal",
  "grossMargin" = CASE
                    WHEN d."purchaseValue" IS NOT NULL
                    THEN d."adjustedWeight" * dsr."ratePerQuintal" - d."purchaseValue"
                    ELSE NULL
                  END,
  "balanceCess" = CASE
                    WHEN d."cessApplicable" = true
                    THEN d."adjustedWeight" * dsr."ratePerQuintal" * 0.01 - COALESCE(d."cessPaid", 0)
                    ELSE -COALESCE(d."cessPaid", 0)
                  END,
  "netPayable"  = CASE
                    WHEN d."purchaseValue" IS NOT NULL
                    THEN d."purchaseValue"
                         - CASE
                             WHEN d."cessApplicable" = true
                             THEN d."adjustedWeight" * dsr."ratePerQuintal" * 0.01 - COALESCE(d."cessPaid", 0)
                             ELSE -COALESCE(d."cessPaid", 0)
                           END
                         - COALESCE(
                             CASE
                               WHEN COALESCE(d."moisturePct", 0) > 14
                               THEN ((d."moisturePct" - 14) / 100.0) * (d."adjustedWeight" * dsr."ratePerQuintal")
                               ELSE 0
                             END, 0)
                    ELSE NULL
                  END,
  "updatedAt"   = NOW()
FROM "DailySaleRate" dsr
WHERE dsr."rateDate"    = d."deliveryDate"
  AND dsr."commodityId" = d."commodityId";
