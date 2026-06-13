-- SQL schema for AI Calling SaaS Backend

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS `ailive_backend` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `ailive_backend`;

-- Table: categories
CREATE TABLE IF NOT EXISTS `categories` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(50) NOT NULL UNIQUE,
  `default_prompt` TEXT NULL,
  `default_voice_id` VARCHAR(36) NULL,
  `default_language` VARCHAR(10) DEFAULT 'en',
  `default_agent_config` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_categories_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: plans
CREATE TABLE IF NOT EXISTS `plans` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(50) NOT NULL UNIQUE, -- Starter, Basic, Pro, Enterprise
  `price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `call_limit` INT NOT NULL DEFAULT 0, -- -1 for unlimited, or specific max call count
  `max_concurrent_calls` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_plans_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: admins
CREATE TABLE IF NOT EXISTS `admins` (
  `id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `first_name` VARCHAR(50) NULL,
  `last_name` VARCHAR(50) NULL,
  `role` VARCHAR(20) DEFAULT 'super_admin',
  `is_verified` TINYINT(1) DEFAULT 0,
  `verification_token` VARCHAR(255) NULL,
  `reset_token` VARCHAR(255) NULL,
  `reset_token_expires` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_admins_email` (`email`),
  INDEX `idx_admins_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: users (merchants)
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `business_name` VARCHAR(100) NOT NULL,
  `category_id` VARCHAR(36) NULL,
  `role` VARCHAR(20) DEFAULT 'merchant',
  `is_verified` TINYINT(1) DEFAULT 0,
  `verification_token` VARCHAR(255) NULL,
  `reset_token` VARCHAR(255) NULL,
  `reset_token_expires` DATETIME NULL,
  `refresh_token` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  INDEX `idx_users_email` (`email`),
  INDEX `idx_users_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: subscriptions
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL UNIQUE,
  `plan_id` VARCHAR(36) NOT NULL,
  `active_plan` VARCHAR(50) NOT NULL,
  `start_date` DATETIME NOT NULL,
  `expiry_date` DATETIME NULL,
  `calls_used` INT DEFAULT 0,
  `calls_remaining` INT DEFAULT 0,
  `status` VARCHAR(20) DEFAULT 'active', -- active, expired, cancelled
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`) ON DELETE RESTRICT,
  INDEX `idx_subscriptions_user` (`user_id`),
  INDEX `idx_subscriptions_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: vobiz_accounts
CREATE TABLE IF NOT EXISTS `vobiz_accounts` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL UNIQUE,
  `customer_id` VARCHAR(100) NOT NULL,
  `api_key` VARCHAR(255) NOT NULL,
  `api_secret` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_vobiz_accounts_user` (`user_id`),
  INDEX `idx_vobiz_accounts_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: vobiz_numbers
CREATE TABLE IF NOT EXISTS `vobiz_numbers` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `number` VARCHAR(20) NOT NULL,
  `status` VARCHAR(20) DEFAULT 'active', -- active, inactive
  `provider_data` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_merchant_number` (`user_id`, `number`),
  INDEX `idx_vobiz_numbers_user` (`user_id`),
  INDEX `idx_vobiz_numbers_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: voices
CREATE TABLE IF NOT EXISTS `voices` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `provider` VARCHAR(50) NOT NULL, -- sarvam, custom
  `voice_id` VARCHAR(100) NOT NULL,
  `language` VARCHAR(10) NOT NULL,
  `gender` VARCHAR(10) NOT NULL, -- male, female, neutral
  `is_custom` TINYINT(1) DEFAULT 0,
  `user_id` VARCHAR(36) NULL, -- NULL if global category voice
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `idx_voices_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alter categories table to support default_voice_id reference mapping (avoiding cyclic creation order)
ALTER TABLE `categories` ADD CONSTRAINT `fk_category_default_voice` FOREIGN KEY (`default_voice_id`) REFERENCES `voices` (`id`) ON DELETE SET NULL;

-- Table: agents
CREATE TABLE IF NOT EXISTS `agents` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `system_prompt` TEXT NOT NULL,
  `language` VARCHAR(10) DEFAULT 'en',
  `voice_id` VARCHAR(36) NOT NULL,
  `category_id` VARCHAR(36) NULL,
  `is_custom` TINYINT(1) DEFAULT 1,
  `active_status` TINYINT(1) DEFAULT 1,
  `allow_interruption` TINYINT(1) DEFAULT 1,
  `pace` DECIMAL(3, 2) DEFAULT 1.00,
  `temperature` DECIMAL(3, 2) DEFAULT 0.60,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`voice_id`) REFERENCES `voices` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  INDEX `idx_agents_user` (`user_id`),
  INDEX `idx_agents_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: customers
CREATE TABLE IF NOT EXISTS `customers` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `mobile` VARCHAR(20) NOT NULL,
  `tags` VARCHAR(255) NULL, -- JSON string or comma-separated list
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_merchant_customer_mobile` (`user_id`, `mobile`), -- Prevents duplicate mobile for same merchant
  INDEX `idx_customers_user` (`user_id`),
  INDEX `idx_customers_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: customer_lists
CREATE TABLE IF NOT EXISTS `customer_lists` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_customer_lists_user` (`user_id`),
  INDEX `idx_customer_lists_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: customer_list_members
CREATE TABLE IF NOT EXISTS `customer_list_members` (
  `id` VARCHAR(36) NOT NULL,
  `customer_list_id` VARCHAR(36) NOT NULL,
  `customer_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`customer_list_id`) REFERENCES `customer_lists` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_list_customer` (`customer_list_id`, `customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: campaigns
