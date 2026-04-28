-- Deduplicated view for normalized storages
-- Selects the best mapping (highest confidence, most recent) for each original value
CREATE VIEW v_norm_storages AS
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
  FROM normalized_storages
)
WHERE rn = 1;
