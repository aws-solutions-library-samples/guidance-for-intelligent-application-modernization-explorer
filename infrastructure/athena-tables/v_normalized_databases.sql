-- Deduplicated view for normalized databases
-- Selects the best mapping (highest confidence, most recent) for each original value
CREATE VIEW v_norm_databases AS
SELECT 
  original,
  normalized,
  confidence_score,
  timestamp
FROM (
  SELECT 
    original,
    normalized,
    confidence_score,
    timestamp,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(original)) ORDER BY confidence_score DESC, timestamp DESC) as rn
  FROM normalized_databases
)
WHERE rn = 1;
