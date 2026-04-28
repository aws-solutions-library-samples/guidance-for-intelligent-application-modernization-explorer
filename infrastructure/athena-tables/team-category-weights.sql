-- Athena table definition for team category weights (CSV format)
-- This table reads from the CSV files created by the team weights Lambda

CREATE EXTERNAL TABLE IF NOT EXISTS team_category_weights (
  projectId string,
  teamName string,
  category string,
  weight double,
  lastUpdated timestamp,
  updatedBy string,
  version int
)
STORED AS TEXTFILE
LOCATION 's3://${DATA_BUCKET_NAME}/projects/'
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '"',
  'escapeChar' = '\\'
)
TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.projectId.type' = 'injected',
  'storage.location.template' = 's3://${DATA_BUCKET_NAME}/projects/${projectId}/data-processed/team-category-weights/',
  'has_encrypted_data' = 'false',
  'skip.header.line.count' = '1'
);

-- Example queries to test the table:

-- 1. Get all team weights for a specific project
SELECT 
  projectId,
  teamName,
  category,
  weight,
  lastUpdated,
  updatedBy
FROM team_category_weights
WHERE projectId = 'your-project-id'
ORDER BY teamName, category;

-- 2. Get aggregated weights per team
SELECT 
  teamName,
  MAP_AGG(category, weight) as weights,
  SUM(weight) as totalWeight,
  MAX(lastUpdated) as lastUpdated
FROM team_category_weights
WHERE projectId = 'your-project-id'
GROUP BY teamName
ORDER BY teamName;

-- 3. Get teams with incomplete weights (less than 100%)
SELECT 
  teamName,
  SUM(weight) as totalWeight,
  100 - SUM(weight) as remainingWeight
FROM team_category_weights
WHERE projectId = 'your-project-id'
GROUP BY teamName
HAVING SUM(weight) < 100
ORDER BY totalWeight DESC;

-- 4. Get most weighted categories across all teams
SELECT 
  category,
  AVG(weight) as avgWeight,
  COUNT(DISTINCT teamName) as teamCount,
  SUM(weight) as totalWeight
FROM team_category_weights
WHERE projectId = 'your-project-id'
GROUP BY category
ORDER BY avgWeight DESC;
  t.teamName,
  t.weights,
  t.totalWeight
FROM team_category_weights tcw
CROSS JOIN UNNEST(tcw.teams) AS t(teamName, weights, totalWeight)
WHERE tcw.projectId = 'your-project-id';

-- 2. Get weights for a specific category across all teams
SELECT 
  t.teamName,
  t.weights['Programming'] as programming_weight,
  t.weights['Cloud Computing'] as cloud_weight,
  t.weights['DevOps'] as devops_weight
FROM team_category_weights tcw
CROSS JOIN UNNEST(tcw.teams) AS t(teamName, weights, totalWeight)
WHERE tcw.projectId = 'your-project-id';

-- 3. Find teams with incomplete weight allocation (< 100%)
SELECT 
  t.teamName,
  t.totalWeight,
  (100.0 - t.totalWeight) as remaining_weight
FROM team_category_weights tcw
CROSS JOIN UNNEST(tcw.teams) AS t(teamName, weights, totalWeight)
WHERE tcw.projectId = 'your-project-id'
  AND t.totalWeight < 100.0
ORDER BY t.totalWeight DESC;

-- 4. Find teams with over-allocation (> 100%)
SELECT 
  t.teamName,
  t.totalWeight,
  (t.totalWeight - 100.0) as excess_weight
FROM team_category_weights tcw
CROSS JOIN UNNEST(tcw.teams) AS t(teamName, weights, totalWeight)
WHERE tcw.projectId = 'your-project-id'
  AND t.totalWeight > 100.0
ORDER BY t.totalWeight DESC;
