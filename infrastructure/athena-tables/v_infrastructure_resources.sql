-- Deduplicated view for infrastructure resources
-- Selects the most recent record for each environment-application-server combination
-- Joins with v_application_portfolio to ensure only valid applications are included
CREATE VIEW v_infrastructure_resources AS 
WITH DEDUP_INFRASTRUCTURE_RESOURCES AS (
  SELECT 
    id, 
    applicationname, 
    servername, 
    servertype, 
    cpu, 
    memory, 
    storage, 
    region, 
    environment, 
    notes, 
    ostype, 
    osversion, 
    dbengineversion, 
    dbclusterid, 
    dbclustertype, 
    orchestrationplatform,
    processed_at, 
    project_id, 
    data_source_id, 
    transformation_type, 
    original_format,
    ROW_NUMBER() OVER (PARTITION BY environment, applicationname, servername ORDER BY processed_at DESC) row_number
  FROM infrastructure_resources
)
SELECT 
  DIR.id, 
  DIR.applicationname, 
  DIR.servername, 
  DIR.servertype, 
  DIR.cpu, 
  DIR.memory, 
  DIR.storage, 
  DIR.region, 
  DIR.environment, 
  DIR.notes, 
  DIR.ostype, 
  DIR.osversion, 
  DIR.dbengineversion, 
  DIR.dbclusterid, 
  DIR.dbclustertype, 
  DIR.orchestrationplatform,
  DIR.processed_at, 
  DIR.project_id, 
  DIR.data_source_id, 
  DIR.transformation_type, 
  DIR.original_format
FROM DEDUP_INFRASTRUCTURE_RESOURCES DIR
INNER JOIN v_application_portfolio VAP ON DIR.applicationname = VAP.applicationname
WHERE DIR.row_number = 1;
