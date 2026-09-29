-- Plan quotas are measured in whole call minutes. -1 denotes an unlimited minute allowance.
ALTER TABLE plans
  ADD COLUMN minute_limit INT NOT NULL DEFAULT -1 AFTER call_limit;

ALTER TABLE subscriptions
  ADD COLUMN minutes_used INT NOT NULL DEFAULT 0 AFTER calls_remaining,
  ADD COLUMN minutes_remaining INT NOT NULL DEFAULT -1 AFTER minutes_used;

ALTER TABLE subscription_histories
  ADD COLUMN minutes_limit INT NULL AFTER calls_used,
  ADD COLUMN minutes_used INT NOT NULL DEFAULT 0 AFTER minutes_limit;

ALTER TABLE call_reports
  ADD COLUMN usage_recorded TINYINT(1) NOT NULL DEFAULT 0 AFTER duration;

-- Reports created before this deployment were already charged for calls.
UPDATE call_reports SET usage_recorded = 1;

-- Existing plans receive the same number of minutes as calls; unlimited calls stay unlimited.
UPDATE plans SET minute_limit = call_limit;
UPDATE subscriptions AS s
JOIN plans AS p ON p.id = s.plan_id
SET s.minutes_remaining = p.minute_limit;
