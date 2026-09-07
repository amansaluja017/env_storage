DO $$ BEGIN
  CREATE TYPE "public"."user_role" AS ENUM('admin', 'member');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
    ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE user_role USING "role"::user_role;
    ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'member'::user_role;
  END IF;
END $$;