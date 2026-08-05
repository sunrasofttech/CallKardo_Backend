-- CallKardo Database Schema Dump

-- Table structure for table `Organization`
DROP TABLE IF EXISTS `Organization`;
CREATE TABLE `Organization` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vobizSubAccountSid` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vobizSubAccountAuthToken` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vobizAiApiKey` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dograhAgentId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assignedPhoneNumber` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `monthlyCallLimit` int NOT NULL DEFAULT '2000',
  `callsUsedThisMonth` int NOT NULL DEFAULT '0',
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table structure for table `admins`
DROP TABLE IF EXISTS `admins`;
CREATE TABLE `admins` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `mobile` varchar(20) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `first_name` varchar(50) DEFAULT NULL,
  `last_name` varchar(50) DEFAULT NULL,
  `role` varchar(20) DEFAULT 'super_admin',
  `is_verified` tinyint(1) DEFAULT '1',
  `verification_token` varchar(255) DEFAULT NULL,
  `reset_token` varchar(255) DEFAULT NULL,
  `reset_token_expires` datetime DEFAULT NULL,
  `fcm_token` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mobile` (`mobile`),
  UNIQUE KEY `mobile_2` (`mobile`),
  UNIQUE KEY `mobile_3` (`mobile`),
  UNIQUE KEY `mobile_4` (`mobile`),
  UNIQUE KEY `mobile_5` (`mobile`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `email_2` (`email`),
  UNIQUE KEY `email_3` (`email`),
  UNIQUE KEY `email_4` (`email`),
  UNIQUE KEY `email_5` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `agents`
DROP TABLE IF EXISTS `agents`;
CREATE TABLE `agents` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `description` text,
  `system_prompt` text NOT NULL,
  `first_message` text,
  `first_message_audio_path` varchar(255) DEFAULT NULL,
  `language` varchar(10) DEFAULT 'hi',
  `voice_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `category_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `ai_provider` varchar(50) DEFAULT 'geminilive',
  `is_custom` tinyint(1) DEFAULT '1',
  `active_status` tinyint(1) DEFAULT '1',
  `approval_status` varchar(20) DEFAULT 'approved',
  `allow_interruption` tinyint(1) DEFAULT '1',
  `pace` decimal(3,2) DEFAULT '1.00',
  `temperature` decimal(3,2) DEFAULT '0.60',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `knowledge_base` text,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `voice_id` (`voice_id`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `agents_ibfk_10` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `agents_ibfk_11` FOREIGN KEY (`voice_id`) REFERENCES `voices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `agents_ibfk_12` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `audit_logs`
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `table_name` varchar(50) NOT NULL,
  `record_id` varchar(36) DEFAULT NULL,
  `old_values` json DEFAULT NULL,
  `new_values` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `call_logs`
DROP TABLE IF EXISTS `call_logs`;
CREATE TABLE `call_logs` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `call_session_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `log_level` varchar(20) DEFAULT 'info',
  `message` text NOT NULL,
  `details` json DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_call_logs_session` (`call_session_id`),
  CONSTRAINT `call_logs_ibfk_1` FOREIGN KEY (`call_session_id`) REFERENCES `call_sessions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `call_reports`
DROP TABLE IF EXISTS `call_reports`;
CREATE TABLE `call_reports` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `campaign_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `call_session_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `vobiz_number_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `customer_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `transcript` longtext,
  `summary` text,
  `duration` int DEFAULT '0',
  `outcome` varchar(30) DEFAULT NULL,
  `sentiment` varchar(20) DEFAULT NULL,
  `lead_score` int DEFAULT '0',
  `recording_url` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_call_reports_user` (`user_id`),
  KEY `idx_call_reports_campaign` (`campaign_id`),
  KEY `call_session_id` (`call_session_id`),
  KEY `vobiz_number_id` (`vobiz_number_id`),
  KEY `customer_id` (`customer_id`),
  CONSTRAINT `call_reports_ibfk_16` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `call_reports_ibfk_17` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `call_reports_ibfk_18` FOREIGN KEY (`call_session_id`) REFERENCES `call_sessions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `call_reports_ibfk_19` FOREIGN KEY (`vobiz_number_id`) REFERENCES `vobiz_numbers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `call_reports_ibfk_20` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `call_sessions`
