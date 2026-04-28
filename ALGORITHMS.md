# App-ModEx Algorithms Documentation

This document describes the algorithms used in the App-ModEx platform for various analysis and computation tasks.

## Table of Contents

1. [Application Similarity Analysis](#application-similarity-analysis)
2. [Component Similarity Analysis](#component-similarity-analysis)
3. [Pilot Identification Analysis](#pilot-identification-analysis)
4. [Team Estimates Algorithm](#team-estimates-algorithm)

---

## Application Similarity Analysis

### Algorithm: Weighted Jaccard Similarity (Application-Level)

**Purpose**: Identify similar applications based on their aggregated technology stack and architectural characteristics across all components.

**Implementation**: `infrastructure/lambda/project-specific/app-similarity-small-dataset/index.py`

**Runtime**: Python 3.9 (Lambda function)

**Orchestration**: AWS Step Functions - `app-modex-app-sim-analysis-{projectId}`
- **Partition Lambda** (Node.js 22.x): `app-modex-app-partition-{projectId}`
- **Process Lambda** (Python 3.9): `app-modex-app-process-{projectId}` (Map state, max 50 concurrent)
- **Aggregate Lambda** (Node.js 22.x): `app-modex-app-aggregate-{projectId}`

#### Algorithm Overview

The application similarity algorithm aggregates component-level technologies at the application level and uses weighted Jaccard similarity to compare applications. This approach focuses on modernization impact by prioritizing runtime and framework similarities.

#### Technology Aggregation Process

1. **Component Aggregation**: Collect all technologies from all components within each application
2. **Technology Categorization**: Group technologies into 5 categories
3. **Deduplication**: Remove duplicate technologies within each category per application
4. **Feature Vector Creation**: Create application-level feature vectors

#### Similarity Dimensions & Weights

| Dimension | Weight | Justification | Method |
|-----------|--------|---------------|--------|
| Runtime Technologies | 40% | Most critical for modernization strategy | Jaccard Similarity |
| Framework Technologies | 30% | Defines development approach and migration complexity | Jaccard Similarity |
| Database Technologies | 20% | Important for data architecture decisions | Jaccard Similarity |
| Integration Technologies | 7% | Moderate impact on modernization planning | Jaccard Similarity |
| Storage Technologies | 3% | Least impact on overall modernization | Jaccard Similarity |

#### Mathematical Formula

```
ApplicationSimilarity(A, B) = Σ(weight_i × Jaccard(A_i, B_i))

Where:
- A_i, B_i = technology sets for dimension i in applications A and B
- Jaccard(A_i, B_i) = |A_i ∩ B_i| / |A_i ∪ B_i|
- weight_i = predefined weight for technology dimension i
```

#### Detailed Jaccard Calculation

```
For each technology dimension:
- If both sets empty: Jaccard = 1.0 (perfect match)
- If one set empty: Jaccard = 0.0 (no match)
- Otherwise: Jaccard = |intersection| / |union|

Final Score = (0.40 × runtime_jaccard) + 
              (0.30 × framework_jaccard) + 
              (0.20 × database_jaccard) + 
              (0.07 × integration_jaccard) + 
              (0.03 × storage_jaccard)
```

#### Processing Pipeline

1. **Data Aggregation**: Collect all component technologies per application
2. **Technology Parsing**: Parse comma-separated technology strings
3. **Feature Extraction**: Create application-level technology sets
4. **Similarity Matrix**: Calculate pairwise similarities O(n²)
5. **Filtering**: Store only similarities > 0.1 threshold
6. **Storage**: Store results in DynamoDB with metadata

#### Example Calculation

```
Application A: 
- Runtime: [Java, Python]
- Framework: [Spring, Django]
- Database: [MySQL, PostgreSQL]
- Integration: [REST, GraphQL]
- Storage: [S3]

Application B:
- Runtime: [Java, Node.js]
- Framework: [Spring, Express]
- Database: [MySQL, MongoDB]
- Integration: [REST, gRPC]
- Storage: [S3, Redis]

Calculation:
- Runtime: |{Java}| / |{Java, Python, Node.js}| = 1/3 = 0.33
- Framework: |{Spring}| / |{Spring, Django, Express}| = 1/3 = 0.33
- Database: |{MySQL}| / |{MySQL, PostgreSQL, MongoDB}| = 1/3 = 0.33
- Integration: |{REST}| / |{REST, GraphQL, gRPC}| = 1/3 = 0.33
- Storage: |{S3}| / |{S3, Redis}| = 1/2 = 0.50

Final Score: (0.40 × 0.33) + (0.30 × 0.33) + (0.20 × 0.33) + (0.07 × 0.33) + (0.03 × 0.50)
           = 0.132 + 0.099 + 0.066 + 0.023 + 0.015 = 0.335
```

#### Key Differences from Component Similarity

- **Aggregation Level**: Application-level vs. component-level analysis
- **Weight Distribution**: Higher emphasis on runtime (40% vs 25%)
- **Scope**: Considers entire application technology footprint
- **Use Case**: Modernization planning vs. architectural analysis

#### Scalability Strategy

- **Small datasets** (< 1000 applications): Direct processing
- **Large datasets**: Partitioned processing with map-reduce pattern
- **Memory**: Optimized for application-level aggregation
- **Storage**: Only meaningful similarities (> 0.1) stored

---

## Component Similarity Analysis

### Algorithm: Weighted Jaccard-Binary Hybrid Similarity

**Purpose**: Identify similar software components based on their technology stack and architectural characteristics.

**Implementation**: `infrastructure/lambda/component-similarity/process-small-dataset/index.py`

**Runtime**: Python 3.9 (Lambda function)

**Orchestration**: AWS Step Functions - `app-modex-comp-sim-analysis-{projectId}`
- **Partition Lambda** (Node.js 22.x): `app-modex-comp-partition-{projectId}`
- **Process Lambda** (Python 3.9): `app-modex-comp-process-{projectId}` (Map state, max 50 concurrent)
- **Aggregate Lambda** (Node.js 22.x): `app-modex-comp-aggregate-{projectId}`

#### Algorithm Overview

The component similarity algorithm uses a multi-dimensional weighted approach that combines exact matching for core technologies with Jaccard similarity for technology sets.

#### Similarity Dimensions & Weights

| Dimension | Weight | Method | Description |
|-----------|--------|--------|-------------|
| Runtime | 25% | Exact Match | Programming language/runtime (Java, Python, etc.) |
| Framework | 25% | Exact Match | Application framework (Spring, Django, etc.) |
| Databases | 20% | Jaccard Similarity | Database technologies used |
| Integrations | 15% | Jaccard Similarity | External service integrations |
| Storages | 15% | Jaccard Similarity | Storage technologies used |

#### Mathematical Formula

```
ComponentSimilarity(A, B) = Σ(weight_i × similarity_i(A, B))

Where:
- similarity_runtime(A, B) = 1 if A.runtime == B.runtime, else 0
- similarity_framework(A, B) = 1 if A.framework == B.framework, else 0
- similarity_databases(A, B) = Jaccard(A.databases, B.databases)
- similarity_integrations(A, B) = Jaccard(A.integrations, B.integrations)
- similarity_storages(A, B) = Jaccard(A.storages, B.storages)
```

#### Jaccard Similarity Formula

```
Jaccard(A, B) = |A ∩ B| / |A ∪ B|

Where:
- A ∩ B = intersection (common technologies)
- A ∪ B = union (all unique technologies)
- Result range: [0, 1]
```

#### Processing Pipeline

1. **Data Filtering**: Apply user-specified filters (application, component type)
2. **Similarity Matrix**: Calculate pairwise similarities O(n²)
3. **Clustering**: Group components above threshold (default: 0.7)
4. **Pattern Detection**: Find repeated technology combinations
5. **Storage**: Store results in DynamoDB with 30-day TTL

#### Clustering Algorithm

- **Method**: Threshold-based clustering (not k-means)
- **Threshold**: Default 0.7 (configurable)
- **Approach**: Single-linkage clustering
- **Output**: Components grouped by similarity score

#### Scalability Strategy

- **Small datasets** (< 1000 components): Direct processing
- **Large datasets**: Partitioned processing with map-reduce pattern
- **Memory**: Up to 3008MB for processing functions
- **Timeout**: 15 minutes per processing step

#### Example Calculation

```
Component A: {Runtime: Java, Framework: Spring, Databases: [MySQL, Redis]}
Component B: {Runtime: Java, Framework: Spring, Databases: [MySQL, PostgreSQL]}

Calculation:
- Runtime similarity: 1.0 (exact match)
- Framework similarity: 1.0 (exact match)  
- Database similarity: |{MySQL}| / |{MySQL, Redis, PostgreSQL}| = 1/3 = 0.33

Final score: (0.25 × 1.0) + (0.25 × 1.0) + (0.20 × 0.33) = 0.566
```

#### Configuration Options

- **Minimum Similarity Score**: Threshold for clustering (default: 0.7)
- **Include Dimensions**: Toggle individual dimensions on/off
- **Application Filter**: Limit analysis to specific applications
- **Component Type Filter**: Filter by runtime/technology type

---

## Pilot Identification Analysis

### Algorithm: Three-Stage AI-Enhanced Pilot Identification

**Purpose**: Identify ideal pilot candidates for modernization using a revolutionary hybrid approach that combines rule-based algorithmic scoring with AI-enhanced contextual analysis to provide comprehensive, explainable recommendations.

**Innovation**: Unlike traditional single-method approaches, this algorithm produces three distinct result sets that can be compared and analyzed independently, providing both the consistency of algorithmic scoring and the nuanced insights of generative AI.

**Implementation**: 
- **Stage 1 - Rule-Based Scoring**: `infrastructure/lambda/project-specific/pilot-process/index.py` (Python 3.9)
- **Stage 2 - AI Enhancement**: `infrastructure/lambda/global/pilot-identification-async/ai-enhance-scores/index.js` (Node.js 22.x)
- **Stage 3 - Score Consolidation**: `infrastructure/lambda/global/pilot-identification-async/combine-scores/index.js` (Node.js 22.x)
- **Context Gathering**: `infrastructure/lambda/global/pilot-identification-async/gather-context-data/index.js` (Node.js 22.x)
- **Orchestration**: AWS Step Functions - `app-modex-pilot-analysis-{projectId}` (defined in `infrastructure/stepfunctions/project-specific/pilot-analysis.json`)

**Bedrock Integration**: Direct model invocation using BedrockRuntimeClient and InvokeModelCommand
- **Model**: Claude 3.7 Sonnet (anthropic.claude-3-7-sonnet-20250219-v1:0)
- **Prompt Management**: DynamoDB table `app-modex-prompt-templates` with versioning and 1-hour caching via `app-modex-shared` module
- **Guardrails**: Optional Bedrock Guardrails integration for content filtering

#### Algorithm Overview

The pilot identification algorithm uses a revolutionary three-stage approach that combines deterministic rule-based scoring with AI-powered contextual analysis. This hybrid methodology provides both the consistency of algorithmic scoring and the nuanced insights of generative AI, resulting in more accurate and explainable pilot recommendations.

**Key Innovation**: Unlike traditional single-method approaches, this algorithm produces three distinct result sets:
1. **Rule-Based Results**: Pure algorithmic scoring for consistency and auditability
2. **AI-Enhanced Results**: Contextually-aware scores incorporating organizational factors
3. **Consolidated Results**: Weighted combination optimized by AI confidence levels

#### Three-Stage Processing Architecture

**Stage 1: Rule-Based Algorithmic Scoring**
- Deterministic multi-criteria evaluation with configurable weights
- Sophisticated scoring logic with technology modernity assessment
- Complexity penalties and team capability alignment
- Fast processing (< 1 second per application)
- Provides baseline scores for comparison

**Stage 2: AI-Enhanced Contextual Analysis**
- Amazon Bedrock (Claude 3.7 Sonnet) direct model invocation
- Incorporates organizational context (skills, technology vision, similarities)
- Adjusts scores based on team capabilities and strategic alignment
- Provides natural language insights and recommendations
- Parallel processing with controlled concurrency (10 concurrent partitions, 10 apps per partition)
- Exponential backoff retry logic with 30-second timeout per request

**Stage 3: Score Consolidation**
- Intelligent weighted combination of algorithmic and AI scores
- AI confidence-based weighting (higher confidence = more AI weight)
- Produces final recommendations with full transparency
- Tracks score differences and agreement levels
- Stores all three result types independently in DynamoDB

#### Stage 1: Rule-Based Scoring Dimensions & Configurable Weights

**Default Weight Configuration:**
```python
weights = {
    'businessDriver': 30,      # Business alignment and strategic value
    'compellingEvent': 25,     # Urgency and timing factors
    'feasibility': 25,         # Technical feasibility and complexity
    'impact': 20               # User base and organizational impact
}
```

**Additional Parameters:**
- **Risk Tolerance** (0-100): Higher values favor riskier applications with higher potential
- **Team Capabilities**: List of team skills that influence feasibility scoring

#### Detailed Scoring Components

**1. Business Driver Scoring (Weighted by businessDriver %)**

Base criticality assessment:
```python
criticality = application.criticality.lower()
if 'high' in criticality: business_score = 25
elif 'medium' in criticality: business_score = 18
else: business_score = 10
```

Strategic alignment bonuses (up to +10 points):
- **Cost Optimization**: +3 if underutilized (CPU/Memory < 30%)
- **Agility**: +2 for modern runtimes (Node.js, Python), +2 for microservices/APIs
- **Innovation**: +3 for customer-facing or platform applications
- **Compliance**: +3 for legal/compliance/audit applications

Maximum: 30 points (before weight application)

**2. Technical Feasibility Scoring (Weighted by feasibility %)**

Technology modernity assessment (0-12 points):
```python
if 'node' in runtime or 'python' in runtime:
    modernity_score = 12  # Modern, cloud-friendly
elif 'java' in runtime:
    if '17' in runtime or '21' in runtime:
        modernity_score = 10  # Modern Java
    else:
        modernity_score = 7   # Older Java
elif '.net' in runtime or 'dotnet' in runtime:
    if 'core' in runtime:
        modernity_score = 10  # .NET Core
    else:
        modernity_score = 6   # .NET Framework
else:
    modernity_score = 4  # Legacy or unknown
```

Complexity penalty (0-6 points, subtracted):
```python
total_components = count(runtimes, frameworks, databases, integrations, storages)
if total_components <= 3: complexity_penalty = 0   # Very simple
elif total_components <= 6: complexity_penalty = 2  # Moderate
elif total_components <= 10: complexity_penalty = 4 # Complex
else: complexity_penalty = 6                        # Very complex
```

Team capability alignment (0-8 points):
```python
if 'cloud_architecture' in team_capabilities: capability_score += 3
if 'containerization' in team_capabilities: capability_score += 2
if 'microservices' in team_capabilities: capability_score += 2
if 'devops' in team_capabilities: capability_score += 1
```

Final technical score: `modernity_score - complexity_penalty + capability_score` (clamped 5-30)

**3. Risk Assessment (Implicit, adjusted by risk tolerance)**

Base risk score: 15 points

Environment risk:
```python
if 'production' in environment: base_risk_score -= 3  # Higher risk
elif 'dev' or 'test' in environment: base_risk_score += 3  # Lower risk
```

Utilization risk:
```python
if avg_cpu_util > 70 or avg_mem_util > 70:
    base_risk_score -= 4  # High utilization = risky
elif avg_cpu_util < 30 and avg_mem_util < 30:
    base_risk_score += 3  # Low utilization = safer
```

Complexity risk:
```python
if total_components > 10: base_risk_score -= 3  # Very complex = risky
elif total_components <= 3: base_risk_score += 2  # Simple = safer
```

Risk tolerance adjustment:
```python
risk_adjustment = (risk_tolerance - 50) / 10  # -5 to +5 adjustment
risk_score = base_risk_score + risk_adjustment  # Clamped 5-25
```

**4. User Base / Impact Scoring (Weighted by impact %)**

Base score: 10 points

Server count as scale proxy:
```python
num_servers = count(servers)
if num_servers >= 5: user_score += 5   # Large scale
elif num_servers >= 2: user_score += 3 # Medium scale
elif num_servers == 1: user_score += 1 # Small scale
```

Network traffic as usage proxy:
```python
total_network = avg_network_in + avg_network_out
if total_network > 1000: user_score += 4   # High traffic
elif total_network > 100: user_score += 2  # Medium traffic
```

Department importance:
```python
if 'sales' or 'customer' or 'revenue' in department:
    user_score += 2  # Revenue-generating departments
```

**Reusability Multiplier (Applied to Impact Score):**

The impact score is multiplied by a reusability factor based on the number of similar applications (using the user-configured similarity threshold, default 85%):

```python
similar_app_count = count_similar_applications(app, similarity_threshold)

if similar_app_count >= 10:
    reusability_multiplier = 1.5    # 50% boost for 10+ similar apps
elif similar_app_count >= 5:
    reusability_multiplier = 1.3    # 30% boost for 5-9 similar apps
elif similar_app_count >= 2:
    reusability_multiplier = 1.15   # 15% boost for 2-4 similar apps
elif similar_app_count == 1:
    reusability_multiplier = 1.05   # 5% boost for 1 similar app
else:
    reusability_multiplier = 0.7    # 30% penalty for 0 similar apps

final_impact_score = base_impact_score * reusability_multiplier
```

**Rationale**: Pilots with many similar applications provide greater ROI through pattern reuse and knowledge transfer. Applications with no similar applications are penalized as they offer limited reusability value, as the primary purpose of pilot identification is to find applications that can serve as templates for modernizing similar applications.

Maximum base score: 20 points (before reusability multiplier and weight application)
Maximum final score: 30 points (20 × 1.5 multiplier, before weight application)

**5. Compelling Events Scoring (Weighted by compellingEvent %)**

```python
event_score = 10 if criteria.events else 0  # Base score for having compelling events
```

#### Mathematical Formulas

**Stage 1: Rule-Based Algorithmic Score**
```
AlgorithmicScore(app) = (BusinessScore × W_business / 30) + 
                        (TechnicalScore × W_feasibility / 25) + 
                        RiskScore +
                        (ImpactScore × W_impact / 20) +
                        (EventScore × W_event / 25)

Where:
- W_business = weights['businessDriver'] (default: 30)
- W_feasibility = weights['feasibility'] (default: 25)
- W_impact = weights['impact'] (default: 20)
- W_event = weights['compellingEvent'] (default: 25)
- RiskScore is directly added (not weighted, adjusted by risk tolerance)
- Maximum total score = 100 points
```

**Stage 2: AI-Enhanced Score**
```
AIEnhancedScore(app) = BedrockInvoke(
    model_id = "anthropic.claude-3-7-sonnet-20250219-v1:0",
    system_prompt = prompt_template.systemPrompt,
    user_prompt = buildComprehensivePrompt(app, criteria, contextData),
    max_tokens = 2048,
    temperature = 0.3
)

Where context_data includes:
- Application similarity scores (top 10 similar applications)
- Component similarity patterns (technology clusters)
- Team skills inventory (current proficiency levels)
- Skill gaps analysis (training needs and severity)
- Technology vision alignment (strategic roadmap phases)
- Team weights (category priorities)

AI Output (JSON):
- aiEnhancedScore (0-100)
- confidence (0-100)
- strategicTechnologyAlignment (0-100)
- skillsAwareFeasibility (0-100)
- organizationalImpact (0-100)
- riskAssessment (0-100)
- strategicLearningValue (0-100)
- keyInsights (array of strings)
- recommendations (array of strings)
```

**Stage 3: Consolidated Score**
```
ConsolidatedScore(app) = (AlgorithmicScore × w_algo) + (AIEnhancedScore × w_ai)

Where:
- w_ai = AI confidence-based weight
  - If confidence > 70%: w_ai = 0.7, w_algo = 0.3
  - If confidence > 50%: w_ai = 0.5, w_algo = 0.5
  - Otherwise: w_ai = 0.3, w_algo = 0.7

- Score Difference = AIEnhancedScore - AlgorithmicScore
- Agreement Level = |Score Difference|
  - <= 10 points: "HIGH" agreement
  - <= 20 points: "MEDIUM" agreement
  - > 20 points: "LOW" agreement

- Recommendation Level:
  - >= 80: "HIGHLY_RECOMMENDED"
  - >= 65: "RECOMMENDED"
  - >= 50: "CONSIDER"
  - < 50: "NOT_RECOMMENDED"
```

#### Processing Pipeline (Step Functions Orchestration)

**Phase 1: Data Preparation**
1. **Update Process Status**: Set status to "PROCESSING" in DynamoDB
2. **Query Application Data**: Execute Athena query via `app-modex-athena-s3-wrapper` Lambda
3. **Partition Dataset**: Divide applications into batches of 50 for parallel rule-based scoring
4. **Process Partitions**: Map state with max 50 concurrent Lambda invocations
5. **Aggregate Results**: Collect and sort rule-based scores

**Phase 2: Context Gathering (Once per Analysis)**
Lambda: `app-modex-gather-context-data` (Node.js 22.x)
1. **Application Similarities**: Scan `app-modex-similarity-results-{projectId}` DynamoDB table
2. **Component Similarities**: Scan `app-modex-component-similarity-results-{projectId}` table
3. **Team Skills**: Scan `app-modex-skills-{projectId}` table
4. **Skill Expectations**: Scan `app-modex-skill-expectations-{projectId}` table
5. **Technology Vision**: Scan `app-modex-technology-vision-{projectId}` table
6. **Team Weights**: Scan `app-modex-team-weights-{projectId}` table
7. **Calculate Skill Gaps**: Compute gaps from skills and expectations

**Phase 3: AI Enhancement (Parallel Processing)**
1. **Create AI Partitions**: Divide top candidates into batches of 10 applications
2. **Process AI Partitions**: Map state with max 10 concurrent partitions
   - Lambda: `app-modex-ai-enhance-scores` (Node.js 22.x, 1024MB, 30s timeout)
   - Each partition processes 10 applications sequentially
   - Direct Bedrock model invocation per application
   - Exponential backoff retry (max 3 attempts)
   - Store AI-enhanced results immediately to DynamoDB
3. **Aggregate AI Results**: Flatten partition results into single array

**Phase 4: Score Consolidation**
Lambda: `app-modex-combine-scores` (Node.js 22.x)
1. **Flatten Partitions**: Combine all AI partition results
2. **Calculate Consolidated Scores**: Apply confidence-based weighting
3. **Store All Three Types**: Write RULE_BASED, AI_ENHANCED, CONSOLIDATED to DynamoDB
   - Table: `app-modex-pilot-results-{projectId}`
   - Composite key: `jobId` (partition key), `candidateId` (sort key)
   - candidateId format: `{applicationName}#{resultType}`
4. **Calculate Summary Statistics**: Average scores, top candidate, agreement metrics

**Phase 5: Ranking and Completion**
1. **Rank Candidates**: Lambda sorts and ranks all three result types independently
2. **Update Process Status**: Set status to "COMPLETED" in DynamoDB
3. **Return Results**: All three result sets available via API

**Error Handling:**
- AI enhancement failures skip to "SkipAIEnhancement" state
- Falls back to rule-based results only if AI fails
- Partial AI results supported (some apps enhanced, others not)
- All errors logged to CloudWatch with detailed context

#### Recommendation Thresholds

| Score Range | Recommendation | Description |
|-------------|----------------|-------------|
| 80-100 | Excellent pilot candidate | Highly recommended for pilot programs |
| 70-79 | Good pilot candidate | Recommended with confidence |
| 60-69 | Moderate pilot candidate | Consider with caution |
| 50-59 | Poor pilot candidate | Not recommended |
| 0-49 | Very poor pilot candidate | Avoid for pilot programs |

#### Example Calculation

```
Application: E-commerce Catalog Service
- Runtime: Java 17
- Framework: Spring Boot
- Databases: PostgreSQL, Redis
- Integrations: REST API, Kafka
- Storages: S3
- Criticality: Medium
- Environment: Production
- Servers: 3
- CPU Utilization: 45%
- Memory Utilization: 52%
- Network Traffic: 850 MB/day
- Department: Sales

User Criteria:
- Business Drivers: [cost_reduction, agility_improvement]
- Compelling Events: [end_of_support]
- Risk Tolerance: 60 (moderate-high)
- Team Capabilities: [cloud_architecture, containerization, devops]
- Weights: {businessDriver: 30, compellingEvent: 25, feasibility: 25, impact: 20}

Stage 1 - Rule-Based Scoring:

1. Business Driver Score (max 30):
   - Base criticality (medium): 18 points
   - Cost optimization bonus (moderate utilization): 0 points
   - Agility bonus (modern Java + microservices): +4 points
   - Total: 22 points
   - Weighted: (22 × 30) / 30 = 22 points

2. Technical Feasibility Score (max 25):
   - Technology modernity (Java 17): 10 points
   - Complexity penalty (5 components): -2 points
   - Team capability (cloud + containers + devops): +6 points
   - Total: 14 points (clamped to 5-30 range)
   - Weighted: (14 × 25) / 25 = 14 points

3. Risk Score (adjusted by tolerance):
   - Base risk: 15 points
   - Production environment: -3 points
   - Moderate utilization: 0 points
   - Moderate complexity: 0 points
   - Risk tolerance adjustment: (60 - 50) / 10 = +1 point
   - Total: 13 points (clamped to 5-25 range)

4. Impact Score (max 20):
   - Base: 10 points
   - Server count (3 servers): +3 points
   - Network traffic (850 MB): +2 points
   - Sales department: +2 points
   - Total: 17 points
   - Weighted: (17 × 20) / 20 = 17 points

5. Compelling Events Score (max 25):
   - Has compelling events: 10 points
   - Weighted: (10 × 25) / 25 = 10 points

Algorithmic Score: 22 + 14 + 13 + 17 + 10 = 76 points

Stage 2 - AI Enhancement:

Context Provided to Bedrock:
- Similar applications: 4 apps with 80%+ similarity
  - "Product Catalog API" (88% similar, successful migration)
  - "Inventory Service" (85% similar, successful migration)
  - "Order Management" (82% similar, in progress)
- Team skills: 
  - Java/Spring: Proficiency 4.2/5 (8 team members)
  - Kubernetes: Proficiency 3.5/5 (6 team members)
  - PostgreSQL: Proficiency 4.0/5 (5 team members)
- Technology vision: 
  - Java 17+ → Adopt phase (strategic priority)
  - Spring Boot → Adopt phase (strategic priority)
  - Kubernetes → Trial phase (learning opportunity)
- Skill gaps:
  - Kafka (moderate gap, 3 team members need training)
  - Redis (minor gap, 2 team members need training)

Bedrock Model Invocation:
- Model: anthropic.claude-3-7-sonnet-20250219-v1:0
- Temperature: 0.3
- Max tokens: 2048
- Timeout: 30 seconds

AI Analysis Output (JSON):
{
  "aiEnhancedScore": 82,
  "confidence": 88,
  "strategicTechnologyAlignment": 90,
  "skillsAwareFeasibility": 85,
  "organizationalImpact": 75,
  "riskAssessment": 80,
  "strategicLearningValue": 85,
  "keyInsights": [
    "Strong strategic alignment with technology vision (Java 17, Spring Boot in Adopt phase)",
    "Team has excellent Java/Spring expertise with 4.2/5 average proficiency",
    "Similar applications successfully migrated provide proven patterns",
    "Moderate Kafka skill gap manageable with targeted training",
    "Sales department application provides high business visibility"
  ],
  "recommendations": [
    "Highly recommended as pilot candidate",
    "Schedule Kafka training for 3 team members before migration",
    "Leverage patterns from Product Catalog API migration",
    "Consider as second pilot after simpler application to build Kubernetes confidence"
  ]
}

Stage 3 - Consolidation:

Inputs:
- Algorithmic Score: 76
- AI Enhanced Score: 82
- AI Confidence: 88%

Weights Calculation:
- AI confidence 88% > 70% → w_ai = 0.7, w_algo = 0.3

Consolidated Score:
- (76 × 0.3) + (82 × 0.7) = 22.8 + 57.4 = 80.2 ≈ 80 points

Score Analysis:
- Score Difference: 82 - 76 = 6 points
- Agreement Level: |6| <= 10 → "HIGH" agreement
- Recommendation: 80 >= 80 → "HIGHLY_RECOMMENDED"

Final Output:
{
  "applicationName": "E-commerce Catalog Service",
  "department": "Sales",
  "criticality": "Medium",
  "algorithmicScore": 76,
  "aiEnhancedScore": 82,
  "consolidatedScore": 80,
  "aiConfidence": 88,
  "aiWeight": 0.7,
  "algorithmicWeight": 0.3,
  "scoreDifference": 6,
  "agreementLevel": "HIGH",
  "recommendation": "HIGHLY_RECOMMENDED",
  "algorithmicBreakdown": {
    "business_driver": 22,
    "technical_feasibility": 14,
    "risk": 13,
    "user_base": 17,
    "compelling_events": 10
  },
  "aiInsights": {
    "strategicTechnologyAlignment": 90,
    "skillsAwareFeasibility": 85,
    "organizationalImpact": 75,
    "riskAssessment": 80,
    "strategicLearningValue": 85,
    "keyInsights": [...],
    "recommendations": [...]
  }
}
```

#### Advanced Features

**Three Result Sets for Comparison:**
- **Rule-Based**: Pure algorithmic scores for consistency and auditability
- **AI-Enhanced**: Context-aware scores with natural language insights
- **Consolidated**: Best-of-both-worlds recommendations with transparency

**AI Context Integration:**
- **Application Similarity**: Identifies related applications and migration patterns
- **Component Patterns**: Recognizes technology clusters and reuse opportunities
- **Team Skills**: Matches team capabilities with application requirements
- **Skill Gaps**: Identifies training needs and risk factors
- **Technology Vision**: Ensures strategic alignment with modernization goals
- **Team Capacity**: Considers resource availability and allocation

**Explainability & Transparency:**
- Detailed score breakdowns for all three stages
- Natural language insights from AI analysis
- Confidence levels and agreement metrics
- Score difference tracking for divergence analysis

**Fallback & Error Handling:**
- AI failures gracefully fall back to algorithmic scores
- Partial results supported (some apps AI-enhanced, others algorithmic only)
- Timeout protection (30s per AI request)
- Retry logic for transient failures

#### Scalability Strategy

**Parallel Processing Architecture:**
- **Rule-Based Partitioning**: 50 concurrent Lambda invocations for algorithmic scoring
- **AI Partitioning**: 10 concurrent partitions, each processing 10 applications sequentially
- **Total AI Concurrency**: Effectively 10 concurrent Bedrock API calls
- **Batch Sizes**: 
  - Rule-based: Up to 50 applications per partition
  - AI enhancement: Exactly 10 applications per partition
- **Processing Time Estimates**:
  - 100 applications: ~5 minutes (rule-based) + ~10 minutes (AI) = ~15 minutes total
  - 1000 applications: ~10 minutes (rule-based) + ~100 minutes (AI) = ~110 minutes total
  - 5000 applications: ~15 minutes (rule-based) + ~500 minutes (AI) = ~8.5 hours total

**Memory & Performance:**
- **Context Gathering**: 512MB, 2-minute timeout (once per analysis)
- **Rule-Based Scoring**: 512MB, 5-minute timeout per partition
- **AI Enhancement**: 1024MB, 30-second timeout per application (with retry)
- **Score Consolidation**: 512MB, 1-minute timeout
- **Storage**: Project-specific DynamoDB tables with composite keys (jobId + candidateId)

**Cost Optimization:**
- Context data gathered once and reused across all AI partitions
- Parallel processing reduces total execution time significantly
- Bedrock API calls use Claude 3.7 Sonnet (optimized for reasoning)
- Prompt templates cached for 1 hour via `app-modex-shared` module
- DynamoDB on-demand pricing for variable workloads
- Immediate storage of AI results prevents data loss on failures

**Bedrock Throttling Management:**
- Conservative concurrency (10 partitions) to stay within default quotas
- Exponential backoff retry with jitter (3 attempts, up to 30s delay)
- Graceful degradation: Falls back to rule-based scores on AI failures
- Timeout protection: 30-second limit per Bedrock invocation

#### Integration Points

- **Amazon Bedrock**: Claude 3.7 Sonnet for AI-enhanced analysis
- **Application Similarity**: Leverages similarity scores for context
- **Component Similarity**: Uses technology patterns for insights
- **Team Skills (Athena)**: Queries skills inventory for capability matching
- **Technology Vision (Athena)**: Retrieves strategic technology roadmap
- **DynamoDB**: Stores all three result types with metadata
- **Step Functions**: Orchestrates three-stage pipeline with error handling

---

**For a business-oriented perspective on how the Pilot Identification algorithm makes decisions and evaluates candidates, see [Appendix A: Pilot Identification - Functional Decision-Making Process](#appendix-a-pilot-identification---functional-decision-making-process).**

---

## Team Estimates Algorithm

### Algorithm: Resource Allocation with Similarity-Based Scaling

**Purpose**: Calculate resource allocation and time estimates for applications in a bucket based on pilot application characteristics, considering similarity scores, complexity factors, delivery modes, and parallelization constraints.

**Implementation**: `app-modex-ui/src/pages/planning/TeamEstimatePage.js`

#### Algorithm Overview

The team estimates algorithm uses a pilot application as a baseline to calculate resource requirements for similar applications in a bucket. It applies similarity-based scaling, complexity adjustments, delivery mode optimizations, and parallelization constraints to provide realistic resource estimates.

#### Core Components

**Base Resource Distribution** (based on modernization project analysis):
- **Developers**: 47%
- **DevOps Engineers**: 28% 
- **Architects**: 17%
- **QA/Testers**: 8%

**Complexity Factors**:
- XS (Very Simple): 0.5×
- S (Simple): 0.75×
- M (Medium): 1.0×
- L (Complex): 1.5×
- XL (Very Complex): 2.0×
- XXL (Extremely Complex): 2.5×

**Delivery Mode Multipliers**:

*Faster Mode (Velocity-Focused)*:
- Developers: 1.3×, DevOps: 1.2×, Architects: 1.1×, Testers: 1.25×
- Time Reduction: 15% (0.85× multiplier)

*Cheaper Mode (Cost-Focused)*:
- Developers: 0.8×, DevOps: 0.85×, Architects: 0.9×, Testers: 0.75×
- Time Extension: 25% (1.25× multiplier)

#### Mathematical Formula

```
Application Resource Calculation:

1. Base Effort = Pilot Effort × Similarity Factor × Complexity Factor
2. Adjusted Effort = Base Effort × Delivery Mode Time Factor
3. Role Resources = (Adjusted Effort × Role Distribution × Delivery Mode Multiplier) / Duration
4. Final Resources = Apply Parallelization Constraints(Role Resources)
```

#### Parallelization Constraints

**Developers**: `min(calculated, 6 + (calculated - 6) × 0.5)` - Optimal 1-6, diminishing returns after
**DevOps**: `min(calculated, 3 + (calculated - 3) × 0.3)` - Optimal 1-3, diminishing returns after  
**Architects**: `min(calculated, 2)` - Maximum 2 architects
**Testers**: `min(calculated, 3 + (calculated - 3) × 0.4)` - Optimal 1-3, diminishing returns after

#### Implementation Architecture

**On-Demand Calculation Strategy**:
- Individual application settings stored separately (complexity, delivery mode)
- Resources calculated when displayed, not pre-stored
- Eliminates state synchronization issues
- Provides immediate UI feedback

**Key Functions**:
- `calculateSingleApplicationResources(appName)`: O(1) calculation for specific application
- `calculateTimeRequired(appName)`: Lightweight time calculation
- `handleApplicationResourceChange()`: Updates individual app settings without mass recalculation

#### Example Calculation

```
Pilot: 4 Developers, 1 Architect, 2 Testers, 2 DevOps (9 total), 12 weeks, M complexity
Similar App: 85% similarity, L complexity, Faster mode

1. Base Effort = (9 × 12) × 0.85 × 1.5 = 137.7 person-weeks
2. Adjusted Effort = 137.7 × 0.85 = 117 person-weeks  
3. Role Resources:
   - Developers: (117 × 0.47 × 1.3) / 12 = 6.0
   - DevOps: (117 × 0.28 × 1.2) / 12 = 3.3 → 3 (constrained)
   - Architects: (117 × 0.17 × 1.1) / 12 = 1.8 → 2 (constrained)
   - Testers: (117 × 0.08 × 1.25) / 12 = 1.0
4. Time Required = 12 × 1.5 × 0.85 = 15.3 ≈ 16 weeks
```

#### User Experience Features

- **Progressive Disclosure**: Shows "---" until pilot data is complete
- **Real-time Updates**: Changes reflected immediately in UI
- **Individual Control**: Each application can have different complexity/delivery mode
- **Validation**: Ensures all pilot resources are specified before calculations

#### Technical Implementation Details

**State Management Strategy**:
```javascript
// Application-specific settings (preserved across calculations)
applicationResources = {
  "App1": {
    complexitySize: "L",
    deliveryMode: "Faster",
    // resources calculated on-demand, not stored
  },
  "App2": {
    complexitySize: "M", 
    deliveryMode: "Cheaper",
  }
}

// Global pilot settings (affect all applications)
pilotResources = {
  developers: 4, architects: 1, testers: 2, devops: 2,
  periodValue: 12, periodType: "weeks", complexitySize: "M"
}
```

**Performance Optimizations**:
1. **Lazy Calculation**: Resources calculated only when table cells render
2. **Memoization Ready**: Functions are pure and can be memoized if needed
3. **Minimal Re-renders**: Individual changes don't trigger full component re-renders
4. **Efficient State Updates**: Only affected application state is updated

**Error Handling**:
- **Missing Data**: Returns null/0 for incomplete calculations
- **Invalid Values**: Applies sensible defaults (minimum 1 person per role)
- **State Consistency**: Validates pilot resources before enabling calculations

**Quality Gates**:
- Minimum 1 person per role (except architects for very simple applications)
- Maximum team size should not exceed 12-15 people (communication overhead)
- Architect-to-developer ratio should not exceed 1:8

#### Algorithm Evolution

**v1.2 - On-Demand Calculation (Current - October 2025)**:
- **Problem Solved**: Dropdown reset issues due to timing conflicts
- **Solution**: On-demand calculation eliminates state synchronization issues
- **Benefits**: Immediate UI feedback, no mass recalculations, better performance

**v1.1 - Individual Application Controls (August 2025)**:
- Added per-application complexity and delivery mode settings
- Implemented parallelization constraints

**v1.0 - Initial Implementation (July 2025)**:
- Basic resource distribution algorithm
- Fixed complexity and delivery mode settings

#### Performance Characteristics

- **Calculation Complexity**: O(1) per application
- **Memory Usage**: Minimal - no pre-calculated storage
- **UI Responsiveness**: Immediate feedback on changes
- **Scalability**: Efficient for any number of applications in bucket

---

## Skill Importance Scoring Algorithm

### Algorithm: AI-Based Skill Importance Assessment

**Purpose**: Generate intelligent skill importance scores (0-100) that reflect strategic priorities and team weights, replacing the legacy linear formula with AI-powered contextual analysis.

**Implementation**: 
- **Step Function**: `app-modex-skill-importance-{projectId}`
- **Orchestrator Lambda**: `infrastructure/lambda/project-specific/skill-importance-orchestrator/index.js` (Node.js 22.x)
- **Scorer Lambda**: `infrastructure/lambda/project-specific/skill-importance-scorer/index.js` (Node.js 22.x)
- **AI Model**: Nova Lite (amazon.nova-lite-v1:0) via direct Bedrock Runtime API invocation
- **Prompt Management**: DynamoDB table `app-modex-prompt-templates` with versioning and 1-hour caching

**Bedrock Integration**: Direct model invocation using BedrockRuntimeClient and InvokeModelCommand
- **Concurrency**: Map state with max 10 concurrent team assessments
- **IAM Role**: Dedicated `app-modex-skill-importance-lambda-{projectId}` with Bedrock InvokeModel permissions

#### Algorithm Overview

The skill importance algorithm uses direct Amazon Bedrock model invocation (Nova Lite) to analyze team category weights and generate contextual importance scores for each skill. This replaces the legacy linear formula with AI-powered assessment that considers strategic priorities, team composition, and modernization goals.

#### Key Innovation

**Legacy Formula (Replaced)**:
```
Expected Proficiency = 2.0 + (weight_percentage / 100.0 × 3.0)
```
- Simple linear scaling
- No context consideration
- Same formula for all teams
- Limited to weight percentage

**New AI-Based Approach**:
```
Importance Score = AI_Analysis(skill, team_weights, team_context)
Expected Proficiency = 1.0 + (importance_score / 100.0 × 4.0)
```
- Contextual analysis
- Team-specific assessment
- Strategic alignment
- Confidence levels and rationale

#### Processing Pipeline

**Phase 1: Orchestration (Once per Team Weight Update)**
1. **Trigger**: Team category weights updated in DynamoDB
2. **Load Data**: Query team skills and weights from Athena
3. **Prepare Teams**: Create team objects with skills and weight context
4. **Invoke Step Function**: Start parallel processing workflow

**Phase 2: Parallel Scoring (Per Team)**
1. **Map State**: Process each team independently (max 10 concurrent)
2. **Bedrock Model Invocation**: Send team context to Nova Lite via InvokeModelCommand
3. **Generate Scores**: AI produces 0-100 importance scores
4. **Add Metadata**: Include confidence (0-100) and rationale
5. **Store to S3**: Write CSV file for team

**Phase 3: Storage & Availability**
1. **S3 Storage**: `s3://app-modex-data-{projectId}/data-processed/skill-importance-scores/{team-name}_scores.csv`
2. **File Strategy**: One file per team (overwrites on update)
3. **Athena Table**: `skill_importance_scores` table for querying
4. **Query Integration**: Skill gap queries (F7, F8, F9) use importance scores

#### AI Prompt Structure

The Bedrock model receives (via InvokeModelCommand):
- **Team Name**: Team identifier
- **Team Skills**: List of all skills with current proficiency levels
- **Category Weights**: Strategic priorities (e.g., Cloud: 30%, DevOps: 25%)
- **Context**: Modernization goals and strategic direction

The AI generates:
- **Importance Score** (0-100): How critical the skill is
- **Confidence** (0-100): How confident the AI is in the assessment
- **Rationale**: Natural language explanation

#### Scoring Methodology

**Importance Score Ranges**:
- **80-100**: Critical skills - essential for modernization success
- **60-79**: Important skills - significant impact on outcomes
- **40-59**: Moderate skills - useful but not critical
- **20-39**: Low importance - minimal impact
- **0-19**: Very low importance - negligible impact

**Confidence Levels**:
- **80-100%**: High confidence - strong evidence and clear alignment
- **60-79%**: Moderate confidence - reasonable evidence
- **40-59%**: Low confidence - limited evidence
- **Below 40%**: Very low confidence - uncertain assessment

#### Expected Proficiency Calculation

```python
# Convert AI importance score (0-100) to proficiency scale (1-5)
expected_proficiency = 1.0 + (importance_score / 100.0 * 4.0)

Examples:
- Importance 100 → Expected 5.0 (Expert level)
- Importance 75 → Expected 4.0 (Advanced level)
- Importance 50 → Expected 3.0 (Intermediate level)
- Importance 25 → Expected 2.0 (Beginner level)
- Importance 0 → Expected 1.0 (Minimal level)
```

#### Storage Strategy

**File Format** (CSV):
```csv
team,skill,importance_score,confidence,rationale
Platform Team,Kubernetes,95,90,"Critical for container orchestration..."
Platform Team,Docker,90,95,"Essential for containerization..."
Platform Team,Terraform,85,88,"Key for infrastructure as code..."
```

**File Management**:
- **One file per team**: Simplifies Athena queries
- **Overwrite on update**: Prevents duplicates
- **Efficient querying**: No need to filter by timestamp
- **30-day retention**: Automatic cleanup via S3 lifecycle

#### Integration with Skill Gap Analysis

**Athena Queries Updated**:
- **F7 - Team Skill Gaps**: Uses importance scores for gap prioritization
- **F8 - Skill Gap Heatmap**: Colors based on importance-weighted gaps
- **F9 - Critical Skill Gaps**: Filters by high-importance skills

**Gap Calculation**:
```sql
SELECT 
  team,
  skill,
  importance_score,
  expected_proficiency,
  actual_proficiency,
  (expected_proficiency - actual_proficiency) as gap,
  CASE 
    WHEN importance_score >= 80 THEN 'Critical'
    WHEN importance_score >= 60 THEN 'Important'
    WHEN importance_score >= 40 THEN 'Moderate'
    ELSE 'Low'
  END as priority
FROM skill_gaps
WHERE gap > 0
ORDER BY importance_score DESC, gap DESC
```

#### Performance Characteristics

- **Bedrock Model**: Nova Lite (cost-optimized)
- **Concurrency**: Max 10 concurrent team assessments
- **Processing Time**: ~5-10 seconds per team
- **Cost**: ~$0.01 per team assessment
- **Trigger**: Automatic on team weight updates
- **Scalability**: Efficient for 1-100 teams

#### IAM Permissions

**Dedicated Role**: `app-modex-skill-importance-lambda-{projectId}`

**Permissions**:
- **S3**: Read/write to project data bucket
- **Athena**: Execute queries and read results
- **Glue**: Access database and table metadata
- **Bedrock**: Invoke Agent for skill assessment
- **DynamoDB**: Read data sources and process tracking

#### Error Handling

- **Bedrock Throttling**: Exponential backoff with jitter
- **Invalid Responses**: Fallback to default importance (50)
- **Missing Data**: Skip teams with no skills
- **Timeout Protection**: 30-second limit per team
- **Retry Logic**: 3 attempts with increasing delays

#### Quality Assurance

- **Score Validation**: Ensures 0-100 range
- **Confidence Calibration**: Validates confidence levels
- **Rationale Check**: Ensures meaningful explanations
- **Consistency Monitoring**: Tracks score stability over time
- **User Feedback**: Allows manual score adjustments

---

## Notes

- **Lambda Runtimes**: 
  - Python algorithms: Python 3.9
  - Orchestration and AI integration: Node.js 22.x
  - All Lambda functions deployed via CDK
- **Step Functions**: 1 global (tech-stack-normalization) + 5 project-specific per project
- **Results Caching**: DynamoDB with appropriate TTL settings
- **Frontend Visualizations**: D3.js for interactive charts and analysis
- **Team Estimates**: React state management with on-demand calculations (client-side JavaScript)
- **AI Integration**: Direct Bedrock model invocation via BedrockRuntimeClient and InvokeModelCommand
  - Nova Lite for normalization and skill importance (cost-effective)
  - Claude 3.7 Sonnet for pilot analysis (contextual insights)
- **Prompt Management**: DynamoDB-based with versioning and 1-hour caching

#### AI Prompt Engineering

**Prompt Template Management:**
- **Storage**: DynamoDB table `app-modex-prompt-templates`
- **Template ID**: `pilot-analysis`
- **Model ID**: `anthropic.claude-3-7-sonnet-20250219-v1:0`
- **Caching**: 1-hour TTL via `app-modex-shared` module's `getPrompt()` function
- **Versioning**: Supports multiple versions per template
- **Runtime Updates**: Prompts can be updated without Lambda redeployment

**Prompt Structure:**
The AI enhancement uses a carefully crafted prompt that provides:
1. **System Prompt**: Defines AI role, output format, and scoring guidelines
2. **User Prompt Template**: Parameterized template with placeholders:
   - `${applicationName}`: Application being evaluated
   - `${technologies}`: Runtime and framework details
   - `${teamSkills}`: Current team proficiency levels
   - `${skillGaps}`: Identified training needs
   - `${strategicAlignment}`: Technology vision and roadmap
   - `${organizationalContext}`: Portfolio size and context
   - `${similarApplications}`: Top 10 similar applications with scores

**Prompt Design Principles:**
- **Structured Output**: JSON format for consistent parsing
- **Bounded Scoring**: Explicit 0-100 range with adjustment guidelines
- **Confidence Calibration**: Self-assessment of analysis confidence (0-100)
- **Multi-dimensional Insights**: Five scoring dimensions plus overall score
- **Insight Generation**: Natural language explanations for stakeholders
- **Recommendation Clarity**: Specific, actionable guidance
- **Context Integration**: Leverages all available organizational data

**Bedrock Invocation Parameters:**
```javascript
{
  modelId: "anthropic.claude-3-7-sonnet-20250219-v1:0",
  contentType: "application/json",
  accept: "application/json",
  guardrailIdentifier: process.env.BEDROCK_GUARDRAIL_ID,  // Optional
  guardrailVersion: process.env.BEDROCK_GUARDRAIL_VERSION || "DRAFT",
  body: JSON.stringify({
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
    max_tokens: 2048,
    temperature: 0.3  // Low temperature for consistent, focused analysis
  })
}
```

**Response Parsing:**
- Extracts JSON from model response (handles markdown code blocks)
- Validates required fields: `aiEnhancedScore`, `confidence`
- Validates score ranges (0-100)
- Extracts insights arrays and recommendation text
- Falls back to algorithmic score on parsing failures

**Quality Controls:**
- **Score Validation**: Ensures AI scores are within valid range (0-100)
- **Confidence Thresholds**: Weights AI input based on confidence levels
- **Fallback Logic**: Uses algorithmic score if AI response is invalid or times out
- **Timeout Protection**: 30-second limit per AI request with exponential backoff retry
- **Error Logging**: Comprehensive logging to CloudWatch for debugging and improvement
- **Agreement Tracking**: Monitors score divergence between algorithmic and AI methods

**Continuous Improvement:**
- Prompt templates versioned and tracked in DynamoDB
- AI response quality monitored through agreement metrics
- Feedback loop for prompt refinement based on user acceptance
- A/B testing capability for prompt variations (via version selection)
- Confidence calibration monitoring to ensure AI self-assessment accuracy

---

**Last Updated**: November 9, 2025


---

## Appendix A: Pilot Identification - Functional Decision-Making Process

### Purpose

This appendix provides a business-oriented perspective on how the Pilot Identification algorithm makes decisions about which applications are good pilot candidates. While the main algorithm section focuses on technical implementation, this appendix explains the functional reasoning and real-world decision scenarios.

### The Core Question

**"Which application should we modernize first to maximize success and learning?"**

The algorithm answers this by evaluating applications across multiple business and technical dimensions, then combining them intelligently.

---

### The Five Decision Factors

#### 1. Business Value - "Why does this matter to the business?"

**What it evaluates:**
- **Criticality**: How important is this application to business operations?
- **Strategic alignment**: Does it support our key business drivers?

**Real-world scenarios:**

**Scenario A: Cost Reduction Focus**
```
Application: Legacy Reporting System
- Criticality: Medium
- Current state: Running on expensive mainframe
- CPU utilization: 15% (severely underutilized)
- Business driver selected: Cost Reduction

Algorithm reasoning:
✓ Underutilized infrastructure = cost optimization opportunity (+3 points)
✓ Medium criticality = reasonable business value (18 points)
= Strong business case for modernization (21/30 points)
```

**Scenario B: Customer-Facing Innovation**
```
Application: Customer Portal
- Criticality: High
- Type: Customer-facing web application
- Business driver selected: Innovation, Agility

Algorithm reasoning:
✓ High criticality = critical to business (25 points)
✓ Customer-facing = innovation opportunity (+3 points)
✓ Modern runtime (Node.js) = agility bonus (+2 points)
= Excellent business value (30/30 points)
```

**The business question**: "Will modernizing this application deliver meaningful business outcomes?"

---

#### 2. Technical Feasibility - "Can we actually do this successfully?"

**What it evaluates:**
- **Technology modernity**: How modern is the current tech stack?
- **Complexity**: How complicated is the application?
- **Team readiness**: Does our team have the right skills?

**Real-world scenarios:**

**Scenario A: Modern, Simple Application (Ideal Pilot)**
```
Application: Notification Service
- Runtime: Node.js 18
- Framework: Express.js
- Components: 3 (Runtime, Framework, Database)
- Team skills: Strong Node.js expertise (4.5/5 proficiency)

Algorithm reasoning:
✓ Modern runtime (Node.js) = cloud-friendly (12 points)
✓ Low complexity (3 components) = no penalty (0 points)
✓ Team has cloud architecture + DevOps skills (+4 points)
= High feasibility (16/30 points - good for pilot)
```

**Scenario B: Legacy, Complex Application (Risky Pilot)**
```
Application: Core Banking System
- Runtime: COBOL on mainframe
- Framework: Legacy proprietary
- Components: 15+ (multiple databases, integrations, storage systems)
- Team skills: Limited mainframe experience (2/5 proficiency)

Algorithm reasoning:
✗ Legacy runtime (COBOL) = modernization challenge (4 points)
✗ High complexity (15+ components) = significant penalty (-6 points)
✗ Team lacks required skills (0 bonus points)
= Low feasibility (5/30 points - poor pilot choice)
```

**The business question**: "Is this a reasonable first step, or are we biting off more than we can chew?"

---

#### 3. Risk Assessment - "What could go wrong?"

**What it evaluates:**
- **Environment risk**: Production vs. non-production
- **Utilization risk**: Is it heavily used or idle?
- **Complexity risk**: How many moving parts?
- **Risk tolerance**: How much risk are we willing to accept?

**Real-world scenarios:**

**Scenario A: Low-Risk Pilot (Conservative Approach)**
```
Application: Internal Dev Tools Dashboard
- Environment: Development/Test
- CPU utilization: 20%
- Memory utilization: 25%
- Components: 4 (simple architecture)
- Risk tolerance setting: 40 (conservative)

Algorithm reasoning:
✓ Non-production environment = safer to experiment (+3 points)
✓ Low utilization = not business-critical (+3 points)
✓ Simple architecture = lower risk (+2 points)
✓ Conservative risk tolerance = favor safer options (-1 adjustment)
= Low risk profile (22/25 points - safe pilot)
```

**Scenario B: High-Risk Pilot (Aggressive Approach)**
```
Application: Payment Processing System
- Environment: Production
- CPU utilization: 85%
- Memory utilization: 90%
- Components: 12 (complex architecture)
- Risk tolerance setting: 80 (aggressive)

Algorithm reasoning:
✗ Production environment = higher stakes (-3 points)
✗ High utilization = business-critical (-4 points)
✗ Complex architecture = more risk (-3 points)
✓ Aggressive risk tolerance = willing to take chances (+3 adjustment)
= High risk profile (8/25 points - risky pilot)
```

**The business question**: "If something goes wrong during modernization, what's the blast radius?"

---

#### 4. Organizational Impact & Reusability - "What's the ripple effect?"

**What it evaluates:**
- **User base**: How many people/systems depend on this?
- **Scale**: How big is the deployment?
- **Department importance**: Is it revenue-generating?
- **Reusability**: How many similar applications can benefit?

**Real-world scenarios:**

**Scenario A: High Reusability (Excellent Pilot)**
```
Application: E-commerce Product Catalog
- Servers: 3
- Network traffic: High (1200 MB/day)
- Department: Sales (revenue-generating)
- Similar applications: 12 other catalog services (88% similar)

Algorithm reasoning:
✓ Multiple servers = significant scale (+3 points)
✓ High traffic = active usage (+4 points)
✓ Sales department = business-critical (+2 points)
✓ 12 similar apps = excellent reusability (1.5× multiplier)
= Base impact: 19 points × 1.5 = 28.5/30 points

Business value: "Modernize once, apply pattern to 12 other applications!"
```

**Scenario B: Low Reusability (Poor Pilot)**
```
Application: Custom HR Onboarding Tool
- Servers: 1
- Network traffic: Low (50 MB/day)
- Department: HR (support function)
- Similar applications: 0 (unique snowflake)

Algorithm reasoning:
✓ Single server = small scale (+1 point)
✗ Low traffic = limited usage (0 points)
✗ Support department = lower priority (0 points)
✗ No similar apps = no reusability (0.7× penalty)
= Base impact: 11 points × 0.7 = 7.7/30 points

Business value: "Limited learning transfer to other applications"
```

**The business question**: "If we learn how to modernize this, how many other applications benefit?"

---

#### 5. Compelling Events - "Why now?"

**What it evaluates:**
- **Urgency factors**: Are there time-sensitive drivers?
- **External pressures**: Compliance, end-of-support, capacity issues?

**Real-world scenarios:**

**Scenario A: Urgent Modernization**
```
Application: Legacy CRM System
- Compelling events selected:
  ✓ End of support (vendor discontinuing in 6 months)
  ✓ Compliance deadline (new regulations in 9 months)
  ✓ Capacity constraints (system at 95% capacity)

Algorithm reasoning:
✓ Multiple compelling events = high urgency (10 points)
= Strong time pressure (10/25 points)

Business value: "We MUST act now, not later"
```

**Scenario B: No Urgency**
```
Application: Internal Wiki
- Compelling events selected: None
- Current state: Working fine, no pressure

Algorithm reasoning:
✗ No compelling events = can wait (0 points)
= No time pressure (0/25 points)

Business value: "Nice to have, but not urgent"
```

**The business question**: "Do we have a forcing function that makes this modernization time-sensitive?"

---

### How the Algorithm Combines These Factors

#### Stage 1: Rule-Based Scoring (The Objective Foundation)

**Default weights** (customizable):
- Business Value: 30%
- Technical Feasibility: 25%
- Compelling Events: 25%
- Impact/Reusability: 20%
- Risk: Direct addition (adjusted by tolerance)

**Example calculation:**
```
Application: Customer Order API

1. Business Value: 22 points (weighted by 30/30) = 22 points
2. Technical Feasibility: 16 points (weighted by 25/25) = 16 points
3. Risk Score: 18 points (direct addition) = 18 points
4. Impact: 28 points (weighted by 20/20) = 28 points
5. Compelling Events: 10 points (weighted by 25/25) = 10 points

Algorithmic Score = 22 + 16 + 18 + 28 + 10 = 94 points
```

**Interpretation:**
- 80-100: Excellent pilot candidate
- 70-79: Good pilot candidate
- 60-69: Moderate pilot candidate
- 50-59: Poor pilot candidate
- 0-49: Very poor pilot candidate

---

#### Stage 2: AI Enhancement (The Contextual Intelligence)

**What AI adds that algorithms can't:**

**Example: Two applications with identical algorithmic scores (75 points)**

**Application A: Payment Gateway**
```
Algorithmic score: 75
Similar apps: 8 applications (all successfully migrated)
Team skills: Strong in required technologies
Technology vision: All technologies in "Adopt" phase
Skill gaps: Minor (Redis training for 2 people)

AI analysis:
✓ "Proven migration patterns from similar applications"
✓ "Team is well-prepared with 4.2/5 Java proficiency"
✓ "Strategic alignment with technology roadmap"
✓ "Minimal training investment needed"

AI Enhanced Score: 85 (boosted by positive context)
Confidence: 92% (high confidence in assessment)
```

**Application B: Inventory Management**
```
Algorithmic score: 75
Similar apps: 8 applications (3 failed migrations, 5 in progress)
Team skills: Gaps in required technologies
Technology vision: Mix of "Trial" and "Hold" technologies
Skill gaps: Significant (Kafka training for 8 people)

AI analysis:
✗ "Similar applications have struggled with migration"
✗ "Team lacks critical Kafka expertise (2.1/5 proficiency)"
✗ "Technology stack includes 'Hold' phase components"
✗ "Significant training investment required"

AI Enhanced Score: 62 (reduced by negative context)
Confidence: 88% (high confidence in assessment)
```

**The AI's value**: "These look the same on paper, but context reveals very different risk profiles"

---

#### Stage 3: Consolidated Scoring (The Best of Both Worlds)

**How it works:**

**High AI Confidence (>70%)**
```
Application: Customer Portal
Algorithmic Score: 76
AI Enhanced Score: 82
AI Confidence: 88%

Weights: 70% AI, 30% Algorithmic
Consolidated = (76 × 0.3) + (82 × 0.7) = 22.8 + 57.4 = 80.2

Score Difference: 6 points
Agreement: HIGH (both methods agree this is good)
Recommendation: HIGHLY_RECOMMENDED
```

**Low AI Confidence (<50%)**
```
Application: Legacy Mainframe App
Algorithmic Score: 45
AI Enhanced Score: 52
AI Confidence: 35%

Weights: 30% AI, 70% Algorithmic
Consolidated = (45 × 0.7) + (52 × 0.3) = 31.5 + 15.6 = 47.1

Score Difference: 7 points
Agreement: HIGH (both methods agree this is poor)
Recommendation: NOT_RECOMMENDED
```

**Divergent Scores (Interesting Cases)**
```
Application: Analytics Platform
Algorithmic Score: 68
AI Enhanced Score: 85
AI Confidence: 75%

Weights: 70% AI, 30% Algorithmic
Consolidated = (68 × 0.3) + (85 × 0.7) = 20.4 + 59.5 = 79.9

Score Difference: 17 points
Agreement: MEDIUM (AI sees something algorithms missed)
Recommendation: RECOMMENDED

AI Insight: "Strong strategic learning value - team will gain 
critical Kubernetes skills needed for 15 other applications"
```

---

### Real-World Decision Scenarios

#### Scenario 1: The Obvious Winner

```
Application: Notification Service
- Algorithmic: 92 points
- AI Enhanced: 94 points
- Consolidated: 93 points
- Agreement: HIGH

Decision: Clear pilot candidate
Rationale: All three methods agree - modern tech, simple, 
          team-ready, high reusability
```

#### Scenario 2: The Hidden Gem

```
Application: Reporting API
- Algorithmic: 65 points (moderate)
- AI Enhanced: 82 points (good)
- Consolidated: 76 points (good)
- Agreement: MEDIUM

AI Insight: "Despite moderate algorithmic score, this application 
            provides critical learning for 20 similar reporting 
            services. Team has all required skills. Strategic value 
            is much higher than metrics suggest."

Decision: Consider as pilot despite lower algorithmic score
Rationale: AI identified strategic value not captured by algorithm
```

#### Scenario 3: The Risky Proposition

```
Application: Core Transaction System
- Algorithmic: 78 points (good)
- AI Enhanced: 58 points (poor)
- Consolidated: 65 points (moderate)
- Agreement: LOW

AI Insight: "High algorithmic score driven by business criticality, 
            but team lacks critical skills (Kafka 2.1/5, Kubernetes 
            2.5/5). Similar applications have 60% failure rate. 
            Recommend building skills with simpler applications first."

Decision: Defer until team builds experience
Rationale: AI identified risks not visible in algorithmic scoring
```

#### Scenario 4: The Strategic Play

```
Application: Product Catalog Service
- Algorithmic: 88 points
- AI Enhanced: 91 points
- Consolidated: 90 points
- Agreement: HIGH
- Similar applications: 12 (all 85%+ similar)

Business case: 
"Modernize this one application, gain patterns and knowledge 
 to modernize 12 others. ROI multiplier of 13x on learning 
 investment."

Decision: Top pilot candidate
Rationale: High scores + massive reusability = clear winner
```

---

### The Decision Framework

**For each candidate, ask:**

1. **Business Value**: "Does this solve a real business problem?"
2. **Feasibility**: "Can we realistically succeed?"
3. **Risk**: "What's the downside if we fail?"
4. **Impact**: "How many other applications benefit?"
5. **Urgency**: "Do we have a deadline?"

**Then consider:**
- **Algorithmic score**: Objective, consistent baseline
- **AI insights**: Contextual factors and hidden risks/opportunities
- **Consolidated score**: Balanced recommendation

**Final decision criteria:**
- Score ≥ 80: Strong pilot candidate - proceed with confidence
- Score 65-79: Good candidate - review AI insights for concerns
- Score 50-64: Moderate candidate - consider if no better options
- Score < 50: Poor candidate - look for alternatives

---

### Key Takeaways

**The algorithm is designed to answer:**
1. "Which application gives us the best chance of success?" (Feasibility + Risk)
2. "Which application delivers the most business value?" (Business Value + Impact)
3. "Which application teaches us the most?" (Reusability + Strategic Learning)
4. "Which application do we need to do now?" (Compelling Events)

**The three-stage approach provides:**
- **Consistency**: Algorithmic scoring ensures objective baseline
- **Intelligence**: AI adds contextual awareness and strategic insights
- **Transparency**: All three methods visible for informed decisions
- **Flexibility**: Choose the scoring method that fits your decision-making style

**The goal isn't just to find "the highest score"** - it's to find the application that maximizes your chances of pilot success while delivering meaningful business outcomes and reusable learning for your modernization journey.

---

**Appendix Last Updated**: February 12, 2026
