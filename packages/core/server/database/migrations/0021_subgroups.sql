DROP INDEX "groups_organization_name_idx";--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "collab_mode" text;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_parent_id_groups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "groups_parent_name_idx" ON "groups" USING btree ("parent_id","name") WHERE "groups"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "groups_organization_name_idx" ON "groups" USING btree ("organization_id","name") WHERE "groups"."parent_id" IS NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_collab_mode_check" CHECK (("groups"."parent_id" IS NULL) = ("groups"."collab_mode" IS NULL) AND coalesce("groups"."collab_mode" IN ('project', 'world'), true));