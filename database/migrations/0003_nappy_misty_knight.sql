CREATE TABLE `campaign_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`metric_name` text NOT NULL,
	`target_value` real NOT NULL,
	`period` text NOT NULL,
	`deadline_date` text,
	`status` text DEFAULT 'on_track',
	`last_evaluated_at` text,
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `competitor_analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`saved_competitor_id` text NOT NULL,
	`media_external_id` text,
	`caption` text,
	`likes` integer,
	`comments` integer,
	`posted_at` text,
	`fetched_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`saved_competitor_id`) REFERENCES `saved_competitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `funnel_analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`funnel_id` text NOT NULL,
	`stage_name` text NOT NULL,
	`posts_count` integer DEFAULT 0,
	`avg_reach` real,
	`avg_engagement_rate` real,
	`conversion_to_next_stage` real,
	`computed_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`funnel_id`) REFERENCES `funnels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `post_analytics` (
	`post_item_id` text PRIMARY KEY NOT NULL,
	`reach` real,
	`impressions` real,
	`engagement_rate` real,
	`saves` real,
	`comments` real,
	`period` text DEFAULT 'lifetime',
	`classification` text,
	`rubric_median_engagement_rate` real,
	`platform_median_engagement_rate` real,
	`computed_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`post_item_id`) REFERENCES `post_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `post_items` ADD `funnel_stage` text;