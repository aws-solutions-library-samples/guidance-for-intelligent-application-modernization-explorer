-- Deduplicated view for technology stack with normalized technology names
-- Selects the most recent record for each application-component combination
-- Joins with v_application_portfolio to ensure only valid applications are included
-- Normalizes all technology fields using global normalized views from app-modex-{account} database
CREATE VIEW v_tech_stack AS 
WITH DEDUP_TECH_STACK AS (
  SELECT 
    id, 
    applicationname, 
    componentname, 
    runtime, 
    framework, 
    databases, 
    integrations, 
    storages, 
    processed_at, 
    project_id, 
    data_source_id, 
    transformation_type, 
    original_format,
    ROW_NUMBER() OVER (PARTITION BY applicationname, componentname ORDER BY processed_at DESC) row_number
  FROM tech_stack
),
-- Normalize runtime (single value)
NORMALIZED_RUNTIME AS (
  SELECT 
    DTS.id,
    DTS.applicationname,
    DTS.componentname,
    COALESCE(NR.normalized, DTS.runtime) AS normalized_runtime,
    DTS.framework,
    DTS.databases,
    DTS.integrations,
    DTS.storages,
    DTS.processed_at,
    DTS.project_id,
    DTS.data_source_id,
    DTS.transformation_type,
    DTS.original_format
  FROM DEDUP_TECH_STACK DTS
  LEFT JOIN "app-modex-${account}".v_norm_runtimes NR 
    ON LOWER(TRIM(DTS.runtime)) = LOWER(TRIM(NR.original))
  WHERE DTS.row_number = 1
),
-- Normalize framework (single value)
NORMALIZED_FRAMEWORK AS (
  SELECT 
    NRT.id,
    NRT.applicationname,
    NRT.componentname,
    NRT.normalized_runtime,
    COALESCE(NF.normalized, NRT.framework) AS normalized_framework,
    NRT.databases,
    NRT.integrations,
    NRT.storages,
    NRT.processed_at,
    NRT.project_id,
    NRT.data_source_id,
    NRT.transformation_type,
    NRT.original_format
  FROM NORMALIZED_RUNTIME NRT
  LEFT JOIN "app-modex-${account}".v_norm_frameworks NF 
    ON LOWER(TRIM(NRT.framework)) = LOWER(TRIM(NF.original))
),
-- Explode and normalize databases (CSV field)
EXPLODED_DATABASES AS (
  SELECT 
    NFW.id,
    NFW.applicationname,
    NFW.componentname,
    NFW.normalized_runtime,
    NFW.normalized_framework,
    TRIM(db_value) AS original_database,
    NFW.integrations,
    NFW.storages,
    NFW.processed_at,
    NFW.project_id,
    NFW.data_source_id,
    NFW.transformation_type,
    NFW.original_format
  FROM NORMALIZED_FRAMEWORK NFW
  CROSS JOIN UNNEST(SPLIT(NFW.databases, ',')) AS t(db_value)
  WHERE NFW.databases IS NOT NULL AND NFW.databases != ''
),
NORMALIZED_DATABASES AS (
  SELECT 
    ED.id,
    ED.applicationname,
    ED.componentname,
    ED.normalized_runtime,
    ED.normalized_framework,
    COALESCE(ND.normalized, ED.original_database) AS normalized_database,
    ED.integrations,
    ED.storages,
    ED.processed_at,
    ED.project_id,
    ED.data_source_id,
    ED.transformation_type,
    ED.original_format
  FROM EXPLODED_DATABASES ED
  LEFT JOIN "app-modex-${account}".v_norm_databases ND 
    ON LOWER(TRIM(ED.original_database)) = LOWER(TRIM(ND.original))
),
AGGREGATED_DATABASES AS (
  SELECT 
    id,
    applicationname,
    componentname,
    normalized_runtime,
    normalized_framework,
    ARRAY_JOIN(ARRAY_AGG(DISTINCT normalized_database), ', ') AS normalized_databases,
    integrations,
    storages,
    processed_at,
    project_id,
    data_source_id,
    transformation_type,
    original_format
  FROM NORMALIZED_DATABASES
  GROUP BY id, applicationname, componentname, normalized_runtime, normalized_framework, 
           integrations, storages, processed_at, project_id, data_source_id, 
           transformation_type, original_format
),
-- Handle records with no databases
NO_DATABASES AS (
  SELECT 
    NFW.id,
    NFW.applicationname,
    NFW.componentname,
    NFW.normalized_runtime,
    NFW.normalized_framework,
    '' AS normalized_databases,
    NFW.integrations,
    NFW.storages,
    NFW.processed_at,
    NFW.project_id,
    NFW.data_source_id,
    NFW.transformation_type,
    NFW.original_format
  FROM NORMALIZED_FRAMEWORK NFW
  WHERE NFW.databases IS NULL OR NFW.databases = ''
),
-- Combine databases results
ALL_DATABASES AS (
  SELECT * FROM AGGREGATED_DATABASES
  UNION ALL
  SELECT * FROM NO_DATABASES
),
-- Explode and normalize integrations (CSV field)
EXPLODED_INTEGRATIONS AS (
  SELECT 
    AD.id,
    AD.applicationname,
    AD.componentname,
    AD.normalized_runtime,
    AD.normalized_framework,
    AD.normalized_databases,
    TRIM(int_value) AS original_integration,
    AD.storages,
    AD.processed_at,
    AD.project_id,
    AD.data_source_id,
    AD.transformation_type,
    AD.original_format
  FROM ALL_DATABASES AD
  CROSS JOIN UNNEST(SPLIT(AD.integrations, ',')) AS t(int_value)
  WHERE AD.integrations IS NOT NULL AND AD.integrations != ''
),
NORMALIZED_INTEGRATIONS AS (
  SELECT 
    EI.id,
    EI.applicationname,
    EI.componentname,
    EI.normalized_runtime,
    EI.normalized_framework,
    EI.normalized_databases,
    COALESCE(NI.normalized, EI.original_integration) AS normalized_integration,
    EI.storages,
    EI.processed_at,
    EI.project_id,
    EI.data_source_id,
    EI.transformation_type,
    EI.original_format
  FROM EXPLODED_INTEGRATIONS EI
  LEFT JOIN "app-modex-${account}".v_norm_integrations NI 
    ON LOWER(TRIM(EI.original_integration)) = LOWER(TRIM(NI.original))
),
AGGREGATED_INTEGRATIONS AS (
  SELECT 
    id,
    applicationname,
    componentname,
    normalized_runtime,
    normalized_framework,
    normalized_databases,
    ARRAY_JOIN(ARRAY_AGG(DISTINCT normalized_integration), ', ') AS normalized_integrations,
    storages,
    processed_at,
    project_id,
    data_source_id,
    transformation_type,
    original_format
  FROM NORMALIZED_INTEGRATIONS
  GROUP BY id, applicationname, componentname, normalized_runtime, normalized_framework, 
           normalized_databases, storages, processed_at, project_id, data_source_id, 
           transformation_type, original_format
),
-- Handle records with no integrations
NO_INTEGRATIONS AS (
  SELECT 
    AD.id,
    AD.applicationname,
    AD.componentname,
    AD.normalized_runtime,
    AD.normalized_framework,
    AD.normalized_databases,
    '' AS normalized_integrations,
    AD.storages,
    AD.processed_at,
    AD.project_id,
    AD.data_source_id,
    AD.transformation_type,
    AD.original_format
  FROM ALL_DATABASES AD
  WHERE AD.integrations IS NULL OR AD.integrations = ''
),
-- Combine integrations results
ALL_INTEGRATIONS AS (
  SELECT * FROM AGGREGATED_INTEGRATIONS
  UNION ALL
  SELECT * FROM NO_INTEGRATIONS
),
-- Explode and normalize storages (CSV field)
EXPLODED_STORAGES AS (
  SELECT 
    AI.id,
    AI.applicationname,
    AI.componentname,
    AI.normalized_runtime,
    AI.normalized_framework,
    AI.normalized_databases,
    AI.normalized_integrations,
    TRIM(stor_value) AS original_storage,
    AI.processed_at,
    AI.project_id,
    AI.data_source_id,
    AI.transformation_type,
    AI.original_format
  FROM ALL_INTEGRATIONS AI
  CROSS JOIN UNNEST(SPLIT(AI.storages, ',')) AS t(stor_value)
  WHERE AI.storages IS NOT NULL AND AI.storages != ''
),
NORMALIZED_STORAGES AS (
  SELECT 
    ES.id,
    ES.applicationname,
    ES.componentname,
    ES.normalized_runtime,
    ES.normalized_framework,
    ES.normalized_databases,
    ES.normalized_integrations,
    COALESCE(NS.normalized, ES.original_storage) AS normalized_storage,
    ES.processed_at,
    ES.project_id,
    ES.data_source_id,
    ES.transformation_type,
    ES.original_format
  FROM EXPLODED_STORAGES ES
  LEFT JOIN "app-modex-${account}".v_norm_storages NS 
    ON LOWER(TRIM(ES.original_storage)) = LOWER(TRIM(NS.original))
),
AGGREGATED_STORAGES AS (
  SELECT 
    id,
    applicationname,
    componentname,
    normalized_runtime,
    normalized_framework,
    normalized_databases,
    normalized_integrations,
    ARRAY_JOIN(ARRAY_AGG(DISTINCT normalized_storage), ', ') AS normalized_storages,
    processed_at,
    project_id,
    data_source_id,
    transformation_type,
    original_format
  FROM NORMALIZED_STORAGES
  GROUP BY id, applicationname, componentname, normalized_runtime, normalized_framework, 
           normalized_databases, normalized_integrations, processed_at, project_id, 
           data_source_id, transformation_type, original_format
),
-- Handle records with no storages
NO_STORAGES AS (
  SELECT 
    AI.id,
    AI.applicationname,
    AI.componentname,
    AI.normalized_runtime,
    AI.normalized_framework,
    AI.normalized_databases,
    AI.normalized_integrations,
    '' AS normalized_storages,
    AI.processed_at,
    AI.project_id,
    AI.data_source_id,
    AI.transformation_type,
    AI.original_format
  FROM ALL_INTEGRATIONS AI
  WHERE AI.storages IS NULL OR AI.storages = ''
),
-- Combine storages results
ALL_STORAGES AS (
  SELECT * FROM AGGREGATED_STORAGES
  UNION ALL
  SELECT * FROM NO_STORAGES
)
-- Final select with join to application portfolio
SELECT 
  AST.id, 
  AST.applicationname, 
  AST.componentname, 
  AST.normalized_runtime AS runtime,
  AST.normalized_framework AS framework,
  AST.normalized_databases AS databases,
  AST.normalized_integrations AS integrations,
  AST.normalized_storages AS storages,
  AST.processed_at, 
  AST.project_id, 
  AST.data_source_id, 
  AST.transformation_type, 
  AST.original_format
FROM ALL_STORAGES AST
INNER JOIN v_application_portfolio VAP ON AST.applicationname = VAP.applicationname;
