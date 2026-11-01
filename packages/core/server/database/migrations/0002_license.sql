-- Heißt der DB-Nutzer wie das Hilfsschema `klonk`, würde "$user" im search_path neue Tabellen dorthin legen
SET search_path TO public;
--> statement-breakpoint
ALTER ROLE CURRENT_USER SET search_path = public;
--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "license_token" text;