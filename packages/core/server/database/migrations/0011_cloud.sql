CREATE TYPE "public"."group_role" AS ENUM('leader', 'member');--> statement-breakpoint
CREATE TABLE "cloud_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"path" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_files" (
	"project_id" uuid NOT NULL,
	"path" text NOT NULL,
	"folder" boolean DEFAULT false NOT NULL,
	"content" text,
	"size" integer DEFAULT 0 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"revision" bigint NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_files_project_id_path_pk" PRIMARY KEY("project_id","path")
);
--> statement-breakpoint
CREATE TABLE "cloud_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"group_id" uuid,
	"assignment_id" uuid,
	"name" text NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"size" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_projects_owner_or_group" CHECK (("cloud_projects"."owner_id" IS NULL) <> ("cloud_projects"."group_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "group_role" DEFAULT 'member' NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"members_can_write" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cloud_assignments" ADD CONSTRAINT "cloud_assignments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_assignments" ADD CONSTRAINT "cloud_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_files" ADD CONSTRAINT "cloud_files_project_id_cloud_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."cloud_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_files" ADD CONSTRAINT "cloud_files_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_projects" ADD CONSTRAINT "cloud_projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_projects" ADD CONSTRAINT "cloud_projects_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_projects" ADD CONSTRAINT "cloud_projects_assignment_id_cloud_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."cloud_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_assignments_group_path_idx" ON "cloud_assignments" USING btree ("group_id","path");--> statement-breakpoint
CREATE INDEX "cloud_files_revision_idx" ON "cloud_files" USING btree ("project_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_projects_owner_name_idx" ON "cloud_projects" USING btree ("owner_id","name") WHERE "cloud_projects"."owner_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_projects_group_idx" ON "cloud_projects" USING btree ("group_id") WHERE "cloud_projects"."group_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cloud_projects_assignment_idx" ON "cloud_projects" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_organization_name_idx" ON "groups" USING btree ("organization_id","name");