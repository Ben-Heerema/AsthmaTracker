-- =============================================================================
-- schema.sql — Database Table Definitions
-- =============================================================================
-- This file defines all 12 tables used by the Asthma Tracker application.
-- It is read by db.js and executed when the app first starts.
--
-- WHAT IS SQLite?
-- SQLite is a lightweight database stored in a single file (asthma_tracker.db).
-- It uses SQL (Structured Query Language) to store and retrieve data.
-- Unlike MySQL or PostgreSQL, SQLite needs no server - it runs inside the app.
--
-- READING SQL TABLE DEFINITIONS:
--   CREATE TABLE IF NOT EXISTS table_name (
--     column_name  DATA_TYPE  CONSTRAINT,
--     ...
--   );
--
-- Common data types:
--   INTEGER   - Whole numbers (1, 2, 100, -5)
--   REAL      - Decimal numbers (1.5, 98.6)
--   TEXT      - Strings of any length
--   BOOLEAN   - Stored as INTEGER (0 = false, 1 = true) in SQLite
--   DATETIME  - Date and time (stored as TEXT: "2025-01-15 14:30:00")
--   DATE      - Just the date (stored as TEXT: "2025-01-15")
--
-- Common constraints:
--   PRIMARY KEY        - Unique identifier for each row, auto-increments
--   NOT NULL           - Value is required (cannot be left blank)
--   UNIQUE             - No two rows can have the same value in this column
--   DEFAULT value      - Use this value if none is provided
--   REFERENCES tbl(col) - Foreign key (links to another table)
-- =============================================================================

PRAGMA foreign_keys = ON;  -- Enable foreign key constraint checking

-- =============================================================================
-- TABLE 1: Users
-- Stores Parent and Provider accounts.
-- Children are stored separately in the Children table.
-- =============================================================================
CREATE TABLE IF NOT EXISTS Users (
    user_id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    username                TEXT    NOT NULL UNIQUE,
    email                   TEXT    NOT NULL UNIQUE,
    password_hash           TEXT    NOT NULL,      -- bcrypt hash, never plain text
    role                    TEXT    NOT NULL CHECK(role IN ('parent', 'provider')),
    created_at              DATETIME DEFAULT (datetime('now')),
    has_completed_onboarding INTEGER DEFAULT 0     -- 0 = false, 1 = true
);

-- =============================================================================
-- TABLE 2: Children
-- Each child belongs to one parent (via parent_id).
-- Children log in using the Children table, not the Users table.
-- =============================================================================
CREATE TABLE IF NOT EXISTS Children (
    child_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id           INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    username            TEXT    NOT NULL UNIQUE,
    password_hash       TEXT    NOT NULL,
    name                TEXT    NOT NULL,
    birthday            DATE    NOT NULL,
    personal_best_pef   REAL    CHECK(personal_best_pef IS NULL OR (personal_best_pef > 0 AND personal_best_pef <= 900)),
    notes               TEXT,                      -- Max 500 chars (enforced in app, not SQL)
    icon                TEXT    DEFAULT 'boy_older', -- Avatar icon: girl_older, girl_younger, boy_older, boy_younger, baby
    created_at          DATETIME DEFAULT (datetime('now'))
);

-- =============================================================================
-- TABLE 3: Medications
-- Each medication belongs to ONE child and cannot be reassigned.
-- Tracks both rescue (e.g., albuterol) and controller (e.g., fluticasone) medications.
-- =============================================================================
CREATE TABLE IF NOT EXISTS Medications (
    medication_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id            INTEGER NOT NULL REFERENCES Children(child_id) ON DELETE CASCADE,
    medication_name     TEXT    NOT NULL,          -- Max 50 chars (enforced in app)
    is_rescue           INTEGER NOT NULL DEFAULT 0, -- 1 = rescue inhaler, 0 = controller
    purchase_date       DATE    NOT NULL,
    expiration_date     DATE    NOT NULL,
    doses_remaining     INTEGER NOT NULL DEFAULT 0 CHECK(doses_remaining BETWEEN 0 AND 900),
    notes               TEXT,                      -- Optional, max 500 chars
    is_active           INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = inactive (soft-delete)
    created_at          DATETIME DEFAULT (datetime('now')),
    updated_at          DATETIME DEFAULT (datetime('now'))
);

