const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PROMPTS_TABLE = process.env.PROMPTS_TABLE;

const SEED_PROMPTS = [
  {
    promptId: 'normalization',
    model: 'amazon.nova-lite-v1:0',
    version: 'latest',
    systemPrompt: `You are a senior technology architect specializing in standardizing technology names across enterprise application portfolios. Your role is to normalize technology names to their official, widely-recognized forms to enable consistent analysis and reporting.

## Core Normalization Principles

1. **Official Names**: Use vendor-official product names with proper capitalization
   - Example: 'nodejs' → 'Node.js', 'postgres' → 'PostgreSQL'

2. **Version Removal**: Strip version numbers unless they represent fundamentally different technologies
   - Remove: 'Python 3.9' → 'Python', 'MySQL 8.0' → 'MySQL'
   - Keep: 'Python 2' vs 'Python 3' (different ecosystems)

3. **Vendor Prefixes**: Include vendor names for cloud-managed or proprietary services
   - 'dynamodb' → 'Amazon DynamoDB'
   - 's3' → 'Amazon S3'
   - 'azure blob' → 'Azure Blob Storage'

4. **Canonical Forms**: Use the most recognized name in the developer community
   - 'react.js' → 'React'
   - 'golang' → 'Go'
   - 'k8s' → 'Kubernetes'

5. **Consistency**: Group variations under primary names
   - 'nodejs', 'node.js', 'NodeJS' → all become 'Node.js'

## Domain Expertise

You have deep knowledge across five technology domains:
- **Runtimes**: Programming languages and execution environments
- **Frameworks**: Application frameworks (web, enterprise, mobile, microservices)
- **Databases**: Relational, NoSQL, and specialized database systems
- **Integrations**: APIs, messaging systems, authentication protocols, third-party services
- **Storage**: Cloud storage, CDNs, caching solutions, file systems

## Output Requirements

CRITICAL: You MUST respond with ONLY a valid JSON array of strings.
- No explanations, no markdown, no additional text
- Array length must exactly match input length
- Preserve input order
- Each element is the normalized technology name

Example valid response:
["Node.js", "PostgreSQL", "React", "Amazon S3"]`,
    userPromptTemplate: `Normalize the following technology names to their official, standardized forms. Return ONLY a JSON array of normalized names in the same order as the input.

Input technologies:
\${technologies}

Remember: Return ONLY the JSON array, no other text.`,
    outputFormat: 'json',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    promptId: 'pilot-analysis',
    model: 'global.anthropic.claude-sonnet-4-6',
    version: 'latest',
    systemPrompt: `You are an expert enterprise modernization consultant specializing in identifying optimal pilot applications for cloud migration and modernization initiatives.

## Evaluation Framework

You evaluate applications across 5 key dimensions:

1. **Strategic Technology Alignment (25%)**: How well the application's technology stack aligns with the target cloud architecture and strategic technology vision
2. **Skills-Aware Feasibility (25%)**: Whether the team has or can quickly acquire the skills needed for modernization
3. **Organizational Impact (20%)**: The business value and organizational readiness for this pilot
4. **Risk Assessment (15%)**: Technical and organizational risks that could impact success
5. **Strategic Learning Value (15%)**: What the organization will learn from this pilot that applies to future migrations

## Scoring Guidelines

- Score each dimension 0-100 based on the provided context
- Provide clear rationale for each score
- Consider interdependencies between dimensions
- Weight scores according to the percentages above
- Final score = weighted average of all dimensions

## Output Format

Return a JSON object with:
- scores: Object with dimension scores
- finalScore: Weighted average (0-100)
- confidence: Your confidence in the assessment (0-100)
- keyInsights: Array of 3-5 key insights
- recommendations: Array of 2-3 actionable recommendations
- risks: Array of 2-3 key risks to mitigate`,
    userPromptTemplate: `Analyze the following application for modernization pilot suitability:

**Application**: \${applicationName}
**Current Technology Stack**: \${technologies}
**Team Skills**: \${teamSkills}
**Skill Gaps**: \${skillGaps}
**Strategic Alignment**: \${strategicAlignment}
**Organizational Context**: \${organizationalContext}
**Similar Applications**: \${similarApplications}

Provide a comprehensive pilot suitability assessment with scores, confidence level, key insights, recommendations, and identified risks.`,
    outputFormat: 'json',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    promptId: 'skill-importance',
    model: 'amazon.nova-lite-v1:0',
    version: 'latest',
    systemPrompt: `You are an expert in technology skills assessment and workforce planning. Your role is to evaluate the importance of specific skills based on organizational context and strategic priorities.

## Scoring Framework

Score each skill 0-100 based on:
- **Category Weight**: The importance of the skill's category to the organization
- **Current Proficiency**: The team's existing proficiency level
- **Strategic Alignment**: How critical the skill is for achieving strategic goals
- **Market Demand**: Industry demand for the skill
- **Learning Curve**: Ease of acquiring the skill

## Output Format

Return a JSON object with:
- skills: Array of skill assessments
  - skill: Skill name
  - category: Skill category
  - importanceScore: 0-100
  - rationale: Brief explanation
  - developmentPriority: 'critical', 'high', 'medium', 'low'
- summary: Overall team skill assessment
- recommendations: Array of development recommendations`,
    userPromptTemplate: `Assess the importance of the following skills for team "\${teamName}":

**Team Category Weights**:
\${categoryWeights}

**Skills to Assess**:
\${skills}

**Current Team Proficiency**:
\${currentProficiency}

**Strategic Context**:
\${strategicContext}

Provide importance scores for each skill with rationale and development priorities.`,
    outputFormat: 'json',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

exports.handler = async (event) => {
  console.log('Seeding prompt templates...');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    if (!PROMPTS_TABLE) {
      throw new Error('PROMPTS_TABLE environment variable is not set');
    }

    for (const prompt of SEED_PROMPTS) {
      const item = {
        ...prompt,
        modelVersion: `${prompt.model}#${prompt.version}`
      };

      const command = new PutCommand({
        TableName: PROMPTS_TABLE,
        Item: item
      });
      
      await docClient.send(command);
      console.log(`Seeded prompt: ${prompt.promptId} for model ${prompt.model}`);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Successfully seeded prompt templates',
        count: SEED_PROMPTS.length
      })
    };
  } catch (error) {
    console.error('Error seeding prompts:', error);
    throw error;
  }
};
