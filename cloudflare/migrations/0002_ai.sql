-- Lumen-X, Cloudflare edition: state of the "Rewrite with AI" feature.
-- Run this in the D1 console AFTER 0001_init.sql (it only adds two tables).

-- How many AI rewrites a user has done on a day (UTC): the per-user daily limit.
CREATE TABLE ai_usage (
  owner TEXT NOT NULL,
  day   TEXT NOT NULL,   -- YYYY-MM-DD
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner, day)
) WITHOUT ROWID;

-- State of each AI provider: when it is paused after an error, and how many calls were made today.
CREATE TABLE ai_provider_state (
  provider      TEXT PRIMARY KEY,
  blocked_until TEXT,          -- ISO date-time: do not use the provider before this moment
  day           TEXT,          -- the day (UTC) the counter below refers to
  calls         INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
