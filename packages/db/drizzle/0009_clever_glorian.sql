DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'envs_scope_folder_key_unique') THEN
    ALTER TABLE "envs" ADD CONSTRAINT "envs_scope_folder_key_unique" UNIQUE NULLS NOT DISTINCT("workspace_id","team_id","environment","folder_id","key");
  END IF;
END $$;
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."user_role";