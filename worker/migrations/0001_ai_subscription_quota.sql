PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_entitlement_principal (
  actor_key TEXT PRIMARY KEY CHECK (length(actor_key) = 64),
  session_epoch TEXT NOT NULL CHECK (length(session_epoch) = 32),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_quota_period (
  actor_key TEXT NOT NULL,
  period_key TEXT NOT NULL CHECK (length(period_key) = 64),
  period_start_ms INTEGER NOT NULL,
  period_end_ms INTEGER NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  photos_used INTEGER NOT NULL DEFAULT 0 CHECK (photos_used >= 0),
  attempt_credits INTEGER NOT NULL DEFAULT 0 CHECK (attempt_credits >= credits_used),
  photo_attempts INTEGER NOT NULL DEFAULT 0 CHECK (photo_attempts >= photos_used),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (actor_key, period_key),
  FOREIGN KEY (actor_key) REFERENCES ai_entitlement_principal(actor_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_sandbox_daily_attempt (
  actor_key TEXT NOT NULL,
  day_key TEXT NOT NULL CHECK (length(day_key) = 64),
  day_start_ms INTEGER NOT NULL,
  day_end_ms INTEGER NOT NULL,
  attempt_credits INTEGER NOT NULL DEFAULT 0 CHECK (attempt_credits >= 0),
  photo_attempts INTEGER NOT NULL DEFAULT 0 CHECK (photo_attempts >= 0),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (actor_key, day_key)
);

CREATE TABLE IF NOT EXISTS ai_quota_request (
  actor_key TEXT NOT NULL,
  request_key TEXT NOT NULL CHECK (length(request_key) = 64),
  period_key TEXT NOT NULL,
  sandbox_day_key TEXT,
  route TEXT NOT NULL,
  credit_cost INTEGER NOT NULL CHECK (credit_cost > 0),
  photo_cost INTEGER NOT NULL CHECK (photo_cost IN (0, 1)),
  state TEXT NOT NULL CHECK (state IN ('reserved', 'completed', 'refunded')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (actor_key, request_key),
  FOREIGN KEY (actor_key, period_key)
    REFERENCES ai_quota_period(actor_key, period_key) ON DELETE CASCADE,
  FOREIGN KEY (actor_key, sandbox_day_key)
    REFERENCES ai_sandbox_daily_attempt(actor_key, day_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_entitlement_tombstone (
  actor_key TEXT PRIMARY KEY CHECK (length(actor_key) = 64),
  blocked_until_ms INTEGER NOT NULL,
  deleted_at_ms INTEGER NOT NULL
);

CREATE TRIGGER IF NOT EXISTS ai_quota_reserve_after_insert
AFTER INSERT ON ai_quota_request
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM ai_quota_period
    WHERE actor_key = NEW.actor_key AND period_key = NEW.period_key
  ) THEN RAISE(ABORT, 'quota_period_missing') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM ai_quota_period
    WHERE actor_key = NEW.actor_key
      AND period_key = NEW.period_key
      AND credits_used + NEW.credit_cost > 1000
  ) THEN RAISE(ABORT, 'monthly_credit_limit_reached') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM ai_quota_period
    WHERE actor_key = NEW.actor_key
      AND period_key = NEW.period_key
      AND photos_used + NEW.photo_cost > 60
  ) THEN RAISE(ABORT, 'monthly_photo_limit_reached') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM ai_quota_period
    WHERE actor_key = NEW.actor_key
      AND period_key = NEW.period_key
      AND attempt_credits + NEW.credit_cost > 1250
  ) THEN RAISE(ABORT, 'monthly_provider_attempt_limit_reached') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM ai_quota_period
    WHERE actor_key = NEW.actor_key
      AND period_key = NEW.period_key
      AND photo_attempts + NEW.photo_cost > 75
  ) THEN RAISE(ABORT, 'monthly_photo_attempt_limit_reached') END;

  SELECT CASE WHEN NEW.sandbox_day_key IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ai_sandbox_daily_attempt
    WHERE actor_key = NEW.actor_key AND day_key = NEW.sandbox_day_key
  ) THEN RAISE(ABORT, 'sandbox_daily_attempt_missing') END;

  SELECT CASE WHEN NEW.sandbox_day_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM ai_sandbox_daily_attempt
    WHERE actor_key = NEW.actor_key
      AND day_key = NEW.sandbox_day_key
      AND attempt_credits + NEW.credit_cost > 200
  ) THEN RAISE(ABORT, 'sandbox_daily_provider_attempt_limit_reached') END;

  SELECT CASE WHEN NEW.sandbox_day_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM ai_sandbox_daily_attempt
    WHERE actor_key = NEW.actor_key
      AND day_key = NEW.sandbox_day_key
      AND photo_attempts + NEW.photo_cost > 12
  ) THEN RAISE(ABORT, 'sandbox_daily_photo_attempt_limit_reached') END;

  UPDATE ai_quota_period
  SET credits_used = credits_used + NEW.credit_cost,
      photos_used = photos_used + NEW.photo_cost,
      attempt_credits = attempt_credits + NEW.credit_cost,
      photo_attempts = photo_attempts + NEW.photo_cost,
      updated_at_ms = NEW.updated_at_ms
  WHERE actor_key = NEW.actor_key AND period_key = NEW.period_key;

  UPDATE ai_sandbox_daily_attempt
  SET attempt_credits = attempt_credits + NEW.credit_cost,
      photo_attempts = photo_attempts + NEW.photo_cost,
      updated_at_ms = NEW.updated_at_ms
  WHERE actor_key = NEW.actor_key AND day_key = NEW.sandbox_day_key;
END;

CREATE TRIGGER IF NOT EXISTS ai_quota_refund_after_update
AFTER UPDATE OF state ON ai_quota_request
WHEN OLD.state = 'reserved' AND NEW.state = 'refunded'
BEGIN
  UPDATE ai_quota_period
  SET credits_used = MAX(0, credits_used - OLD.credit_cost),
      photos_used = MAX(0, photos_used - OLD.photo_cost),
      updated_at_ms = NEW.updated_at_ms
  WHERE actor_key = OLD.actor_key AND period_key = OLD.period_key;
END;

CREATE INDEX IF NOT EXISTS ai_quota_period_expiry
  ON ai_quota_period(period_end_ms);
CREATE INDEX IF NOT EXISTS ai_quota_request_stale_reservation
  ON ai_quota_request(updated_at_ms) WHERE state = 'reserved';
CREATE INDEX IF NOT EXISTS ai_sandbox_daily_attempt_expiry
  ON ai_sandbox_daily_attempt(day_end_ms);
CREATE INDEX IF NOT EXISTS ai_entitlement_tombstone_expiry
  ON ai_entitlement_tombstone(blocked_until_ms);
