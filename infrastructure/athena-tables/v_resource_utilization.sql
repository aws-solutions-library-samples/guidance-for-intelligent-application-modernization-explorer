-- Deduplicated view for resource utilization
-- Selects the most recent record for each application-server-timestamp combination
-- Joins with v_infrastructure_resources to ensure only valid servers are included
CREATE VIEW v_resource_utilization AS 
WITH DEDUP_RESOURCE_UTILIZATION AS (
  SELECT 
    id, 
    applicationname, 
    servername, 
    timestamp, 
    cpuutilization, 
    memoryutilization, 
    storageutilization, 
    networkin, 
    networkout, 
    iops, 
    notes,
    processed_at, 
    project_id, 
    data_source_id, 
    transformation_type, 
    original_format,
    ROW_NUMBER() OVER (PARTITION BY applicationname, servername, timestamp ORDER BY processed_at DESC) row_number
  FROM resource_utilization
)
SELECT 
  DRU.id, 
  DRU.applicationname, 
  DRU.servername, 
  DRU.timestamp, 
  DRU.cpuutilization, 
  DRU.memoryutilization, 
  DRU.storageutilization, 
  DRU.networkin, 
  DRU.networkout, 
  DRU.iops, 
  DRU.notes,
  DRU.processed_at, 
  DRU.project_id, 
  DRU.data_source_id, 
  DRU.transformation_type, 
  DRU.original_format
FROM DEDUP_RESOURCE_UTILIZATION DRU
INNER JOIN v_infrastructure_resources VIR ON DRU.servername = VIR.servername
WHERE DRU.row_number = 1;
