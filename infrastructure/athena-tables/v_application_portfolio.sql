-- Deduplicated view for application portfolio
-- Selects the most recent record for each department-application combination
CREATE VIEW v_application_portfolio AS 
WITH DEDUP_APPLICATION_PORTFOLIO AS (
  SELECT 
    id, 
    applicationname, 
    department, 
    criticality, 
    purpose, 
    processed_at, 
    project_id, 
    data_source_id, 
    transformation_type, 
    original_format,
    ROW_NUMBER() OVER (PARTITION BY department, applicationname ORDER BY processed_at DESC) row_number
  FROM application_portfolio
)
SELECT 
  id, 
  applicationname, 
  department, 
  criticality, 
  purpose, 
  processed_at, 
  project_id, 
  data_source_id, 
  transformation_type, 
  original_format
FROM DEDUP_APPLICATION_PORTFOLIO 
WHERE row_number = 1;
