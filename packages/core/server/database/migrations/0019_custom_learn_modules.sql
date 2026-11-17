CREATE TABLE "custom_learn_modules" (
	"id" text PRIMARY KEY DEFAULT ('custom-' || gen_random_uuid()::text) NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_learn_modules_id_check" CHECK ("custom_learn_modules"."id" LIKE 'custom-%')
);
--> statement-breakpoint
ALTER TABLE "custom_learn_modules" ADD CONSTRAINT "custom_learn_modules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_learn_modules" ADD CONSTRAINT "custom_learn_modules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_learn_modules" ADD CONSTRAINT "custom_learn_modules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_learn_modules_organization_idx" ON "custom_learn_modules" USING btree ("organization_id");