CREATE TABLE IF NOT EXISTS `campaigns` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `vobiz_number_id` VARCHAR(36) NOT NULL,
  `agent_id` VARCHAR(36) NOT NULL,
  `customer_list_id` VARCHAR(36) NOT NULL,
  `start_time` DATETIME NOT NULL,
  `interval_between_calls` INT DEFAULT 5, -- in seconds
  `max_concurrent_calls` INT DEFAULT 1,
  `status` VARCHAR(20) DEFAULT 'draft', -- draft, scheduled, running, paused, completed, failed
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`vobiz_number_id`) REFERENCES `vobiz_numbers` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`customer_list_id`) REFERENCES `customer_lists` (`id`) ON DELETE RESTRICT,
  INDEX `idx_campaigns_user` (`user_id`),
  INDEX `idx_campaigns_status` (`status`),
  INDEX `idx_campaigns_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: campaign_customers
CREATE TABLE IF NOT EXISTS `campaign_customers` (
  `id` VARCHAR(36) NOT NULL,
  `campaign_id` VARCHAR(36) NOT NULL,
  `customer_id` VARCHAR(36) NOT NULL,
  `call_status` VARCHAR(20) DEFAULT 'pending', -- pending, calling, completed, failed, retrying
  `retry_count` INT DEFAULT 0,
  `last_call_time` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_campaign_customer` (`campaign_id`, `customer_id`),
  INDEX `idx_campaign_customers_status` (`call_status`),
  INDEX `idx_campaign_customers_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: call_sessions
CREATE TABLE IF NOT EXISTS `call_sessions` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `campaign_id` VARCHAR(36) NULL, -- NULL if call is manual
  `agent_id` VARCHAR(36) NOT NULL,
  `vobiz_number_id` VARCHAR(36) NOT NULL,
  `customer_id` VARCHAR(36) NOT NULL,
  `gemini_session_id` VARCHAR(255) NULL,
  `ws_session_token` VARCHAR(255) NOT NULL UNIQUE,
  `status` VARCHAR(20) DEFAULT 'initiated', -- initiated, connected, completed, failed, no-answer, busy
  `start_time` DATETIME NULL,
  `end_time` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`vobiz_number_id`) REFERENCES `vobiz_numbers` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  INDEX `idx_call_sessions_token` (`ws_session_token`),
  INDEX `idx_call_sessions_status` (`status`),
  INDEX `idx_call_sessions_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: call_logs
CREATE TABLE IF NOT EXISTS `call_logs` (
  `id` VARCHAR(36) NOT NULL,
  `call_session_id` VARCHAR(36) NOT NULL,
  `log_level` VARCHAR(20) DEFAULT 'info',
  `message` TEXT NOT NULL,
  `details` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`call_session_id`) REFERENCES `call_sessions` (`id`) ON DELETE CASCADE,
  INDEX `idx_call_logs_session` (`call_session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: call_reports
CREATE TABLE IF NOT EXISTS `call_reports` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `campaign_id` VARCHAR(36) NULL,
  `call_session_id` VARCHAR(36) NOT NULL UNIQUE,
  `vobiz_number_id` VARCHAR(36) NOT NULL,
  `customer_id` VARCHAR(36) NOT NULL,
  `transcript` LONGTEXT NULL,
  `summary` TEXT NULL,
  `duration` INT DEFAULT 0, -- in seconds
  `outcome` VARCHAR(30) NULL, -- Interested, Not Interested, Callback Requested, Appointment Booked, Sale Closed, Wrong Number, No Answer
  `sentiment` VARCHAR(20) NULL, -- Positive, Neutral, Negative
  `lead_score` INT DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`call_session_id`) REFERENCES `call_sessions` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`vobiz_number_id`) REFERENCES `vobiz_numbers` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  INDEX `idx_call_reports_user` (`user_id`),
  INDEX `idx_call_reports_campaign` (`campaign_id`),
  INDEX `idx_call_reports_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: notifications
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `message` TEXT NOT NULL,
  `is_read` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_notifications_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: audit_logs
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NULL, -- System or Admin or Merchant
  `action` VARCHAR(100) NOT NULL,
  `table_name` VARCHAR(50) NOT NULL,
  `record_id` VARCHAR(36) NULL,
  `old_values` JSON NULL,
  `new_values` JSON NULL,
  `ip_address` VARCHAR(45) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_audit_logs_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
