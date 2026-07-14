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
  `mobile` VARCHAR(20) NOT NULL UNIQUE,
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
  `mobile` VARCHAR(20) NOT NULL UNIQUE,
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
  `sample_text` TEXT NULL,
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
  `first_message` TEXT NULL,
  `first_message_audio_path` VARCHAR(255) NULL,
  `language` VARCHAR(10) DEFAULT 'en',
  `voice_id` VARCHAR(36) NOT NULL,
  `category_id` VARCHAR(36) NULL,
  `is_custom` TINYINT(1) DEFAULT 1,
  `active_status` TINYINT(1) DEFAULT 1,
  `approval_status` VARCHAR(20) DEFAULT 'approved',
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
  `recording_url` VARCHAR(255) NULL,
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

-- ==========================================
-- DEFAULT SEED DATA
-- ==========================================

-- Seed default voices
INSERT INTO `voices` (`id`, `name`, `provider`, `voice_id`, `language`, `gender`, `is_custom`, `sample_text`, `user_id`) VALUES
('c0000000-0000-0000-0000-000000000001', 'Shubh', 'sarvam', 'shubh', 'hi-IN', 'male', 0, 'नमस्ते, यह मेरी आवाज़ का एक पूर्वावलोकन है। आशा है कि आपको यह पसंद आएगा!', NULL),
('c0000000-0000-0000-0000-000000000002', 'Aditya', 'sarvam', 'aditya', 'en-IN', 'male', 0, 'Hello! This is a preview of my voice. I hope you find it suitable for your agent.', NULL),
('c0000000-0000-0000-0000-000000000003', 'Ritu', 'sarvam', 'ritu', 'ta-IN', 'female', 0, 'வணக்கம், இது எனது குரலின் முன்னோட்டம். இது உங்களுக்கு பிடிக்கும் என்று நம்புகிறேன்!', NULL),
('c0000000-0000-0000-0000-000000000004', 'Priya', 'sarvam', 'priya', 'te-IN', 'female', 0, 'నమస్కారం, ఇది నా వాయిస్ ప్రివ్యూ. ఇది మీకు నచ్చుతుందని ఆశిస్తున్నాను!', NULL),
('c0000000-0000-0000-0000-000000000005', 'Neha', 'sarvam', 'neha', 'bn-IN', 'female', 0, 'নমস্কার, এটি আমার কণ্ঠস্বরের একটি প্রিভিউ। আশা করি আপনার এটি ভালো লাগবে!', NULL),
('c0000000-0000-0000-0000-000000000006', 'Rahul', 'sarvam', 'rahul', 'gu-IN', 'male', 0, 'નમસ્તે, આ મારા અવાજનું પૂર્વાવલોકન છે. આશા છે કે તમને તે ગમશે!', NULL),
('c0000000-0000-0000-0000-000000000007', 'Pooja', 'sarvam', 'pooja', 'kn-IN', 'female', 0, 'ನಮಸ್ಕಾರ, ಇದು ನನ್ನ ಧ್ವನಿಯ ಮುನ್ನೋಟವಾಗಿದೆ. ಇದು ನಿಮಗೆ ಇಷ್ಟವಾಗುತ್ತದೆ ಎಂದು ಭಾವಿಸುತ್ತೇನೆ!', NULL),
('c0000000-0000-0000-0000-000000000008', 'Rohan', 'sarvam', 'rohan', 'ml-IN', 'male', 0, 'നമസ്കാരം, ഇത് എന്റെ ശബ്ദത്തിന്റെ പ്രിവ്യൂ ആണ്. നിങ്ങൾക്ക് ഇത് ഇഷ്ടപ്പെടുമെന്ന് പ്രതീക്ഷിക്കുന്നു!', NULL),
('c0000000-0000-0000-0000-000000000009', 'Simran', 'sarvam', 'simran', 'mr-IN', 'female', 0, 'नमस्कार, हा माझ्या आवाजाचा एक पूर्वदृश्य आहे. आशा आहे की तुम्हाला हे आवडेल!', NULL),
('c0000000-0000-0000-0000-000000000010', 'Kavya', 'sarvam', 'kavya', 'pa-IN', 'female', 0, 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਇਹ ਮੇਰੀ ਆਵਾਜ਼ ਦਾ ਇੱਕ ਪੂਰਵਦਰਸ਼ਨ ਹੈ। ਉਮੀਦ ਹੈ ਕਿ ਤੁਹਾਨੂੰ ਇਹ ਪਸੰਦ ਆਵੇਗਾ!', NULL),
('c0000000-0000-0000-0000-000000000011', 'Amit', 'sarvam', 'amit', 'od-IN', 'male', 0, 'ନମସ୍କାର, ଏହା ମୋର ସ୍ୱରର ଏକ ପୂର୍ବାବଲୋକନ ଅଟେ | ଆଶା କରେ ଆପଣଙ୍କୁ ଏହା ପସନ୍ଦ ଆସିବ!', NULL),
('c0000000-0000-0000-0000-000000000012', 'Dev', 'sarvam', 'dev', 'hi-IN', 'male', 0, 'नमस्ते, मैं देव हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000013', 'Ishita', 'sarvam', 'ishita', 'hi-IN', 'female', 0, 'नमस्ते, मैं इशीलता हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000014', 'Shreya', 'sarvam', 'shreya', 'hi-IN', 'female', 0, 'नमस्ते, मैं श्रेया हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000015', 'Ratan', 'sarvam', 'ratan', 'hi-IN', 'male', 0, 'नमस्ते, मैं रतन हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000016', 'Varun', 'sarvam', 'varun', 'hi-IN', 'male', 0, 'नमस्ते, मैं वरुण हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000017', 'Manan', 'sarvam', 'manan', 'hi-IN', 'male', 0, 'नमस्ते, मैं मनन हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000018', 'Sumit', 'sarvam', 'sumit', 'hi-IN', 'male', 0, 'नमस्ते, मैं सुमित हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000019', 'Roopa', 'sarvam', 'roopa', 'hi-IN', 'female', 0, 'नमस्ते, मैं रूपा हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000020', 'Kabir', 'sarvam', 'kabir', 'hi-IN', 'male', 0, 'नमस्ते, मैं कबीर हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000021', 'Aayan', 'sarvam', 'aayan', 'hi-IN', 'male', 0, 'नमस्ते, मैं अयान हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000022', 'Ashutosh', 'sarvam', 'ashutosh', 'hi-IN', 'male', 0, 'नमस्ते, मैं आशुतोष हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000023', 'Advait', 'sarvam', 'advait', 'hi-IN', 'male', 0, 'नमस्ते, मैं अद्वैत हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000024', 'Anand', 'sarvam', 'anand', 'hi-IN', 'male', 0, 'नमस्ते, मैं आनंद हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000025', 'Tanya', 'sarvam', 'tanya', 'hi-IN', 'female', 0, 'नमस्ते, मैं तान्या हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000026', 'Tarun', 'sarvam', 'tarun', 'hi-IN', 'male', 0, 'नमस्ते, मैं तरुण हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000027', 'Sunny', 'sarvam', 'sunny', 'hi-IN', 'male', 0, 'नमस्ते, मैं सनी हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000028', 'Mani', 'sarvam', 'mani', 'hi-IN', 'male', 0, 'नमस्ते, मैं मनी हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000029', 'Gokul', 'sarvam', 'gokul', 'hi-IN', 'male', 0, 'नमस्ते, मैं गोकुल हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000030', 'Vijay', 'sarvam', 'vijay', 'hi-IN', 'male', 0, 'नमस्ते, मैं विजय हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000031', 'Shruti', 'sarvam', 'shruti', 'hi-IN', 'female', 0, 'नमस्ते, मैं श्रुति हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000032', 'Suhani', 'sarvam', 'suhani', 'hi-IN', 'female', 0, 'नमस्ते, मैं सुहानी हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000033', 'Mohit', 'sarvam', 'mohit', 'hi-IN', 'male', 0, 'नमस्ते, मैं मोहित हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000034', 'Kavitha', 'sarvam', 'kavitha', 'hi-IN', 'female', 0, 'नमस्ते, मैं कविता हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000035', 'Rehan', 'sarvam', 'rehan', 'hi-IN', 'male', 0, 'नमस्ते, मैं रेहान हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000036', 'Soham', 'sarvam', 'soham', 'hi-IN', 'male', 0, 'नमस्ते, मैं सोहम हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000037', 'Rupali', 'sarvam', 'rupali', 'hi-IN', 'female', 0, 'नमस्ते, मैं रूपाली हूँ। यह मेरी आवाज़ का पूर्वावलोकन है।', NULL),
('c0000000-0000-0000-0000-000000000038', 'Amelia', 'sarvam', 'amelia', 'en-IN', 'female', 0, 'Hello! This is a preview of my voice. I am Amelia, your friendly assistant.', NULL),
('c0000000-0000-0000-0000-000000000039', 'Sophia', 'sarvam', 'sophia', 'en-IN', 'female', 0, 'Hello! This is a preview of my voice. I am Sophia, ready to assist you today.', NULL);

-- Seed default categories
INSERT INTO `categories` (`id`, `name`, `default_prompt`, `default_voice_id`, `default_language`, `default_agent_config`) VALUES
('b0000000-0000-0000-0000-000000000001', 'Customer Support', 'You are a helpful customer service assistant.', 'c0000000-0000-0000-0000-000000000001', 'en-IN', NULL),
('b0000000-0000-0000-0000-000000000002', 'Sales & Marketing', 'You are an enthusiastic sales agent representing our product. Pitch the product and try to schedule a demo.', 'c0000000-0000-0000-0000-000000000002', 'en-IN', NULL),
('b0000000-0000-0000-0000-000000000003', 'Appointment Booking', 'You are a receptionist scheduling appointments. Ask the caller for their preferred date and time, and confirm availability.', 'c0000000-0000-0000-0000-000000000001', 'en-IN', NULL),
('b0000000-0000-0000-0000-000000000004', 'Feedback Collection', 'You are a feedback collector. Ask the caller about their recent experience with our service and rate it from 1 to 5.', 'c0000000-0000-0000-0000-000000000002', 'en-IN', NULL);

-- Seed default plans
INSERT INTO `plans` (`id`, `name`, `price`, `call_limit`, `max_concurrent_calls`) VALUES
('p0000000-0000-0000-0000-000000000001', 'Starter', 0.00, 5, 1),
('p0000000-0000-0000-0000-000000000002', 'Basic', 19.00, 500, 2),
('p0000000-0000-0000-0000-000000000003', 'Pro', 49.00, 2000, 5),
('p0000000-0000-0000-0000-000000000004', 'Enterprise', 199.00, 10000, 10);

-- Seed Super Admin
INSERT INTO `admins` (`id`, `email`, `mobile`, `password_hash`, `first_name`, `last_name`, `role`, `is_verified`) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin@example.com', '+919876543210', '$2a$10$OMTjd0IfYG1oKrkFyNFz..RrMy/U9ExgsCSJ3pY5bfPiL30Izp6Fa', 'System', 'Administrator', 'super_admin', 1);

-- Seed Merchant User
INSERT INTO `users` (`id`, `email`, `mobile`, `password_hash`, `business_name`, `category_id`, `role`, `is_verified`) VALUES
('u0000000-0000-0000-0000-000000000001', 'merchant@example.com', '+919876543211', '$2a$10$qb9BUT2e6m01rkg8w2upI.wEBvuKi3v6zCrRMxuqViVIvHF1atnom', 'Default Merchant Business', 'b0000000-0000-0000-0000-000000000001', 'merchant', 1);

-- Seed Merchant Subscription
INSERT INTO `subscriptions` (`id`, `user_id`, `plan_id`, `active_plan`, `start_date`, `expiry_date`, `calls_used`, `calls_remaining`, `status`) VALUES
('s0000000-0000-0000-0000-000000000001', 'u0000000-0000-0000-0000-000000000001', 'p0000000-0000-0000-0000-000000000001', 'Starter', NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), 0, 5, 'active');

