# App-ModEx User Guide

**Version 1.0 | December 2025**

## Welcome to App-ModEx

App-ModEx helps you plan and manage your application modernization projects. Think of it as your digital assistant for moving applications to the cloud or updating them to use newer technologies.

### What Can You Do With App-ModEx?

- **Collect Information**: Store details about your team's skills, applications, and technology
- **Get Insights**: See patterns and opportunities in your data through charts and reports
- **Find Similar Apps**: Discover which applications use similar technologies
- **Plan Projects**: Identify which applications to modernize first and estimate costs
- **Track Progress**: Monitor your modernization work as it happens

### Important: Privacy and Data Protection

**⚠️ Data Privacy Notice**

App-ModEx stores information that may be considered sensitive or confidential:

- **Application Names**: Names of your organization's applications
- **Team Names**: Names of teams and departments
- **Personnel Information**: Team member roles and skill levels
- **Technology Details**: Technologies and infrastructure used by your organization

**What This Means:**

1. **Compliance Considerations**: Depending on your organization's policies and regulations (GDPR, HIPAA, etc.), this data may require special handling
2. **Access Control**: Only share projects with authorized personnel
3. **Data Classification**: Treat project data according to your organization's data classification policies
4. **Naming Conventions**: Consider using generic or coded names instead of actual names if required by your security policies

**Best Practices:**

- Use generic application names (e.g., "Customer Portal" instead of actual product names) if required
- Use role titles instead of individual names (e.g., "Senior Developer" instead of "John Smith")
- Consult your security and compliance teams before uploading sensitive data
- Regularly review who has access to your projects
- Delete projects when they're no longer needed

**Data Storage:**

All data is stored in AWS services within your organization's AWS account. Your organization controls:
- Where data is stored (AWS region)
- Who can access it (IAM policies and Cognito)
- How long it's retained (lifecycle policies)
- Encryption settings (AWS-managed or customer-managed keys)

