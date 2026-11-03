-- Bisheriges Einzelmodell in die Liste der freigegebenen Modelle übernehmen
UPDATE "organization_ai_settings" SET "models" = jsonb_build_array(jsonb_build_object('id', "model", 'access', 'all')) WHERE "model" IS NOT NULL AND "model" <> '';--> statement-breakpoint
ALTER TABLE "organization_ai_settings" DROP COLUMN "model";
