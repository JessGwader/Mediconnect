-- Gender (kept nullable at the DB level so existing rows never break;
-- enforced as required going forward at the application layer in /register).
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IS NULL OR gender IN ('Male','Female'));

-- Doctor applications: Generalist vs Specialist. A Generalist is
-- auto-tagged to the "General Medicine" specialty at submission time so it
-- still shows up correctly in the same specialty search/filter everyone else uses.
ALTER TABLE doctor_applications ADD COLUMN IF NOT EXISTS doctor_type TEXT NOT NULL DEFAULT 'Specialist'
  CHECK (doctor_type IN ('Generalist','Specialist'));

-- ============================================================= PEER SUPPORT CHAT
-- Topic-based peer support rooms. Patients pick a topic themselves — this
-- never reads from or writes to medical records, and participants are never
-- shown each other's real names inside a room (see support_aliases).
CREATE TABLE IF NOT EXISTS support_topics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One consistent, anonymous alias per (topic, user) pair — lets the same
-- person be recognizable across messages within a room without exposing
-- their real identity to other participants.
CREATE TABLE IF NOT EXISTS support_aliases (
  topic_id    UUID NOT NULL REFERENCES support_topics(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alias       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_support_alias_per_topic ON support_aliases(topic_id, alias);

CREATE TABLE IF NOT EXISTS support_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    UUID NOT NULL REFERENCES support_topics(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_topic ON support_messages(topic_id, created_at);

INSERT INTO support_topics (name, description) VALUES
  ('Diabetes', 'Living with type 1 or type 2 diabetes — daily management, routines, and support.'),
  ('Cancer Support', 'A space for anyone navigating a cancer diagnosis or treatment.'),
  ('Anxiety & Depression', 'Support for coping with anxiety, depression, and related mental health challenges.'),
  ('Chronic Pain', 'For those managing long-term chronic pain conditions.'),
  ('Heart Disease', 'Support for patients living with cardiovascular conditions.'),
  ('General Wellness', 'A general space for anyone who wants encouragement and community.')
ON CONFLICT (name) DO NOTHING;
