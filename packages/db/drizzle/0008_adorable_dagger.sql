DO $$ BEGIN
  CREATE TYPE "public"."team_member_role" AS ENUM('member', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "team_members" ALTER COLUMN "role" DROP DEFAULT;
  ALTER TABLE "team_members" ALTER COLUMN "role" SET DATA TYPE team_member_role USING "role"::team_member_role;
  ALTER TABLE "team_members" ALTER COLUMN "role" SET DEFAULT 'member'::team_member_role;
EXCEPTION
  WHEN others THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "role";