-- =============================================================================
-- TABLE 4: Controller_Schedule
-- The days of the week the child should take their controller medication.
-- One schedule record per child (created when the child is added).
-- =============================================================================
CREATE TABLE IF NOT EXISTS Controller_Schedule (
    schedule_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id        INTEGER NOT NULL UNIQUE REFERENCES Children(child_id) ON DELETE CASCADE, -- UNIQUE: one schedule per child
    monday          INTEGER DEFAULT 0,   -- 1 = scheduled on this day
    tuesday         INTEGER DEFAULT 0,
    wednesday       INTEGER DEFAULT 0,
    thursday        INTEGER DEFAULT 0,
    friday          INTEGER DEFAULT 0,
    saturday        INTEGER DEFAULT 0,
    sunday          INTEGER DEFAULT 0,
    doses_per_day   INTEGER NOT NULL DEFAULT 1,
    created_at      DATETIME DEFAULT (datetime('now')),
    updated_at      DATETIME DEFAULT (datetime('now'))
);

-- =============================================================================
-- TABLE 5: Daily_Checkins
-- One entry per child per day maximum.
-- Records symptoms (severity) and triggers (environmental factors).
-- =============================================================================
CREATE TABLE IF NOT EXISTS Daily_Checkins (
    checkin_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id            INTEGER NOT NULL REFERENCES Children(child_id) ON DELETE CASCADE,
    date                DATE    NOT NULL,           -- Format: YYYY-MM-DD
    -- Symptom severities: 'none', 'some', 'a_lot'
    night_waking        TEXT    DEFAULT 'none' CHECK(night_waking IN ('none', 'some', 'a_lot')),
    activity_limits     TEXT    DEFAULT 'none' CHECK(activity_limits IN ('none', 'some', 'a_lot')),
    coughing            TEXT    DEFAULT 'none' CHECK(coughing IN ('none', 'some', 'a_lot')),
    wheezing            TEXT    DEFAULT 'none' CHECK(wheezing IN ('none', 'some', 'a_lot')),
    -- Triggers (boolean checkboxes)
    trigger_exercise    INTEGER DEFAULT 0,
    trigger_cold_air    INTEGER DEFAULT 0,
    trigger_dust        INTEGER DEFAULT 0,
    trigger_smoke       INTEGER DEFAULT 0,
    trigger_illness     INTEGER DEFAULT 0,
    trigger_strong_odors INTEGER DEFAULT 0,
    created_at          DATETIME DEFAULT (datetime('now')),
    -- Ensures only ONE check-in per child per day
    UNIQUE(child_id, date)
);

-- =============================================================================
-- TABLE 6: PEF_Entries
-- Peak Expiratory Flow measurements.
-- One entry per child per day (updated if re-entered same day).
-- =============================================================================
CREATE TABLE IF NOT EXISTS PEF_Entries (
    pef_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id            INTEGER NOT NULL REFERENCES Children(child_id) ON DELETE CASCADE,
    date                DATE    NOT NULL,
    daily_pef           REAL    CHECK(daily_pef IS NULL OR (daily_pef > 0 AND daily_pef <= 900)),
    pre_medication_pef  REAL    CHECK(pre_medication_pef IS NULL OR (pre_medication_pef > 0 AND pre_medication_pef <= 900)),
    post_medication_pef REAL    CHECK(post_medication_pef IS NULL OR (post_medication_pef > 0 AND post_medication_pef <= 900)),
    created_at          DATETIME DEFAULT (datetime('now')),
    updated_at          DATETIME DEFAULT (datetime('now')),
    UNIQUE(child_id, date)                          -- One entry per day per child
);

