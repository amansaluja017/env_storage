DO $$ BEGIN
  CREATE TYPE "public"."token_type" AS ENUM('verificationToken', 'passwordResetToken', 'inviteToken', 'refreshToken');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "tokens" ALTER COLUMN "type" SET DATA TYPE token_type USING "type"::token_type;