For questions about data handling and compliance, contact your IT security team.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Managing Projects](#managing-projects)
3. [Adding Your Data](#adding-your-data)
4. [Understanding Your Insights](#understanding-your-insights)
5. [Finding Similar Applications](#finding-similar-applications)
6. [Planning Your Modernization](#planning-your-modernization)
7. [Monitoring Progress](#monitoring-progress)
8. [Tips for Success](#tips-for-success)
9. [Common Questions](#common-questions)

---

## Getting Started

### What You Need

- A modern web browser (Chrome, Firefox, Safari, or Edge)
- Internet connection
- Login credentials from your administrator

### Logging In

1. Open the App-ModEx web address in your browser
2. Enter your username and password
3. Click **Sign In**
4. If it's your first time, you may need to create a new password

### Understanding the Screen

When you log in, you'll see:

**Top Bar**
- App-ModEx logo on the left
- Your current project name in the middle
- Your account menu on the right

**Left Sidebar** (can be hidden or shown)
- List of all sections you can visit
- Button to switch between projects
- Organized into groups: Data, Insights, Planning, etc.

**Main Area**
- This is where you'll do most of your work
- Shows tables, charts, and forms
- Click the info icon (ℹ️) in the top right to get help about the current page

**Right Panel** (optional)
- Opens when you click the info icon
- Shows tips and guidance for the current page
- Click the X to close it

### Moving Around

- Click items in the left sidebar to go to different pages
- Click **Switch Project** at the top of the sidebar to see all your projects
- The current page is highlighted in the sidebar
- Press ESC to close pop-up windows

---

## Managing Projects

### Viewing Your Projects

When you first log in, you'll see a list of all projects you can access. Each project shows:

- **Project name**: What the project is called
- **Who created it**: The project owner
- **When it was created**: The date it started
- **Who can access it**: Other people with permission
- **Status**: Whether it's ready to use

### Project Status Explained

- 🟢 **Active**: Ready to use - you can start working
- 🟡 **Provisioning**: Being set up - wait 5-10 minutes
- 🟡 **Deleting**: Being removed - wait a few minutes
- 🔴 **Failed**: Something went wrong - contact your administrator

### Creating a New Project

1. Click **Create Project** (top right)
2. Enter a **project name** (required) - make it descriptive
3. Add **notes** (optional) - explain what this project is for
4. Click **Create**
5. Wait 5-10 minutes for setup to complete
6. Refresh the page to see when it's ready

**Tip**: Choose a clear name like "Customer Portal Modernization" instead of "Project 1"

### Opening a Project

1. Find your project in the list
2. Click the **Select** button
3. You'll see the project overview page
4. The sidebar now shows all available sections

### Sharing a Project

Want to work with teammates? Here's how to share:

1. Click the **Share** icon (👥) next to your project
2. Type a teammate's name or email in the search box
3. Click on their name when it appears
4. Choose their permission level:
   - **Read-only**: They can view but not change anything
   - **Read/Write**: They can view and make changes
5. Click **Add User**
6. They'll now see the project in their list

**Note**: Only the project owner can share projects with others.

### Changing Someone's Permission

1. Click the **Share** icon (👥)
2. Find the person in the "Current Shared Users" list
3. Click **Remove** next to their name
4. Add them again with the new permission level

**Tip**: If you need to change from read-only to read/write (or vice versa), remove the user first, then add them back with the correct permission.

### Removing Someone's Access

1. Click the **Share** icon (👥)
2. Find the person in the "Current Shared Users" list
3. Click **Remove** next to their name
4. Confirm you want to remove them
5. They'll lose access immediately

### Deleting a Project

**⚠️ Warning**: This permanently removes everything - you cannot undo this!

1. Click the **Delete** icon (🗑️) next to the project
2. Read the warning carefully
3. Type the project name exactly as shown
4. Click **Delete**
5. Wait for deletion to complete (5-10 minutes)

**Who can delete**: Only people with write permission, and only if the project is Active or Failed.

---

## Adding Your Data

App-ModEx works with data you upload as CSV files (like Excel spreadsheets saved as CSV). Each section needs specific information.

### General Upload Steps

1. Go to any data page (Skills, Portfolio, etc.)
2. Scroll to the **Data Sources** section at the bottom
3. Click **Upload File**
4. Choose your CSV file
5. Review the preview to make sure it looks correct
6. Click **Upload**
7. Wait for processing to complete (check the Process Dashboard)

**Important**: Only people with write permission can upload or delete data.

### Team Skills

**What it's for**: Track what your team knows and how well they know it.

**What to include in your CSV file**:
- Team name (e.g., "Platform Team")
- Role (e.g., "Developer", "DevOps Engineer")
- Skill (e.g., "Java", "Kubernetes")
- Skill level (Beginner, Intermediate, Advanced, or Expert)

**Example**:
```
Team,Persona,Skill,Proficiency
Platform Team,DevOps Engineer,Kubernetes,Expert
Application Team,Developer,Java,Advanced
```

**What you'll see**: A table showing all skills organized by team and role. You can search, filter, and sort to find specific information.

### Technology Vision

**What it's for**: Define which technologies your organization wants to use.

**What to include in your CSV file**:
- Category (e.g., "Frontend", "Backend", "Database")
- Technology name (e.g., "React", "PostgreSQL")
- Phase (Adopt, Trial, Assess, or Hold)
- Why you chose this phase

**Phases explained**:
- **Adopt**: Use this - it's proven and recommended
- **Trial**: Try this - it's promising but still being tested
- **Assess**: Explore this - we're learning about it
- **Hold**: Avoid this - not recommended for new work

**Example**:
```
Domain,Technology,Phase,Description
Frontend,React,Adopt,Our standard for new web apps
Backend,Spring Boot,Adopt,Proven for building services
Database,MongoDB,Assess,Considering for future projects
Frontend,Angular,Hold,Legacy - no new projects
```

**What you'll see**: A radar chart showing technologies in rings (center = Adopt, outer = Hold) and a detailed table.

### Application Portfolio

**What it's for**: List all your applications and their importance.

**What to include in your CSV file**:
- Application name
- Which department owns it
- How critical it is (High, Medium, or Low)
- Number of users
- What it does

**Example**:
```
ApplicationName,BusinessUnit,Criticality,Users,Description
Customer Portal,Sales,High,5000,Website for customers
Internal CRM,Sales,Medium,200,Sales team tool
```

**What you'll see**: A table of all applications with color-coded criticality badges (Red = High, Orange = Medium, Blue = Low).

### Tech Stack

**What it's for**: Document what technologies each application uses.

**What to include in your CSV file**:
- Application name (must match Portfolio)
- Component type (Frontend, Backend, Database, etc.)
- Technology name (React, Java, PostgreSQL, etc.)
- Version number
- Any notes

**Example**:
```
ApplicationName,ComponentType,ComponentName,Version,Notes
Customer Portal,Frontend,React,18.2.0,Main framework
Customer Portal,Backend,Node.js,22.x,API server
Customer Portal,Database,PostgreSQL,14,Main database
```

**What you'll see**: A table showing all technology components for each application. This data powers the similarity analysis.

### Infrastructure

**What it's for**: Track the servers, databases, and storage your applications use.

**What to include in your CSV file**:
- Application name (must match Portfolio)
- Resource type (Compute, Database, Storage, etc.)
- Resource name or identifier
- Environment (Production, Staging, Development)
- Technical details

**Example**:
```
ApplicationName,ResourceType,ResourceName,Environment,Specifications
Customer Portal,Compute,Web Server,Production,4 CPU 16GB RAM
Customer Portal,Database,Main DB,Production,8 CPU 32GB RAM
```

**What you'll see**: A table of all infrastructure resources organized by application and environment.

### Utilization

**What it's for**: Track how much of your resources you're actually using.

**What to include in your CSV file**:
- Application name (must match Portfolio)
- Resource type
- What you're measuring (CPU, Memory, Storage, etc.)
- Average usage
- Peak usage
- Unit (%, GB, count, etc.)

**Example**:
```
ApplicationName,ResourceType,MetricName,AverageValue,PeakValue,Unit
Customer Portal,Compute,CPU Usage,45,78,%
Customer Portal,Compute,Memory Usage,62,85,%
```

**What you'll see**: A table showing resource usage. Low averages suggest you might be paying for more than you need.

### Managing Your Uploaded Files

In the **Data Sources** section on each page, you can:

- **View files**: See all files you've uploaded
- **Download**: Get a copy of any file
- **Delete**: Remove a file and its data
- **Check status**: See if processing is complete

**Tip**: Delete old files before uploading new versions to avoid duplicate data.

---

## Understanding Your Insights

Once you've uploaded your data, App-ModEx creates charts and reports to help you understand it.

### Team Analysis

**What it shows**: Overview of your teams, roles, and skills.

**What to look for**:
- Teams with few skills (may need training)
- Skills concentrated in one team (knowledge sharing opportunity)
- Team sizes and capacity

**How to use it**: Identify which teams are ready for modernization work and which need support.

### Skills Analysis

**What it shows**: A heatmap (colored grid) showing skill levels across teams with AI-enhanced importance scoring.

**How to read it**:
- Rows = Teams or roles
- Columns = Skills
- Colors = Skill level (darker = better)
- Hover over any cell to see details

**AI-Enhanced Skill Importance**:
- Each skill has an AI-generated importance score (0-100)
- Importance scores consider team weights and strategic priorities
- Higher importance = more critical for your modernization goals
- Scores include confidence levels and rationale
- Generated via direct Bedrock model invocation (Nova Lite)

**What to look for**:
- Light colors in high-importance skills = critical gaps (training needed)
- Dark colors in high-importance skills = strong capabilities (leverage these)
- Empty cells in high-importance skills = urgent hiring or training needs
- Low importance skills with gaps = lower priority for training

**How to use it**: Plan training programs or hiring to fill gaps in critical skills. Focus on high-importance skills first for maximum impact.

### Vision Analysis

**What it shows**: Your technology strategy visualized as a radar chart.

**How to read it**:
- Each quarter = a technology category (Frontend, Backend, etc.)
- Rings = adoption phases (center = Adopt, outer = Hold)
- Dots = individual technologies

**What to look for**:
- Technologies in "Hold" that you're still using heavily (technical debt)
- Categories with few "Adopt" technologies (need standards)
- Technologies ready to move from "Trial" to "Adopt"

**How to use it**: Align your modernization plans with your technology strategy.

### Tech Stack Analysis

**What it shows**: Pie charts showing which technologies are most common.

**How to read it**:
- Each slice = a different technology
- Size = how many applications use it
- Hover to see exact numbers

**What to look for**:
- Too many different technologies doing the same thing (consolidation opportunity)
- One technology used by most apps (good candidate for standardization)
- Technologies used by only one app (may not be worth maintaining)

**How to use it**: Identify opportunities to standardize and reduce complexity.

### Infrastructure Analysis

**What it shows**: Charts showing your infrastructure resources by type and environment.

**What to look for**:
- Many different resource types (complexity)
- Large non-production environments (cost opportunity)
- Old infrastructure patterns (modernization candidates)

**How to use it**: Find opportunities to simplify and modernize your infrastructure.

### Utilization Analysis

**What it shows**: How much of your resources you're actually using.

**What to look for**:
- **Low average usage** (below 30%): You're paying for more than you need
- **High peak usage** (above 80%): You might run out of capacity
- **Big gap between average and peak**: Consider auto-scaling

**How to use it**: Identify opportunities to reduce costs by right-sizing resources.

### Data Divergencies

**What it shows**: Mismatches and inconsistencies between your different data sources.

**Why it matters**: 
Inconsistent data leads to:
- Incomplete analysis results
- Missing applications in reports
- Inaccurate cost estimates
- Unreliable similarity calculations

Think of it as a data quality check - it helps you catch problems before they affect your planning.

**Types of divergencies**:

1. **Applications in Tech Stack but not in Portfolio**
   - You documented what technologies an application uses
   - But you didn't add the application to your portfolio list
   - Fix: Add the application to your Portfolio CSV file

2. **Applications in Portfolio but not in Tech Stack**
   - You listed an application in your portfolio
   - But you didn't document what technologies it uses
   - Fix: Add the application's technologies to your Tech Stack CSV file

3. **Applications in Infrastructure but not in Portfolio**
   - You documented servers/resources for an application
   - But the application isn't in your portfolio
   - Fix: Add the application to your Portfolio CSV file

4. **Mismatched application names**
   - Same application spelled differently across files
   - Example: "Customer Portal" vs "customer-portal" vs "Cust Portal"
   - Fix: Use the exact same name in all CSV files

5. **Missing required information**
   - Applications without criticality ratings
   - Components without version numbers
   - Resources without environment labels
   - Fix: Complete the missing fields in your CSV files

**How to read the page**:
- **Green badges**: No issues found
- **Yellow badges**: Minor issues (warnings)
- **Red badges**: Critical issues that need fixing
- Numbers show how many applications are affected

**Step-by-step resolution**:

1. **Check the page after every upload**
   - Go to Insights → Data Divergencies
   - Review all sections

2. **Start with Portfolio divergencies** (most important)
   - These affect everything else
   - Fix Portfolio issues first

3. **Fix name mismatches**
   - Download your CSV files
   - Search for the application name
   - Update to use the exact same spelling everywhere
   - Delete old data and re-upload

4. **Add missing data**
   - If an application is in Tech Stack but not Portfolio, add it to Portfolio
   - If an application is in Portfolio but not Tech Stack, add its technologies
   - Complete any missing required fields

5. **Re-check after fixing**
   - Upload your corrected files
   - Return to Data Divergencies page
   - Verify issues are resolved (green badges)

**Best practices**:
- Check this page after every data upload
- Fix divergencies before running analyses
- Use consistent naming from the start (saves time later)
- Keep a master list of application names to copy from
- Document why some applications might legitimately be in only one source

**Common questions**:

*Q: Why is an application showing in multiple sources but still flagged?*
A: The application name is probably spelled slightly differently. Check for spaces, dashes, or capitalization differences.

*Q: Should every application be in all four data sources?*
A: Not necessarily. But every application should at least be in Portfolio and Tech Stack. Infrastructure and Utilization are optional if you don't have that data yet.

*Q: Can I ignore these warnings?*
A: You can, but your analysis results will be incomplete or inaccurate. It's worth fixing them.

**How to use it**: Check this page after uploading data. Fix any issues before running analyses to ensure accurate results.

---

## Finding Similar Applications

App-ModEx uses AI to find applications that use similar technologies. This helps you group applications for modernization.

### Application Similarities

**What it shows**: Which applications have similar technology stacks.

**How it works**:
1. Analyzes all technologies used by each application
2. Compares them to find matches
3. Calculates a similarity score (0-100%)
4. Shows results in a colored grid

**How to read the grid**:
- Rows and columns = your applications
- Colors = similarity (darker = more similar)
- Hover to see the exact percentage
- Click to see detailed comparison

**Adjusting the threshold**:
- Use the slider to set minimum similarity
- Higher number = stricter matching (fewer results)
- Lower number = looser matching (more results)
- Default is 70%

**What to look for**:
- Groups of similar applications (modernize together)
- Applications very similar to a successful modernization (follow the same approach)
- Outliers with no similar apps (may need custom approach)

**How to use it**: Group similar applications to modernize them using the same pattern, saving time and money.

### Component Similarities

**What it shows**: Which technology components (like databases, frameworks, runtimes) are used in similar ways across different applications.

**How it works**:
1. Analyzes individual technology components (databases, frameworks, runtimes, integrations, storage)
2. Compares how they're used across all applications
3. Groups components that work together in similar patterns
4. Shows which technology combinations appear repeatedly

**What you'll see**:
- **Similarity Matrix**: A colored grid showing how similar each component is to others
- **Component Clusters**: Groups of components that are often used together
- **Repeated Patterns**: Common technology combinations that appear across multiple applications

**How to read the results**:
- Darker colors = more similar usage patterns
- Clusters show components that work well together
- Pattern frequency shows how many applications use the same combination

**What to look for**:
- **Common patterns**: Technology combinations used by many applications (good candidates for standardization)
- **Reusable components**: Pieces that can be shared across modernization projects
- **Standardization opportunities**: Technologies that should be used consistently
- **Outliers**: Unique technology combinations that may need special attention

**Practical examples**:
- If 10 applications use "Java + PostgreSQL + Redis", you can create a standard template
- If "Node.js + MongoDB" appears frequently, build reusable migration patterns
- If only one application uses a rare combination, it may need a custom approach

**How to use it**: 
- Create standard modernization templates for common patterns
- Build reusable components that work across similar applications
- Identify which applications can share the same migration approach
- Reduce costs by not reinventing the wheel for each application

---

## Planning Your Modernization

### Finding Your First Project (Pilot Identification)

**What it does**: Helps you choose the best application to modernize first using a revolutionary three-stage AI-enhanced approach.

**Why it matters**: Starting with the right application increases your chances of success and builds momentum.

**Three Analysis Stages**:
1. **Rule-Based**: Pure algorithmic scoring for consistency
2. **AI-Enhanced**: Context-aware analysis with organizational insights
3. **Consolidated**: Best-of-both-worlds recommendations (recommended)

#### Step 1: Choose Your Reasons

**Business Drivers** - Why you want to modernize:
- Save money
- Improve performance
- Handle more users
- Improve security
- Meet compliance requirements
- Reduce technical debt
- Enable innovation

**Compelling Events** - What's forcing you to act:
- Software support ending
- License renewal coming up
- Running out of capacity
- Security vulnerabilities
- New regulations
- Business growth
- Company merger or acquisition

Select all that apply to your situation.

#### Step 2: Adjust Settings (Optional)

**Team Experience**:
- Slide left if your team is new to modernization
- Slide right if your team has done this before
- Affects which applications are recommended

**Risk Tolerance**:
- Slide left if you want to play it safe
- Slide right if you're willing to take more risk
- Affects complexity of recommended applications

**What Matters Most**:
- **Business Value**: How much business impact matters
- **Technical Feasibility**: How much ease of implementation matters
- **Strategic Alignment**: How much fit with strategy matters
- Adjust the percentages (must total 100%)

#### Step 3: Find Candidates

1. Click **Find Candidates**
2. Wait 30-60 seconds for analysis (AI processing takes time)
3. Review results in three tabs

**Three Types of Results**:

1. **Consolidated** (⭐ Recommended - Start Here)
   - Intelligent combination of algorithmic and AI analysis
   - Weighted based on AI confidence levels
   - Most balanced and reliable recommendations
   - Shows agreement level between methods

2. **Rule-Based** (Algorithmic)
   - Pure calculation based on your criteria
   - Objective and consistent
   - Good for understanding the scoring logic
   - Transparent and auditable

3. **AI-Enhanced** (Contextual)
   - Considers organizational context and patterns
   - Incorporates team skills, technology vision, and similarities
   - Provides qualitative insights and recommendations
   - Natural language explanations

**How AI Enhancement Works**:
- Analyzes similar applications and their migration patterns
- Considers team skills and capability gaps
- Aligns with your technology vision and strategy
- Evaluates team capacity and resource availability
- Provides confidence scores for its recommendations

**Understanding Score Agreement**:
- **Strong Agreement** (< 10 points difference): Both methods align
- **Moderate Agreement** (10-20 points): Some differences in assessment
- **Significant Divergence** (> 20 points): Methods disagree - review carefully

#### Step 4: Review Candidates

Each candidate shows:
- **Application name**
- **Overall score** (0-100, higher is better)
- **Business value score**: Impact on your business
- **Technical feasibility score**: How easy to modernize
- **Strategic alignment score**: Fit with your technology vision
- **AI confidence** (AI-Enhanced and Consolidated only): How confident the AI is
- **Score agreement** (Consolidated only): How much the methods agree
- **Key details**: Users, criticality, complexity
- **Why it matches**: Your selected criteria it meets

**Understanding Scores**:
- 80-100: Excellent candidate
- 60-79: Good candidate
- 40-59: Moderate candidate
- Below 40: Challenging candidate

**Understanding AI Confidence**:
- 80-100%: High confidence - AI has strong contextual evidence
- 60-79%: Moderate confidence - AI has some contextual evidence
- Below 60%: Low confidence - Limited context available

#### Step 5: View Details

Click **View Details** on any candidate to see:
- **How the score was calculated**: Transparent breakdown of algorithmic scoring
- **AI insights** (AI-Enhanced and Consolidated): Qualitative analysis and contextual recommendations
- **Context considered** (AI-Enhanced and Consolidated): 
  - Similar applications and their outcomes
  - Team skills and capability matches
  - Technology vision alignment
  - Skill gaps and training needs
- **Technology stack**: All components
- **Similar applications**: Others that could follow the same path
- **Recommendations**: Suggested approach and next steps

**Comparing Result Types**:
- Use **Consolidated** for final decisions (most reliable)
- Check **Rule-Based** to understand the algorithmic logic
- Review **AI-Enhanced** for contextual insights and recommendations
- If scores diverge significantly, investigate why before deciding

#### Step 6: See Similar Applications

The **Similar Applications** table shows other applications that could be modernized the same way:
- Similarity score to the pilot
- Technology comparison
- Estimated effort

**Adjust the similarity slider** to see more or fewer applications.

#### Step 7: Create a Bucket

Found a good pilot? Click **Create Bucket with this Pilot** to:
- Group the pilot with similar applications
- Prepare for cost and resource estimates
- Move to the next planning step

### Organizing Applications (Application Buckets)

**What it does**: Groups similar applications together for planning.

**Why it matters**: Modernizing similar applications together is more efficient.

#### Creating a Bucket

1. Click **Create Bucket**
2. Enter a **name** (e.g., "Java Spring Boot Apps")
3. Select a **pilot application** (the reference application)
4. Set **similarity threshold** (how similar apps must be to include)
5. Review the applications that will be included
6. Click **Create Bucket**

**Tip**: Start with a higher threshold (80%+) for very similar apps, lower it if you need more applications.

#### Managing Buckets

- **View applications**: See all apps in a bucket
- **Edit**: Change name or similarity threshold
- **Delete**: Remove bucket (doesn't delete applications)

**Note**: Changing the similarity threshold automatically updates which applications are included.

### Estimating Costs (TCO Estimates)

**What it does**: Calculates how much it will cost to modernize applications in a bucket.

**How it works**: You enter costs for the pilot application, and the system estimates costs for similar applications.

#### Creating a Cost Estimate

1. Click **Create TCO Estimate**
2. Select a **bucket**
3. Enter costs for the **pilot application**:

**Development Costs** (one-time):
- **Assessment & Planning**: Discovery, design, planning work
- **Application Refactoring**: Actual modernization work
- **Testing & QA**: Testing effort
- **Training**: Team training on new technologies

**Infrastructure Costs** (monthly):
- **Cloud Infrastructure**: Servers, storage, networking
- **Licenses**: Software licenses and tools
- **Migration Tools**: Tools needed for migration

**Operational Costs** (monthly):
- **Support & Maintenance**: Ongoing support
- **Monitoring & Management**: Monitoring tools

4. Review **calculated costs** for all applications
5. Check the **cost summary**
6. Click **Create Estimate**

**How costs are calculated**:
- More similar applications cost less (closer to pilot cost)
- Less similar applications cost more (need more customization)
- Formula: Application Cost = Pilot Cost × (1 + (1 - Similarity Score))

**Example**:
- Pilot cost: $100,000
- 90% similar app: $110,000 (10% more)
- 70% similar app: $130,000 (30% more)

#### Understanding the Cost Summary

Shows totals across all applications:
- Total development costs
- Total infrastructure costs (monthly and yearly)
- Total operational costs (monthly and yearly)
- Grand total

**Tip**: Use this to build your business case and budget request.

### Estimating Resources (Team Estimates)

**What it does**: Calculates how many people and how much time you need.

**How it works**: You specify resources for the pilot, and the system estimates for similar applications.

#### Creating a Team Estimate

1. Click **Create Team Estimate**
2. Select a **bucket**
3. Enter **pilot application resources**:
   - Number of developers
   - Number of architects
   - Number of testers
   - Number of DevOps engineers

4. Set **pilot project details**:
   - **Complexity**: Low, Medium, or High
   - **Timeline**: How long (weeks or months)
   - **Delivery mode**:
     - **Faster**: More people, shorter time, higher cost
     - **Cheaper**: Fewer people, longer time, lower cost

5. **Customize individual applications** (optional):
   - Override complexity for specific apps
   - Choose delivery mode per app

6. **Select required skills**:
   - Choose skills needed for modernization
   - Add new skills if needed

7. Review **calculations**:
   - Total resources needed
   - Total time required
   - Resource breakdown by role

8. Click **Create Estimate**

**How resources are calculated**:
- Based on similarity to pilot
- Adjusted for complexity (Low = 20% less, High = 20% more)
- Adjusted for delivery mode (Faster = 30% more resources, 30% less time)
- Considers how many projects can run in parallel

**Understanding Delivery Modes**:
- **Faster**: Assign more people, finish sooner, costs more
- **Cheaper**: Assign fewer people, takes longer, costs less

**Tip**: Mix delivery modes - use "Faster" for critical apps, "Cheaper" for less urgent ones.

---

## Exporting Your Data

### Export Functionality

**What it does**: Export your analysis results to Excel or CSV formats for sharing with stakeholders or further analysis.

**How to access**: Navigate to the Export Data page from the sidebar.

**What you can export**:
- **Data Section**: Skills, portfolio, tech stack, infrastructure, utilization
- **Insights Section**: Skill gaps, tech stack analysis, infrastructure insights
- **Planning Section**: Pilot identification results, application buckets, TCO estimates

**Export Process**:
1. Go to Export Data page
2. Select the category you want to export
3. Choose the specific data type
4. Click **Generate Export**
5. Wait for processing (30 seconds - 2 minutes)
6. Download the file when ready

**Export History**:
- View all previous exports
- Download files again without regenerating
- See when exports were created
- Track export status (Completed, Processing, Failed)

**File Formats**:
- **Excel (.xlsx)**: Formatted with multiple sheets, charts, and styling
- **CSV (.csv)**: Simple comma-separated values for data analysis tools

**Tips**:
- Exports include all current data at the time of generation
- Large datasets may take longer to process
- Files are stored for 30 days, then automatically deleted
- You can regenerate exports anytime with updated data

---

## Monitoring Progress

### Process Dashboard

**What it shows**: All data processing activities in your project.

**How to access**: Click **Process Dashboard** in the sidebar or project overview.

**What you'll see**:
- List of all processing jobs
- Status of each job (Completed, Processing, Pending, Failed)
- Start and end times
- Duration

**Status meanings**:
- 🟢 **Completed**: Finished successfully
- 🟡 **Processing**: Currently running
- 🟡 **Pending**: Waiting to start
- 🔴 **Failed**: Something went wrong

**How to use it**:
1. Check after uploading files to ensure they processed correctly
2. Monitor active processes
3. Troubleshoot failed processes

**Filtering**:
- By date range
- By status
- By process type
- By search term

**Viewing details**:
1. Click the arrow next to any process
2. See detailed information and logs
3. For failed processes, see error messages

**Typical processing times**:
- File upload: 1-5 seconds
- Data processing: 30 seconds - 2 minutes
- Similarity analysis: 2-5 minutes
- Pilot identification: 30-60 seconds

**If something fails**:
1. Expand the failed process
2. Read the error message
3. Fix the issue in your data file
4. Delete the failed data source
5. Upload the corrected file

---

## Tips for Success

### Getting Started Right

**1. Start Small**
- Begin with one or two applications
- Get comfortable with the tool
- Expand as you learn

**2. Upload Data in Order**
- Portfolio first (list of applications)
- Tech Stack second (what they use)
- Infrastructure third (where they run)
- Utilization last (how much they use)

**3. Check Your Work**
- Visit the Data Divergencies page after uploading
- Fix any issues before running analyses
- Ensure application names match across all files

### Working with Data

**1. Keep Names Consistent**
- Use the exact same application names in all files
- "Customer Portal" and "customer-portal" are different
- Avoid special characters

**2. Use Clear Names**
- "Customer Portal" not "CP"
- "Sales CRM" not "App1"
- Future you will thank present you

**3. Document as You Go**
- Add notes to projects
- Add descriptions to data sources
- Explain your assumptions in estimates

**4. Keep Backups**
- Save copies of all CSV files
- Use version numbers (portfolio_v1.csv, portfolio_v2.csv)
- Document what changed between versions

### Running Analyses

**1. Complete Your Data First**
- Upload all data sections before analyzing
- More data = better insights
- Incomplete data = misleading results

**2. Experiment with Settings**
- Try different similarity thresholds
- Adjust pilot identification criteria
- Compare results

**3. Use Multiple Views**
- Check all three pilot identification result types
- Compare different buckets
- Look at data from multiple angles

**4. Start with Insights**
- Review insights before planning
- Understand your current state
- Identify patterns and opportunities

### Collaborating with Others

**1. Share Early**
- Add team members when you start
- Use read-only for stakeholders
- Use read/write for contributors

**2. Communicate Clearly**
- Use project notes to explain purpose
- Document assumptions in estimates
- Share insights with stakeholders

**3. Review Together**
- Schedule regular review sessions
- Get feedback on pilot selection
- Validate estimates with experts

### Keeping Things Running Smoothly

**1. Regular Updates**
- Update data quarterly or when things change
- Delete old data before uploading new
- Re-run analyses after updates

**2. Monitor Performance**
- Close unused browser tabs
- Use filters to reduce data displayed
- Clear browser cache if things slow down

**3. Stay Organized**
- Use clear project names
- Keep related applications in buckets
- Archive completed projects

---

## Common Questions

### About Projects

**Q: How long does it take to set up a new project?**
A: Usually 5-10 minutes. The system creates storage and processing resources for your project.

**Q: Can I rename a project?**
A: Not currently. Choose your name carefully when creating the project.

**Q: What happens if I delete a project?**
A: Everything is permanently deleted - all data, files, and analyses. This cannot be undone.

**Q: Can I recover a deleted project?**
A: No. Deletion is permanent. Make sure you really want to delete before confirming.

**Q: Why can't I select my project?**
A: The project must have "Active" status. If it's "Provisioning", wait a few more minutes and refresh.

### About Data

**Q: What file format should I use?**
A: CSV (Comma-Separated Values). You can export this from Excel using "Save As" → "CSV".

**Q: How large can my files be?**
A: Up to 50MB per file. If larger, split into multiple files.

**Q: What if I upload the wrong file?**
A: Delete it from the Data Sources section and upload the correct one.

**Q: Do I need to delete old data before uploading new?**
A: Yes, to avoid duplicates. Delete old data sources first, then upload new ones.

**Q: Why isn't my data showing up?**
A: Check the Process Dashboard. Processing can take 1-5 minutes. If it failed, you'll see an error message.

**Q: Can I edit data after uploading?**
A: No. You need to fix your CSV file and upload it again (after deleting the old one).

**Q: How do I export my data?**
A: Go to the Export Data page, select what you want to export, generate the export, and download when ready.

**Q: How long are exports stored?**
A: Export files are stored for 30 days, then automatically deleted. You can regenerate them anytime.

### About Analyses

**Q: Why did pilot identification return no results?**
A: Make sure you've uploaded Portfolio and Tech Stack data. Try adjusting your criteria or lowering the similarity threshold.

**Q: How accurate are the cost estimates?**
A: They're estimates based on similarity. Use them for planning, but validate with actual pilot experience.

**Q: Can I change estimates after creating them?**
A: Yes. Click the Edit button to modify any estimate.

**Q: What's the difference between the three pilot identification results?**
A: Consolidated (recommended) combines rule-based calculations with AI insights. Rule-based is pure math. AI-enhanced considers context and patterns.

**Q: How is similarity calculated?**
A: The system compares technology components across applications. More matching components = higher similarity.

**Q: What's the difference between the three pilot identification results?**
A: Consolidated combines algorithmic and AI analysis (recommended). Rule-based is pure math. AI-enhanced considers organizational context.

**Q: How does AI enhancement work?**
A: The AI analyzes your application in context of team skills, technology vision, and similar applications to provide nuanced recommendations.

**Q: What if AI and algorithmic scores disagree significantly?**
A: Review both analyses carefully. Significant divergence (>20 points) means the methods see different factors. Check the AI insights to understand why.

**Q: What are skill importance scores?**
A: AI-generated scores (0-100) that indicate how critical each skill is for your modernization goals, based on team weights and strategic priorities.

**Q: How are skill importance scores calculated?**
A: An AI model analyzes your team category weights and generates importance scores with confidence levels and rationale for each skill.

### About Permissions

**Q: Why can't I upload files?**
A: You need write permission. Ask the project owner to give you read/write access.

**Q: Why can't I share my project?**
A: Only project owners can share. If you didn't create the project, you can't share it.

**Q: Can I change someone's permission level?**
A: Yes, if you're the project owner. Remove them and add them back with the new permission level.

**Q: What's the difference between read-only and read/write?**
A: Read-only can view everything but can't change anything. Read/write can view and make changes.

### About Performance

**Q: Why is the application slow?**
A: Try closing other browser tabs, clearing your cache, or using filters to reduce displayed data.

**Q: Why aren't charts loading?**
A: Refresh the page. If that doesn't work, try a different browser or clear your cache.

**Q: The Process Dashboard isn't updating. What should I do?**
A: Manually refresh the page. Check your internet connection.

### Getting Help

**Q: Where can I find help on a specific page?**
A: Click the info icon (ℹ️) in the top right of any page for context-specific guidance.

**Q: What if I'm still stuck?**
A: Contact your system administrator. Provide:
- What you were trying to do
- Any error messages you saw
- What you've already tried
- Screenshots if helpful

**Q: Is there training available?**
A: Ask your administrator about training sessions or additional resources.

---

## Quick Reference: CSV File Formats

### Team Skills
```csv
Team,Persona,Skill,Proficiency
Platform Team,DevOps Engineer,Kubernetes,Expert
Application Team,Developer,Java,Advanced
```

### Technology Vision
```csv
Domain,Technology,Phase,Description
Frontend,React,Adopt,Our standard framework
Backend,Spring Boot,Adopt,Proven for services
```

### Application Portfolio
```csv
ApplicationName,BusinessUnit,Criticality,Users,Description
Customer Portal,Sales,High,5000,Customer website
Internal CRM,Sales,Medium,200,Sales tool
```

### Tech Stack
```csv
ApplicationName,ComponentType,ComponentName,Version,Notes
Customer Portal,Frontend,React,18.2.0,Main framework
Customer Portal,Backend,Node.js,22.x,API server
```

### Infrastructure
```csv
ApplicationName,ResourceType,ResourceName,Environment,Specifications
Customer Portal,Compute,Web Server,Production,4 CPU 16GB RAM
```

### Utilization
```csv
ApplicationName,ResourceType,MetricName,AverageValue,PeakValue,Unit
Customer Portal,Compute,CPU Usage,45,78,%
```

---

**Need Help?**

- Click the info icon (ℹ️) on any page for guidance
- Check the Process Dashboard for processing status
- Contact your administrator for technical support

**Remember**: Start small, check your data quality, and experiment with different settings to get the most value from App-ModEx.
