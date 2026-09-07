CREATE TYPE "public"."team_member_role" AS ENUM('member', 'admin');--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "role" SET DATA TYPE team_member_role USING "role"::team_member_role;--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "role" SET DEFAULT 'member'::team_member_role;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";