CREATE TYPE "public"."ai_provider" AS ENUM('openai', 'anthropic');--> statement-breakpoint
ALTER TYPE "public"."ai_mode" ADD VALUE 'platform';--> statement-breakpoint
CREATE TABLE "ai_credit_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"user_id" uuid,
	"credits" integer NOT NULL,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"user_id" uuid NOT NULL,
	"source" "ai_mode" NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"millicredits" bigint DEFAULT 0 NOT NULL,
	"extra_millicredits" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_ai_settings" ADD COLUMN "provider" "ai_provider" DEFAULT 'openai' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_ai_settings" ADD COLUMN "models" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_ai_settings" ADD COLUMN "student_daily_requests" integer;--> statement-breakpoint
ALTER TABLE "organization_ai_settings" ADD COLUMN "student_daily_credits" integer;--> statement-breakpoint
ALTER TABLE "ai_credit_grants" ADD CONSTRAINT "ai_credit_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_grants" ADD CONSTRAINT "ai_credit_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_organization_idx" ON "ai_usage" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_user_idx" ON "ai_usage" USING btree ("user_id","created_at");