-- Seed default test agents for each category
INSERT INTO `agents` (`id`, `user_id`, `name`, `description`, `system_prompt`, `first_message`, `language`, `voice_id`, `category_id`, `is_custom`, `approval_status`, `allow_interruption`, `pace`, `temperature`) VALUES
('g0000000-0000-0000-0000-000000000001', 'u0000000-0000-0000-0000-000000000001', 'Default Support Agent', 'Pre-configured test agent for Customer Support', 'You are a helpful customer service assistant.', 'Hello! How can I help you today?', 'en-IN', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 0, 'approved', 1, 1.00, 0.60),
('g0000000-0000-0000-0000-000000000002', 'u0000000-0000-0000-0000-000000000001', 'Default Sales Agent', 'Pre-configured test agent for Sales & Marketing', 'You are an enthusiastic sales agent representing our product. Pitch the product and try to schedule a demo.', 'Hello! Interested in boosting your sales with AI? Let\'s discuss.', 'en-IN', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 0, 'approved', 1, 1.00, 0.60),
('g0000000-0000-0000-0000-000000000003', 'u0000000-0000-0000-0000-000000000001', 'Default Booking Agent', 'Pre-configured test agent for Appointment Booking', 'You are a receptionist scheduling appointments. Ask the caller for their preferred date and time, and confirm availability.', 'Hello! I can help you schedule your next appointment. What date and time works for you?', 'en-IN', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 0, 'approved', 1, 1.00, 0.60),
('g0000000-0000-0000-0000-000000000004', 'u0000000-0000-0000-0000-000000000001', 'Default Feedback Agent', 'Pre-configured test agent for Feedback Collection', 'You are a feedback collector. Ask the caller about their recent experience with our service and rate it from 1 to 5.', 'Hello! I\'d love to collect your quick feedback on our service. Can you rate us from 1 to 5?', 'en-IN', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000004', 0, 'approved', 1, 1.00, 0.60);

-- Add new columns for pre-generated first message audio
ALTER TABLE `agents` ADD COLUMN IF NOT EXISTS `first_message` TEXT NULL;
ALTER TABLE `agents` ADD COLUMN IF NOT EXISTS `first_message_audio_path` VARCHAR(255) NULL;
