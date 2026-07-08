CREATE TABLE `analytics_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`insight_type` text NOT NULL,
	`payload` text NOT NULL,
	`generated_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `brand_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`category` text NOT NULL,
	`source_type` text NOT NULL,
	`source_ref` text,
	`fact_text` text NOT NULL,
	`confidence` real DEFAULT 1,
	`validated` integer DEFAULT 0,
	`language` text DEFAULT 'ru',
	`canonical_fact_id` text,
	`created_at` text DEFAULT (current_timestamp),
	`updated_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `policy_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`code` text NOT NULL,
	`description` text NOT NULL,
	`pattern` text,
	`severity` text DEFAULT 'warning',
	`enabled` integer DEFAULT 1,
	`created_at` text DEFAULT (current_timestamp)
);
--> statement-breakpoint
CREATE TABLE `review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`post_item_id` text NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`event_type` text NOT NULL,
	`payload` text,
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`post_item_id`) REFERENCES `post_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `draft_versions` ADD `used_brand_facts` text;--> statement-breakpoint
ALTER TABLE `draft_versions` ADD `risk_score` real;--> statement-breakpoint
ALTER TABLE `draft_versions` ADD `risk_tags` text;--> statement-breakpoint
ALTER TABLE `draft_versions` ADD `explanation` text;--> statement-breakpoint
ALTER TABLE `draft_versions` ADD `language` text DEFAULT 'ru';--> statement-breakpoint
ALTER TABLE `post_items` ADD `review_status` text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `post_items` ADD `last_reviewed_by` text;--> statement-breakpoint
ALTER TABLE `post_items` ADD `last_reviewed_at` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `primary_language` text DEFAULT 'ru';--> statement-breakpoint
ALTER TABLE `projects` ADD `supported_languages` text;