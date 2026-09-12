CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  password_algorithm text NOT NULL,
  password_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  role text NOT NULL CHECK (role IN ('admin', 'reviewer')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_active_idx ON sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS login_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  username_hash text NOT NULL,
  succeeded boolean NOT NULL,
  failure_reason text,
  ip inet,
  user_agent text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code_ciphertext bytea NOT NULL,
  source_code_iv bytea NOT NULL,
  source_code_tag bytea NOT NULL,
  source_lookup_hash text NOT NULL UNIQUE,
  age_text text,
  gender_text text,
  source_checksum text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  source_code_ciphertext bytea NOT NULL,
  source_code_iv bytea NOT NULL,
  source_code_tag bytea NOT NULL,
  source_lookup_hash text NOT NULL,
  label text NOT NULL,
  encounter_date date,
  source_checksum text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, source_lookup_hash)
);

CREATE TABLE IF NOT EXISTS ehr_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  content jsonb NOT NULL,
  source_checksum text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (encounter_id, version)
);

CREATE TABLE IF NOT EXISTS lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  test_code text,
  test_name text NOT NULL,
  value_text text,
  unit text,
  reference_range text,
  abnormal boolean NOT NULL DEFAULT false,
  sample text,
  department text,
  diagnosis text,
  result_at timestamptz,
  source_checksum text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_results_encounter_time_idx ON lab_results (encounter_id, result_at DESC);

CREATE TABLE IF NOT EXISTS image_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  object_key text NOT NULL,
  version_id text,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  checksum_sha256 text NOT NULL,
  storage_status text NOT NULL CHECK (storage_status IN ('pending', 'uploaded', 'verified', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, object_key, version_id)
);

CREATE TABLE IF NOT EXISTS imaging_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  modality text NOT NULL CHECK (modality IN ('XQ', 'CT', 'MRI')),
  source_lookup_hash text NOT NULL,
  label text NOT NULL,
  study_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (encounter_id, modality, source_lookup_hash)
);

CREATE TABLE IF NOT EXISTS imaging_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES imaging_studies(id) ON DELETE CASCADE,
  image_object_id uuid NOT NULL REFERENCES image_objects(id),
  source_lookup_hash text NOT NULL,
  label text NOT NULL,
  dtype text NOT NULL,
  shape integer[] NOT NULL,
  slice_count integer NOT NULL CHECK (slice_count > 0),
  byte_order text NOT NULL,
  data_offset integer NOT NULL CHECK (data_offset >= 0),
  rescale_slope double precision NOT NULL DEFAULT 1,
  rescale_intercept double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, source_lookup_hash)
);

CREATE TABLE IF NOT EXISTS retrieval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text NOT NULL,
  model_version text NOT NULL,
  source_checksum text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retrieval_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES retrieval_runs(id) ON DELETE CASCADE,
  query_patient_id uuid NOT NULL REFERENCES patients(id),
  candidate_patient_id uuid NOT NULL REFERENCES patients(id),
  rank integer NOT NULL CHECK (rank BETWEEN 1 AND 20),
  similarity_score double precision NOT NULL,
  query_split text,
  candidate_split text,
  shared_primary_icd_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  observable_overlap jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, query_patient_id, rank),
  UNIQUE (run_id, query_patient_id, candidate_patient_id)
);

CREATE TABLE IF NOT EXISTS verification_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES retrieval_runs(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batch_queries (
  batch_id uuid NOT NULL REFERENCES verification_batches(id) ON DELETE CASCADE,
  query_patient_id uuid NOT NULL REFERENCES patients(id),
  display_order integer NOT NULL CHECK (display_order >= 0),
  reviewer_id uuid REFERENCES users(id),
  PRIMARY KEY (batch_id, query_patient_id),
  UNIQUE (batch_id, display_order)
);

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id uuid NOT NULL UNIQUE REFERENCES retrieval_pairs(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('pending', 'very_similar', 'similar', 'uncertain', 'dissimilar', 'very_dissimilar')),
  note text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id),
  previous_status text,
  new_status text NOT NULL,
  previous_note text,
  new_note text NOT NULL,
  request_id text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_actor_time_idx ON audit_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_resource_idx ON audit_events (resource_type, resource_id, created_at DESC);
