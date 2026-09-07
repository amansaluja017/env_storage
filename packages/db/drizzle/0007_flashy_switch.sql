ALTER TABLE "envs" ADD COLUMN "created_by_id" uuid;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "created_by_id" uuid;--> statement-breakpoint
ALTER TABLE "envs" ADD CONSTRAINT "envs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;