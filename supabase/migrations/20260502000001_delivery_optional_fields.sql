-- Make supplierId, purchaseOrderId, purchaseRate optional on Delivery
-- so PDF imports can be saved without those fields and filled in later via edit

ALTER TABLE "Delivery" ALTER COLUMN "supplierId" DROP NOT NULL;
ALTER TABLE "Delivery" ALTER COLUMN "purchaseOrderId" DROP NOT NULL;
ALTER TABLE "Delivery" ALTER COLUMN "purchaseRate" DROP NOT NULL;
ALTER TABLE "Delivery" ALTER COLUMN "purchaseValue" DROP NOT NULL;
ALTER TABLE "Delivery" ALTER COLUMN "adjustedWeight" DROP NOT NULL;
ALTER TABLE "Delivery" ALTER COLUMN "netWeight" DROP NOT NULL;
