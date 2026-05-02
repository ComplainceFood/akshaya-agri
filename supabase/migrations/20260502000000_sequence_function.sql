CREATE OR REPLACE FUNCTION increment_sequence(seq_id TEXT, seq_prefix TEXT, seq_year TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO "Sequence" (id, prefix, year, count)
  VALUES (seq_id, seq_prefix, seq_year, 1)
  ON CONFLICT (id) DO UPDATE
    SET count = "Sequence".count + 1
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;
