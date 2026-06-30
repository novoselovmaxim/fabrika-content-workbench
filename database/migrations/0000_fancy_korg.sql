CREATE TABLE `analytics_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`post_item_id` text,
	`instagram_media_id` text,
	`metric_name` text NOT NULL,
	`metric_value` real,
	`metric_period` text,
	`snapshot_date` text,
	`raw_payload_path` text,
	FOREIGN KEY (`post_item_id`) REFERENCES `post_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`post_item_id` text,
	`type` text NOT NULL,
	`source_type` text DEFAULT 'manual_upload',
	`source_path` text,
	`source_url` text,
	`prompt_used` text,
	`external_origin_note` text,
	`width` integer,
	`height` integer,
	`duration` integer,
	`preview_path` text,
	`status` text DEFAULT 'attached',
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`post_item_id`) REFERENCES `post_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audiences` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`portrait` text,
	`demographics` text,
	`pains` text,
	`hant_stages` text,
	`prompt_used` text,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (current_timestamp),
	`updated_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`product_id` text,
	`platform_id` text,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`context_step` text,
	`applied` integer DEFAULT 0,
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `competitor_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`keywords` text,
	`search_engine` text DEFAULT 'tavily',
	`region` text,
	`language` text,
	`result_json` text,
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `content_textures` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`example_prompt` text,
	`hant_stages` text,
	`ordering` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_textures_code_unique` ON `content_textures` (`code`);--> statement-breakpoint
CREATE TABLE `content_types` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`platform` text DEFAULT 'instagram',
	`default_pipeline_template` text,
	`default_cta` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_types_code_unique` ON `content_types` (`code`);--> statement-breakpoint
CREATE TABLE `draft_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`post_item_id` text NOT NULL,
	`stage` text NOT NULL,
	`model_provider` text,
	`model_name` text,
	`prompt_snapshot` text,
	`content_markdown` text,
	`content_json` text,
	`is_manual_edit` integer DEFAULT 0,
	`parent_version_id` text,
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`post_item_id`) REFERENCES `post_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `excluded_competitors` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`url` text NOT NULL,
	`reason` text DEFAULT 'manual_exclude',
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `funnels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`stages` text,
	`duration_days` integer,
	`rules` text,
	`platform_recommendations` text,
	`ordering` integer DEFAULT 0,
	`active` integer DEFAULT 1,
	`color` text DEFAULT '#6366f1',
	`created_at` text DEFAULT (current_timestamp)
);
--> statement-breakpoint
CREATE TABLE `license` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`license_key` text,
	`email` text,
	`activated_at` text,
	`expires_at` text,
	`status` text DEFAULT 'inactive',
	`last_checked` text,
	`plan_name` text
);
--> statement-breakpoint
CREATE TABLE `onboarding_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`step_key` text NOT NULL,
	`status` text DEFAULT 'pending',
	`ai_output` text,
	`manual_override` text,
	`completed_at` text,
	`updated_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pipeline_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`post_item_id` text NOT NULL,
	`pipeline_template_id` text,
	`status` text DEFAULT 'pending',
	`started_at` text,
	`finished_at` text,
	`initiated_by` text DEFAULT 'manual',
	`result_summary` text,
	`logs_path` text,
	FOREIGN KEY (`post_item_id`) REFERENCES `post_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `platforms` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`product_id` text,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`config_json` text,
	`status` text DEFAULT 'active',
	`current_funnel_id` text,
	`funnel_recommendations` text,
	`suggested` integer DEFAULT 0,
	`ordering` integer DEFAULT 0,
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`current_funnel_id`) REFERENCES `funnels`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `post_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`product_id` text,
	`platform_id` text,
	`title` text NOT NULL,
	`topic_id` text,
	`rubric_id` text,
	`content_type_id` text,
	`campaign_id` text,
	`funnel_id` text,
	`scheduled_date` text,
	`scheduled_time` text,
	`sort_order` integer DEFAULT 0,
	`status` text DEFAULT 'idea',
	`goal` text,
	`hook` text,
	`key_message` text,
	`cta` text,
	`version_current_id` text,
	`owner` text,
	`published_media_id` text,
	`created_at` text DEFAULT (current_timestamp),
	`updated_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rubric_id`) REFERENCES `rubrics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`content_type_id`) REFERENCES `content_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`funnel_id`) REFERENCES `funnels`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`description` text,
	`price_category` text DEFAULT 'middle',
	`values` text,
	`pains` text,
	`result` text,
	`value_prop_json` text,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (current_timestamp),
	`updated_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`keyword` text NOT NULL,
	`source` text DEFAULT 'ai_extracted',
	`sort_order` integer DEFAULT 0,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_knowledge` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type` text DEFAULT 'note' NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`source_url` text,
	`file_path` text,
	`file_name` text,
	`file_size` integer,
	`word_count` integer,
	`tags` text,
	`ordering` integer DEFAULT 0,
	`created_at` text DEFAULT (current_timestamp),
	`updated_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`niche` text,
	`audience` text,
	`pains` text,
	`style` text,
	`tone` text,
	`brand_styles` text,
	`knowledge_summary` text,
	`mission` text,
	`value_prop` text,
	`customer_journey` text,
	`competitors` text,
	`keywords` text,
	`onboarding_scenario` text,
	`onboarding_complete` integer DEFAULT 0,
	`status` text DEFAULT 'draft',
	`created_at` text DEFAULT (current_timestamp),
	`updated_at` text DEFAULT (current_timestamp)
);
--> statement-breakpoint
CREATE TABLE `rubric_distributions` (
	`id` text PRIMARY KEY NOT NULL,
	`rubric_id` text,
	`content_type_code` text NOT NULL,
	`percent` real DEFAULT 0,
	FOREIGN KEY (`rubric_id`) REFERENCES `rubrics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rubrics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`product_id` text,
	`platform_id` text,
	`name` text NOT NULL,
	`description` text,
	`ordering` integer DEFAULT 0,
	`active` integer DEFAULT 1,
	`color` text DEFAULT '#6366f1',
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `saved_competitors` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`positioning` text,
	`strengths` text,
	`weaknesses` text,
	`audience` text,
	`content_strategy` text,
	`source` text DEFAULT 'search',
	`search_keywords` text,
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` text DEFAULT (current_timestamp)
);
--> statement-breakpoint
CREATE TABLE `strategy_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`product_id` text,
	`platform_id` text,
	`section_key` text NOT NULL,
	`title` text NOT NULL,
	`ai_content` text,
	`manual_content` text,
	`ordering` integer DEFAULT 0,
	`approved` integer DEFAULT 0,
	`created_at` text DEFAULT (current_timestamp),
	`updated_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`product_id` text,
	`platform_id` text,
	`rubric_id` text,
	`title` text NOT NULL,
	`description` text,
	`pain_point` text,
	`promise` text,
	`audience_segment` text,
	`notes` text,
	`status` text DEFAULT 'active',
	`current_funnel_id` text,
	`funnel_recommendations` text,
	`priority` integer DEFAULT 0,
	`source` text,
	`created_at` text DEFAULT (current_timestamp),
	`updated_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rubric_id`) REFERENCES `rubrics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_funnel_id`) REFERENCES `funnels`(`id`) ON UPDATE no action ON DELETE set null
);