DROP TABLE IF EXISTS `call_sessions`;
CREATE TABLE `call_sessions` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `campaign_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `agent_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `vobiz_number_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `customer_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `gemini_session_id` varchar(255) DEFAULT NULL,
  `ws_session_token` varchar(255) NOT NULL,
  `status` varchar(20) DEFAULT 'initiated',
  `direction` varchar(10) NOT NULL DEFAULT 'outbound',
  `vobiz_call_uuid` varchar(255) DEFAULT NULL,
  `start_time` datetime DEFAULT NULL,
  `end_time` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `actions` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ws_session_token` (`ws_session_token`),
  UNIQUE KEY `ws_session_token_2` (`ws_session_token`),
  UNIQUE KEY `ws_session_token_3` (`ws_session_token`),
  UNIQUE KEY `ws_session_token_4` (`ws_session_token`),
  UNIQUE KEY `ws_session_token_5` (`ws_session_token`),
  KEY `user_id` (`user_id`),
  KEY `campaign_id` (`campaign_id`),
  KEY `agent_id` (`agent_id`),
  KEY `vobiz_number_id` (`vobiz_number_id`),
  KEY `customer_id` (`customer_id`),
  CONSTRAINT `call_sessions_ibfk_16` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `call_sessions_ibfk_17` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `call_sessions_ibfk_18` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `call_sessions_ibfk_19` FOREIGN KEY (`vobiz_number_id`) REFERENCES `vobiz_numbers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `call_sessions_ibfk_20` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `campaign_customers`
DROP TABLE IF EXISTS `campaign_customers`;
CREATE TABLE `campaign_customers` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `campaign_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `customer_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `call_status` varchar(20) DEFAULT 'pending',
  `retry_count` int DEFAULT '0',
  `last_call_time` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `campaign_customers_customer_id_campaign_id_unique` (`campaign_id`,`customer_id`),
  UNIQUE KEY `uq_campaign_customer` (`campaign_id`,`customer_id`),
  KEY `idx_campaign_status` (`campaign_id`,`call_status`),
  KEY `customer_id` (`customer_id`),
  CONSTRAINT `campaign_customers_ibfk_7` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `campaign_customers_ibfk_8` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `campaigns`
DROP TABLE IF EXISTS `campaigns`;
CREATE TABLE `campaigns` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `vobiz_number_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `agent_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `customer_list_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `start_time` datetime NOT NULL,
  `interval_between_calls` int DEFAULT '5',
  `max_concurrent_calls` int DEFAULT '1',
  `status` varchar(20) DEFAULT 'draft',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `vobiz_number_id` (`vobiz_number_id`),
  KEY `agent_id` (`agent_id`),
  KEY `customer_list_id` (`customer_list_id`),
  CONSTRAINT `campaigns_ibfk_13` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `campaigns_ibfk_14` FOREIGN KEY (`vobiz_number_id`) REFERENCES `vobiz_numbers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `campaigns_ibfk_15` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `campaigns_ibfk_16` FOREIGN KEY (`customer_list_id`) REFERENCES `customer_lists` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `categories`
DROP TABLE IF EXISTS `categories`;
CREATE TABLE `categories` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `name` varchar(50) NOT NULL,
  `default_prompt` text,
  `default_voice_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `default_language` varchar(10) DEFAULT 'hi',
  `default_agent_config` json DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `name_2` (`name`),
  UNIQUE KEY `name_3` (`name`),
  UNIQUE KEY `name_4` (`name`),
  UNIQUE KEY `name_5` (`name`),
  KEY `default_voice_id` (`default_voice_id`),
  CONSTRAINT `categories_ibfk_1` FOREIGN KEY (`default_voice_id`) REFERENCES `voices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `customer_list_members`
DROP TABLE IF EXISTS `customer_list_members`;
CREATE TABLE `customer_list_members` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `customer_list_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `customer_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_list_members_customer_id_customer_list_id_unique` (`customer_list_id`,`customer_id`),
  UNIQUE KEY `uq_list_customer` (`customer_list_id`,`customer_id`),
  KEY `customer_id` (`customer_id`),
  CONSTRAINT `customer_list_members_ibfk_7` FOREIGN KEY (`customer_list_id`) REFERENCES `customer_lists` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `customer_list_members_ibfk_8` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `customer_lists`
DROP TABLE IF EXISTS `customer_lists`;
CREATE TABLE `customer_lists` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `description` text,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `customer_lists_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `customers`
DROP TABLE IF EXISTS `customers`;
CREATE TABLE `customers` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `mobile` varchar(20) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `tags` varchar(255) DEFAULT NULL,
  `notes` text,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_merchant_customer_mobile` (`user_id`,`mobile`),
  CONSTRAINT `customers_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `kyc_details`
