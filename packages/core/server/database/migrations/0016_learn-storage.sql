ALTER TABLE "groups" ADD COLUMN "learn_storage" text[];--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "learn_storage" text[] DEFAULT '{"cloud","browser","folder"}' NOT NULL;