-- Deduplicated view for team skills
-- Selects the most recent record for each team-skill combination
CREATE VIEW v_team_skills AS 
WITH DEDUP_TEAM_SKILLS AS (
  SELECT 
    id, 
    skill, 
    category, 
    proficiency, 
    team, 
    members, 
    notes, 
    processed_at, 
    project_id, 
    data_source_id, 
    transformation_type, 
    original_format,
    ROW_NUMBER() OVER (PARTITION BY team, skill ORDER BY processed_at DESC) row_number
  FROM team_skills
)
SELECT 
  id, 
  skill, 
  category, 
  proficiency, 
  team, 
  members, 
  notes, 
  processed_at, 
  project_id, 
  data_source_id, 
  transformation_type, 
  original_format
FROM DEDUP_TEAM_SKILLS 
WHERE row_number = 1;
