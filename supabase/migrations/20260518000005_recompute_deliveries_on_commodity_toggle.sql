-- Create a function that recomputes Delivery financial columns for all rows
-- of a given commodity, using the commodity's current cessApplicable flag.
-- Called from the commodities PUT handler whenever cessApplicable changes
-- so existing deliveries stay in sync with the toggle.
--
-- Formulas (must match calcDelivery in supabase/functions/deliveries/index.ts):
--   cessOnSale  = IF(commodity.cessApplicable, adjustedWeight × COALESCE(cessRate, saleRate) × 0.01, 0)
--   balanceCess = −COALESCE(cessPaid, 0)
--   mcDeduction = IF(moisturePct > 14, (moisturePct − 14)/100 × adjustedWeight × saleRate, 0)
--   saleValue   = (adjustedWeight × saleRate) − mcDeduction − cessOnSale − balanceCess
--   netPayable  = purchaseValue − mcDeduction − balanceCess        (no E1)
--   grossMargin = saleValue − netPayable

CREATE OR REPLACE FUNCTION recompute_deliveries_for_commodity(p_commodity_id TEXT)
RETURNS void
LANGUAGE sql
AS $$
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
    AND c.id = p_commodity_id
    AND d."saleRate"        IS NOT NULL
    AND d."adjustedWeight"  IS NOT NULL;
$$;

-- One-time backfill: recompute every commodity's deliveries from its current flag.
-- (Fixes rows where the commodity flag was toggled but stored values weren't refreshed.)
DO $$
DECLARE
  c_id TEXT;
BEGIN
  FOR c_id IN SELECT id FROM "Commodity" LOOP
    PERFORM recompute_deliveries_for_commodity(c_id);
  END LOOP;
END $$;