DROP TABLE IF EXISTS `kyc_details`;
CREATE TABLE `kyc_details` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `document_type` varchar(50) DEFAULT NULL,
  `document_data` json DEFAULT NULL,
  `session_id` varchar(100) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'pending',
  `vobiz_response` json DEFAULT NULL,
  `error_message` text,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `kyc_details_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `notifications`
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `title` varchar(150) NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `admin_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `type` enum('MERCHANT','ADMIN') NOT NULL DEFAULT 'MERCHANT',
  `category` enum('meeting','payments','call','general') NOT NULL DEFAULT 'general',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `admin_id` (`admin_id`),
  CONSTRAINT `notifications_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `notifications_ibfk_4` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `payment_transactions`
DROP TABLE IF EXISTS `payment_transactions`;
CREATE TABLE `payment_transactions` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `order_id` varchar(100) NOT NULL,
  `type` varchar(50) NOT NULL,
  `target_id` varchar(255) NOT NULL,
  `amount` varchar(50) NOT NULL,
  `currency` varchar(10) DEFAULT 'INR',
  `status` varchar(30) DEFAULT 'pending',
  `customer_name` varchar(100) DEFAULT NULL,
  `customer_mobile` varchar(30) DEFAULT NULL,
  `customer_email` varchar(100) DEFAULT NULL,
  `note` text,
  `gateway_transaction_id` varchar(255) DEFAULT NULL,
  `payment_url` text,
  `upi_string` text,
  `urn_number` varchar(100) DEFAULT NULL,
  `raw_response` json DEFAULT NULL,
  `raw_webhook_data` json DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_id` (`order_id`),
  UNIQUE KEY `order_id_2` (`order_id`),
  UNIQUE KEY `order_id_3` (`order_id`),
  UNIQUE KEY `order_id_4` (`order_id`),
  UNIQUE KEY `order_id_5` (`order_id`),
  UNIQUE KEY `order_id_6` (`order_id`),
  UNIQUE KEY `order_id_7` (`order_id`),
  UNIQUE KEY `order_id_8` (`order_id`),
  UNIQUE KEY `order_id_9` (`order_id`),
  KEY `idx_payment_tx_user` (`user_id`),
  KEY `idx_payment_tx_order` (`order_id`),
  KEY `idx_payment_tx_status` (`status`),
  CONSTRAINT `payment_transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `plans`
DROP TABLE IF EXISTS `plans`;
CREATE TABLE `plans` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `name` varchar(50) NOT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `call_limit` int NOT NULL DEFAULT '0',
  `max_concurrent_calls` int NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `name_2` (`name`),
  UNIQUE KEY `name_3` (`name`),
  UNIQUE KEY `name_4` (`name`),
  UNIQUE KEY `name_5` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `settings`
DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `key` varchar(100) NOT NULL,
  `value` json NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `key` (`key`),
  UNIQUE KEY `key_2` (`key`),
  UNIQUE KEY `key_3` (`key`),
  UNIQUE KEY `key_4` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `subscriptions`
DROP TABLE IF EXISTS `subscriptions`;
CREATE TABLE `subscriptions` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `plan_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `active_plan` varchar(50) NOT NULL,
  `start_date` datetime NOT NULL,
  `expiry_date` datetime DEFAULT NULL,
  `calls_used` int DEFAULT '0',
  `calls_remaining` int DEFAULT '0',
  `status` varchar(20) DEFAULT 'active',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `is_expiring_notified` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `plan_id` (`plan_id`),
  CONSTRAINT `subscriptions_ibfk_7` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `subscriptions_ibfk_8` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `users`
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `mobile` varchar(20) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `business_name` varchar(100) DEFAULT NULL,
  `business_url` varchar(255) DEFAULT NULL,
  `category_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `role` varchar(20) DEFAULT 'merchant',
  `kyc_status` varchar(20) DEFAULT 'none',
  `is_verified` tinyint(1) DEFAULT '1',
  `verification_token` varchar(255) DEFAULT NULL,
  `reset_token` varchar(255) DEFAULT NULL,
  `reset_token_expires` datetime DEFAULT NULL,
  `refresh_token` text,
  `fcm_token` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mobile` (`mobile`),
  UNIQUE KEY `mobile_2` (`mobile`),
  UNIQUE KEY `mobile_3` (`mobile`),
  UNIQUE KEY `mobile_4` (`mobile`),
  UNIQUE KEY `mobile_5` (`mobile`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `email_2` (`email`),
  UNIQUE KEY `email_3` (`email`),
  UNIQUE KEY `email_4` (`email`),
  UNIQUE KEY `email_5` (`email`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `vobiz_accounts`
DROP TABLE IF EXISTS `vobiz_accounts`;
CREATE TABLE `vobiz_accounts` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `customer_id` varchar(100) NOT NULL,
  `api_key` varchar(255) NOT NULL,
  `api_secret` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `vobiz_accounts_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `vobiz_numbers`
DROP TABLE IF EXISTS `vobiz_numbers`;
CREATE TABLE `vobiz_numbers` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `number` varchar(20) NOT NULL,
  `status` varchar(20) DEFAULT 'active',
  `rental_expiry_date` datetime DEFAULT NULL,
  `provider_data` json DEFAULT NULL,
  `agent_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_merchant_number` (`user_id`,`number`),
  KEY `agent_id` (`agent_id`),
  CONSTRAINT `vobiz_numbers_ibfk_7` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `vobiz_numbers_ibfk_8` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `voices`
DROP TABLE IF EXISTS `voices`;
CREATE TABLE `voices` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `name` varchar(50) NOT NULL,
  `provider` varchar(50) NOT NULL,
  `voice_id` varchar(100) NOT NULL,
  `language` varchar(10) NOT NULL,
  `gender` varchar(10) NOT NULL,
  `is_custom` tinyint(1) DEFAULT '0',
  `sample_text` text,
  `user_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `voices_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

