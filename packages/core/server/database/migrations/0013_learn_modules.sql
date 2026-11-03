CREATE TABLE "group_learn_modules" (
	"group_id" uuid NOT NULL,
	"module_id" text NOT NULL,
	"enabled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_learn_modules_group_id_module_id_pk" PRIMARY KEY("group_id","module_id")
);
--> statement-breakpoint
ALTER TABLE "cloud_projects" ADD COLUMN "learn_module" text;--> statement-breakpoint
ALTER TABLE "group_learn_modules" ADD CONSTRAINT "group_learn_modules_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_learn_modules" ADD CONSTRAINT "group_learn_modules_enabled_by_users_id_fk" FOREIGN KEY ("enabled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_projects_owner_learn_idx" ON "cloud_projects" USING btree ("owner_id","learn_module") WHERE "cloud_projects"."learn_module" IS NOT NULL;