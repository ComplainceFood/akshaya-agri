-- Move cessApplicable from Delivery → Commodity.
--
-- Rationale: cess applicability is a property of the commodity (1% APMC cess
-- based on commodity category), not a per-delivery decision. Storing it on
-- the commodity removes redundant data entry and the per-row toggle in the UI.
--
-- Steps:
--   1. Add Commodity.cessApplicable (default true; most agri commodities attract cess).
--   2. Backfill from existing Delivery rows: for each commodity, set the flag to
--      whatever value appears on the MAJORITY of its deliveries. Ties favour true.
--      Commodities with no deliveries keep the default (true).
--   3. Recompute Delivery.saleValue, grossMargin, netPayable using the commodity flag.
--      (Same formula as 20260518000001 but reads from Commodity, not Delivery.)
--   4. Drop Delivery.cessApplicable.

-- 1. Add the column
ALTER TABLE "Commodity"
  ADD COLUMN IF NOT EXISTS "cessApplicable" BOOLEAN NOT NULL DEFAULT true;

-- 2. Backfill from per-commodity majority of existing deliveries.
--    Uses count(*) FILTER (WHERE ...) on each side; ties (true_count = false_count) → true.
WITH counts AS (
  SELECT
    "commodityId",
    COUNT(*) FILTER (WHERE "cessApplicable" = true)  AS true_count,
    COUNT(*) FILTER (WHERE "cessApplicable" = false) AS false_count
  FROM "Delivery"
  WHERE "commodityId" IS NOT NULL
  GROUP BY "commodityId"
)
UPDATE "Commodity" c
SET "cessApplicable" = (counts.true_count >= counts.false_count),
    "updatedAt"      = NOW()
FROM counts
WHERE c.id = counts."commodityId";

-- 3. Recompute Delivery financial columns using the commodity flag (same formula
--    as 20260518000001 but cessApplicable now comes from Commodity).
UPDATE "Delivery" d
SET
  "saleValue"   = (d."adjustedWeight" * d."saleRate")
                  - CASE
                      WHEN COALESCE(d."moisturePct", 0) > 14
                      THEN ((d."moisturePct" - 14) / 100.0) * (d."adjustedWeight" * d."saleRate")
                      ELSE 0
                    END
                  - CASE
                      WHEN c."cessApplicable" = true
                      THEN d."adjustedWeight" * COALESCE(d."cessRate", d."saleRate") * 0.01 - COALESCE(d."cessPaid", 0)
                      ELSE -COALESCE(d."cessPaid", 0)
                    END,
  "netPayable"  = CASE
                    WHEN d."purchaseValue" IS NOT NULL
                    THEN d."purchaseValue"
                         - CASE
                             WHEN c."cessApplicable" = true
                             THEN d."adjustedWeight" * COALESCE(d."cessRate", d."saleRate") * 0.01 - COALESCE(d."cessPaid", 0)
                             ELSE -COALESCE(d."cessPaid", 0)
                           END
                         - CASE
                             WHEN COALESCE(d."moisturePct", 0) > 14
                             THEN ((d."moisturePct" - 14) / 100.0) * (d."adjustedWeight" * d."saleRate")
                             ELSE 0
                           END
                    ELSE NULL
                  END,
  "grossMargin" = CASE
                    WHEN d."purchaseValue" IS NOT NULL
                    THEN
                      ((d."adjustedWeight" * d."saleRate")
                        - CASE
                            WHEN COALESCE(d."moisturePct", 0) > 14
                            THEN ((d."moisturePct" - 14) / 100.0) * (d."adjustedWeight" * d."saleRate")
                            ELSE 0
                          END
                        - CASE
                            WHEN c."cessApplicable" = true
                            THEN d."adjustedWeight" * COALESCE(d."cessRate", d."saleRate") * 0.01 - COALESCE(d."cessPaid", 0)
                            ELSE -COALESCE(d."cessPaid", 0)
                          END)
                      -
                      (d."purchaseValue"
                        - CASE
                            WHEN c."cessApplicable" = true
                            THEN d."adjustedWeight" * COALESCE(d."cessRate", d."saleRate") * 0.01 - COALESCE(d."cessPaid", 0)
                            ELSE -COALESCE(d."cessPaid", 0)
                          END
                        - CASE
                            WHEN COALESCE(d."moisturePct", 0) > 14
                            THEN ((d."moisturePct" - 14) / 100.0) * (d."adjustedWeight" * d."saleRate")
                            ELSE 0
                          END)
                    ELSE NULL
                  END,
  "updatedAt"   = NOW()
FROM "Commodity" c
WHERE d."commodityId" = c.id
  AND d."saleRate"        IS NOT NULL
  AND d."adjustedWeight"  IS NOT NULL;

-- 4. Drop the now-redundant per-delivery column.
ALTER TABLE "Delivery" DROP COLUMN IF EXISTS "cessApplicable";
