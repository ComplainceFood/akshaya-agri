-- Switch all rates from ₹/Quintal to ₹/Kg, and all stored weights from Quintal to Kg.
-- Column names are intentionally NOT renamed (DailySaleRate.ratePerQuintal still
-- exists; Delivery.grossWeight/tareWeight/adjustedWeight/netWeight still exist) —
-- only what they MEAN changes. Application code is updated in the same release.
--
-- Mathematical invariant: rate_qt × weight_qt = rate_kg × weight_kg
-- when rate_kg = rate_qt / 100 and weight_kg = weight_qt × 100.
-- So purchaseValue, saleValue, grossMargin, netPayable, cessOnSale, balanceCess
-- and mcDeduction are unchanged by this migration.

BEGIN;

-- ── Daily rate tables: divide ratePerQuintal by 100 (now ₹/Kg) ────────────────
UPDATE "DailySaleRate"     SET "ratePerQuintal" = "ratePerQuintal" / 100.0;
UPDATE "DailyPurchaseRate" SET "ratePerQuintal" = "ratePerQuintal" / 100.0;

-- ── Delivery: rates ÷ 100, weights × 100 ─────────────────────────────────────
UPDATE "Delivery"
SET
  "purchaseRate"   = CASE WHEN "purchaseRate"   IS NOT NULL THEN "purchaseRate"   / 100.0 END,
  "saleRate"       = CASE WHEN "saleRate"       IS NOT NULL THEN "saleRate"       / 100.0 END,
  "cessRate"       = CASE WHEN "cessRate"       IS NOT NULL THEN "cessRate"       / 100.0 END,
  "grossWeight"    = CASE WHEN "grossWeight"    IS NOT NULL THEN "grossWeight"    * 100.0 END,
  "tareWeight"     = CASE WHEN "tareWeight"     IS NOT NULL THEN "tareWeight"     * 100.0 END,
  "netWeight"      = CASE WHEN "netWeight"      IS NOT NULL THEN "netWeight"      * 100.0 END,
  "adjustedWeight" = CASE WHEN "adjustedWeight" IS NOT NULL THEN "adjustedWeight" * 100.0 END;

-- ── InvoiceItem: weight × 100 (now Kg), saleRate ÷ 100 (now ₹/Kg) ────────────
UPDATE "InvoiceItem"
SET
  "weight"   = CASE WHEN "weight"   IS NOT NULL THEN "weight"   * 100.0 END,
  "saleRate" = CASE WHEN "saleRate" IS NOT NULL THEN "saleRate" / 100.0 END;

-- ── Update recompute_deliveries_for_commodity to use rate-as-Kg semantics ────
-- The product rate × weight is unchanged, so the same SQL still produces the
-- right derived values. We rewrite the function purely to refresh its comment
-- so future readers know the columns are now in Kg / ₹-per-Kg.
COMMENT ON COLUMN "DailySaleRate"."ratePerQuintal"     IS 'Despite the column name, this is now stored in ₹/Kg (migrated 2026-05-18).';
COMMENT ON COLUMN "DailyPurchaseRate"."ratePerQuintal" IS 'Despite the column name, this is now stored in ₹/Kg (migrated 2026-05-18).';
COMMENT ON COLUMN "Delivery"."purchaseRate"            IS '₹/Kg (migrated from ₹/Qt on 2026-05-18).';
COMMENT ON COLUMN "Delivery"."saleRate"                IS '₹/Kg (migrated from ₹/Qt on 2026-05-18).';
COMMENT ON COLUMN "Delivery"."cessRate"                IS '₹/Kg (migrated from ₹/Qt on 2026-05-18).';
COMMENT ON COLUMN "Delivery"."grossWeight"             IS 'Kg (migrated from Quintal on 2026-05-18).';
COMMENT ON COLUMN "Delivery"."tareWeight"              IS 'Kg (migrated from Quintal on 2026-05-18).';
COMMENT ON COLUMN "Delivery"."netWeight"               IS 'Kg (migrated from Quintal on 2026-05-18).';
COMMENT ON COLUMN "Delivery"."adjustedWeight"          IS 'Kg (migrated from Quintal on 2026-05-18).';
COMMENT ON COLUMN "InvoiceItem"."weight"               IS 'Kg (migrated from Quintal on 2026-05-18).';
COMMENT ON COLUMN "InvoiceItem"."saleRate"             IS '₹/Kg (migrated from ₹/Qt on 2026-05-18).';

COMMIT;
