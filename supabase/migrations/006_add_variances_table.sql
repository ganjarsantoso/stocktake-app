-- Variance Investigation Tracker
-- Safe to run multiple times (idempotent)

DO $$ BEGIN
  -- Create table if it doesn't exist
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'variances') THEN
    CREATE TABLE variances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
      item_id UUID REFERENCES items(id) ON DELETE SET NULL,
      found_log_id UUID REFERENCES found_logs(id) ON DELETE SET NULL,
      variance_type TEXT NOT NULL CHECK (variance_type IN ('missing', 'extra')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
      root_cause TEXT,
      notes TEXT,
      assigned_to UUID REFERENCES users(id),
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      resolved_at TIMESTAMPTZ
    );

    CREATE INDEX idx_variances_dataset ON variances(dataset_id);
    CREATE INDEX idx_variances_status ON variances(status);

    ALTER TABLE variances ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Variances are readable by all authenticated"
      ON variances FOR SELECT TO authenticated USING (true);

    CREATE POLICY "Variances can be inserted by authenticated"
      ON variances FOR INSERT TO authenticated WITH CHECK (true);

    CREATE POLICY "Variances can be updated by authenticated"
      ON variances FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

    CREATE POLICY "Variances can be deleted by authenticated"
      ON variances FOR DELETE TO authenticated USING (true);

    RAISE NOTICE 'Table variances created successfully';
  ELSE
    RAISE NOTICE 'Table variances already exists, skipping';
  END IF;
END $$;
