CREATE TYPE "public"."ai_mode" AS ENUM('inherit', 'off', 'server', 'webllm');--> statement-breakpoint
CREATE TABLE "organization_ai_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"mode" "ai_mode" DEFAULT 'inherit' NOT NULL,
	"base_url" text,
	"model" text,
	"api_key" text,
	"webllm_model" text,
	"tutor" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_ai_settings" ADD CONSTRAINT "organization_ai_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;