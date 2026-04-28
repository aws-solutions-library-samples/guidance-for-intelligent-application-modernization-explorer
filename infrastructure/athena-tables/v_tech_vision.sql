-- Deduplicated view for technology vision
-- Selects the most recent record for each quadrant-technology combination
CREATE VIEW v_tech_vision AS 
WITH DEDUP_TECH_VISION AS (
  SELECT 
    id, 
    technology, 
    quadrant, 
    phase, 
    processed_at, 
    project_id, 
    data_source_id, 
    transformation_type, 
    original_format,
    ROW_NUMBER() OVER (PARTITION BY quadrant, technology ORDER BY processed_at DESC) row_number
  FROM tech_vision
)
SELECT 
  id, 
  technology, 
  quadrant, 
  phase, 
  processed_at, 
  project_id, 
  data_source_id, 
  transformation_type, 
  original_format
FROM DEDUP_TECH_VISION 
WHERE row_number = 1;
