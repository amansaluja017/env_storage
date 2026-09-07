CREATE TABLE "envs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"environment" varchar(50) DEFAULT 'development' NOT NULL,
	"folder_id" uuid,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"is_secret" boolean DEFAULT true NOT NULL,
	"comment" text,
	"created_by" text DEFAULT 'Unknown' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"environment" varchar(50) DEFAULT 'development' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" text DEFAULT 'Unknown' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "envs" ADD CONSTRAINT "envs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envs" ADD CONSTRAINT "envs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envs" ADD CONSTRAINT "envs_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "envs_scope_idx" ON "envs" USING btree ("workspace_id","team_id","environment");--> statement-breakpoint
CREATE INDEX "envs_folder_idx" ON "envs" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "envs_key_idx" ON "envs" USING btree ("key");--> statement-breakpoint
CREATE INDEX "folders_scope_idx" ON "folders" USING btree ("workspace_id","team_id","environment");