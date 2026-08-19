-- Items the Guangzhou and Hong Kong desks were missing from the cargo picker.
-- Reference data, not schema. Safe to re-run: each row is matched on the unique
-- (category, name) pair and updated rather than duplicated.
BEGIN;

-- Guangzhou carries normal goods. "Camera (no battery)" is named for the rule
-- it exists to express: a battery is what forces a consignment onto the Hong
-- Kong routing, so a camera without one may fly the cheaper way.
INSERT INTO "CargoType" ("id","name","category","route","keywords","active","sortOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text,'Hats','NORMAL_GOODS','GUANGZHOU','hat,hats,cap,caps,帽子,鸭舌帽',true,900,now(),now()),
  (gen_random_uuid()::text,'Bracelets','NORMAL_GOODS','GUANGZHOU','bracelet,bracelets,bangle,手链,手镯',true,901,now(),now()),
  (gen_random_uuid()::text,'Fabrics','NORMAL_GOODS','GUANGZHOU','fabric,fabrics,cloth,textile,布料,面料,纺织',true,902,now(),now()),
  (gen_random_uuid()::text,'Camera (no battery)','NORMAL_GOODS','GUANGZHOU','camera,cameras,相机,照相机,无电池',true,903,now(),now()),
  -- Cosmetics contain liquids, which is why they route through Hong Kong.
  (gen_random_uuid()::text,'Cosmetics','LIQUID_SPECIAL','HONG_KONG','cosmetic,cosmetics,makeup,skincare,化妆品,护肤品,彩妆',true,904,now(),now())
ON CONFLICT ("category","name") DO UPDATE
  SET "active" = true,
      "route" = EXCLUDED."route",
      "keywords" = EXCLUDED."keywords",
      "updatedAt" = now();

-- Bags was already on the list, switched off and with no route, so it never
-- appeared in the picker at all.
UPDATE "CargoType"
   SET "active" = true, "route" = 'GUANGZHOU', "updatedAt" = now()
 WHERE "name" = 'Bags' AND "category" = 'NORMAL_GOODS';

COMMIT;