-- =============================================================================
-- TABLE 7: Medication_Logs
-- Records each time medication is taken (dose logging by the child).
-- =============================================================================
CREATE TABLE IF NOT EXISTS Medication_Logs (
    log_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id        INTEGER NOT NULL REFERENCES Children(child_id) ON DELETE CASCADE,
    medication_id   INTEGER NOT NULL REFERENCES Medications(medication_id) ON DELETE CASCADE,
    doses_taken     INTEGER NOT NULL CHECK(doses_taken BETWEEN 1 AND 10),
    -- Breathing scores: 0=Very Bad, 1=Bad, 2=Normal, 3=Good, 4=Very Good
    breathing_before INTEGER NOT NULL CHECK(breathing_before BETWEEN 0 AND 4),
    breathing_after  INTEGER NOT NULL CHECK(breathing_after BETWEEN 0 AND 4),
    timestamp       DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- TABLE 8: Incident_Reports
-- Triage records created during emergency situations.
-- =============================================================================
CREATE TABLE IF NOT EXISTS Incident_Reports (
    incident_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id                INTEGER NOT NULL REFERENCES Children(child_id) ON DELETE CASCADE,
    logged_by_user_id       INTEGER REFERENCES Users(user_id) ON DELETE SET NULL, -- NULL if logged by child
    timestamp               DATETIME NOT NULL DEFAULT (datetime('now')),
    can_speak_full_sentences INTEGER NOT NULL,   -- 1 = yes, 0 = no
    chest_retracting        INTEGER NOT NULL,    -- 1 = yes (danger sign), 0 = no
    blue_grey_lips          INTEGER NOT NULL,    -- 1 = yes (danger sign), 0 = no
    current_pef             REAL,               -- Optional PEF reading at time of incident
    user_notes              TEXT    NOT NULL,    -- Required free-text description
    guidance_provided       TEXT    NOT NULL,    -- Steps shown during triage
    medications_administered TEXT,              -- JSON: [{medication_id, doses}]
    created_at              DATETIME DEFAULT (datetime('now'))
);

-- =============================================================================
-- TABLE 9: Badges
-- Gamification rewards for children achieving milestones.
-- Once achieved, never re-checked (is_achieved stays true).
-- =============================================================================
CREATE TABLE IF NOT EXISTS Badges (
    badge_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id            INTEGER NOT NULL REFERENCES Children(child_id) ON DELETE CASCADE,
    badge_name          TEXT    NOT NULL,       -- Max 100 chars
    badge_description   TEXT    NOT NULL,       -- Max 500 chars
    -- criteria_type values: 'technique_sessions', 'controller_adherence'
    criteria_type       TEXT    NOT NULL,
    criteria_value      INTEGER NOT NULL,       -- e.g., 10 (sessions), 6 (months)
    is_achieved         INTEGER DEFAULT 0,      -- 0 = not yet, 1 = achieved
    is_active           INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = inactive (soft-delete)
    achieved_at         DATETIME,              -- Set when badge is earned
    created_at          DATETIME DEFAULT (datetime('now'))
);

-- =============================================================================
-- TABLE 10: Inhaler_Technique_Sessions
-- Records each time a child completes the inhaler technique tutorial.
-- Used to calculate badge criteria.
-- =============================================================================
CREATE TABLE IF NOT EXISTS Inhaler_Technique_Sessions (
    session_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id        INTEGER NOT NULL REFERENCES Children(child_id) ON DELETE CASCADE,
    session_type    TEXT NOT NULL CHECK(session_type IN ('regular', 'mask_spacer')),
    completed_at    DATETIME DEFAULT (datetime('now'))
);

-- =============================================================================
-- TABLE 11: Provider_Access
-- Links a provider to a child's data with selective sharing settings.
-- Providers enter the access_code generated by the parent to gain access.
-- =============================================================================
CREATE TABLE IF NOT EXISTS Provider_Access (
    access_id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id                   INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    provider_id                 INTEGER REFERENCES Users(user_id) ON DELETE CASCADE,  -- NULL until code is activated
    child_id                    INTEGER NOT NULL REFERENCES Children(child_id) ON DELETE CASCADE,
    access_code                 TEXT    NOT NULL UNIQUE,
    code_expires_at             DATETIME NOT NULL,  -- 48 hours from creation
    -- Individual sharing toggles (parent controls what providers can see)
    share_rescue_logs           INTEGER DEFAULT 0,
    share_controller_adherence  INTEGER DEFAULT 0,
    share_symptoms_chart        INTEGER DEFAULT 0,
    share_triggers              INTEGER DEFAULT 0,
    share_pef                   INTEGER DEFAULT 0,
    share_triage_incidents      INTEGER DEFAULT 0,
    share_summary_charts        INTEGER DEFAULT 0,
    created_at                  DATETIME DEFAULT (datetime('now')),
    activated_at                DATETIME            -- Set when provider uses the code
);

-- =============================================================================
-- TABLE 12: Notifications
-- Stores notification history for the last 2 weeks.
-- The scheduler auto-deletes records older than 2 weeks.
-- =============================================================================
CREATE TABLE IF NOT EXISTS Notifications (
    notification_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    -- Valid types: 'medication_expiry', 'low_dose_count', 'child_emergency',
    --              'breathing_decline', 'red_zone_alert', 'pef_submitted'
    notification_type   TEXT    NOT NULL,
    title               TEXT    NOT NULL,
    message             TEXT    NOT NULL,
    is_read             INTEGER DEFAULT 0,          -- 0 = unread, 1 = read
    related_child_id    INTEGER REFERENCES Children(child_id) ON DELETE CASCADE,
    related_medication_id INTEGER REFERENCES Medications(medication_id) ON DELETE CASCADE,
    created_at          DATETIME DEFAULT (datetime('now')),
    expires_at          DATETIME NOT NULL           -- Auto-deleted after this date
);

-- =============================================================================
-- TABLE 13: App_Settings
-- Simple key-value store for application settings (e.g. persistent session).
-- =============================================================================
CREATE TABLE IF NOT EXISTS App_Settings (
    key     TEXT PRIMARY KEY,
    value   TEXT
);

-- =============================================================================
-- INDEXES
-- Indexes speed up common database lookups.
-- Without them, SQLite scans every row to find matching records.
-- =============================================================================

-- Speed up "find all children for parent X" queries
CREATE INDEX IF NOT EXISTS idx_children_parent ON Children(parent_id);

-- Speed up "find all medications for child X" queries
CREATE INDEX IF NOT EXISTS idx_medications_child ON Medications(child_id);

-- Speed up "find today's check-in" queries
CREATE INDEX IF NOT EXISTS idx_checkins_child_date ON Daily_Checkins(child_id, date);

-- Speed up PEF history lookups
CREATE INDEX IF NOT EXISTS idx_pef_child_date ON PEF_Entries(child_id, date);

-- Speed up medication log history
CREATE INDEX IF NOT EXISTS idx_medlogs_child ON Medication_Logs(child_id);

-- Speed up notification lookups by user
CREATE INDEX IF NOT EXISTS idx_notifications_user ON Notifications(user_id);

-- Speed up expired notification cleanup
CREATE INDEX IF NOT EXISTS idx_notifications_expires ON Notifications(expires_at);

-- Speed up provider patient lookups
CREATE INDEX IF NOT EXISTS idx_provider_access_provider ON Provider_Access(provider_id);

-- Speed up incident history lookups
CREATE INDEX IF NOT EXISTS idx_incidents_child_time ON Incident_Reports(child_id, timestamp);

-- Speed up medication log date range queries
CREATE INDEX IF NOT EXISTS idx_medlogs_child_time ON Medication_Logs(child_id, timestamp);
