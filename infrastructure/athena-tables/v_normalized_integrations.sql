-- Deduplicated view for normalized integrations
-- Selects the best mapping (highest confidence, most recent) for each original value
CREATE VIEW v_norm_integrations AS
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
  FROM normalized_integrations
)
WHERE rn = 1;
