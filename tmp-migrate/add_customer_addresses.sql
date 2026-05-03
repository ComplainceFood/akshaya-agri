ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "billingVillage"  TEXT,
  ADD COLUMN IF NOT EXISTS "billingDistrict" TEXT,
  ADD COLUMN IF NOT EXISTS "billingState"    TEXT,
  ADD COLUMN IF NOT EXISTS "billingAddress"  TEXT,
  ADD COLUMN IF NOT EXISTS "shippingVillage"  TEXT,
  ADD COLUMN IF NOT EXISTS "shippingDistrict" TEXT,
  ADD COLUMN IF NOT EXISTS "shippingState"    TEXT,
  ADD COLUMN IF NOT EXISTS "shippingAddress"  TEXT,
  ADD COLUMN IF NOT EXISTS "shippingSameAsBilling" BOOLEAN NOT NULL DEFAULT false;
