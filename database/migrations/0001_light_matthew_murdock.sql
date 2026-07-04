CREATE TABLE `connected_platforms` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`identifier` text NOT NULL,
	`label` text,
	`created_at` text DEFAULT (current_timestamp)
);
--> statement-breakpoint
ALTER TABLE `license` ADD `trial_started_at` text;