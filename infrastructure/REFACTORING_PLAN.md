# Stack Dependency Refactoring Plan

## Goal
Eliminate circular dependency between Backend and API stacks by:
1. Backend stack exports Lambda ARNs
2. API stack imports Lambda ARNs and creates all API Gateway routes
3. Clean dependency chain: Data → Backend → API

## Steps

### Phase 1: Backend Stack - Add Lambda Exports (BEFORE API routes section)
Add CfnOutput for each Lambda function before the "Add API Gateway resources and methods" comment.

Lambda functions to export (33 total):
1. projectsFunction
2. processTrackingFunction
3. userSearchFunction
4. pilotInitiateFunction
5. pilotStatusFunction
6. pilotResultsFunction
7. pilotDeleteFunction
8. applicationBucketsFunction
9. tcoFunction
10. teamEstimatesFunction
11. athenaQueryFunction
12. teamWeightsFunction
13. stepFunctionApiFunction
14. exportInitiatorFunction
15. exportReaderFunction
16. automationStatusFunction
17. provisioningFunction
18. buildMonitorFunction
19. fileOperationsFunction
20. dataSourcesFunction
21. fileUploadFunction
22. compareWithAthenaFunction
23. roleMapperFunction
24. stepFunctionTriggerFunction
25. pilotIdentificationAsyncFunction
26. batchExtractorFunction
27. athenaLookupFunction
28. bedrockNormalizerFunction
29. mappingAggregatorFunction
30. statusTrackerFunction
31. errorHandlerFunction
32. metricsFunction
33. dlqProcessorFunction

Plus 6 inline Lambdas (defined within API routes section):
34. applicationSimilaritiesFunction
35. componentSimilaritiesFunction
36. pilotIdentificationFunction
37. pilotGatherContextFunction
38. pilotAIEnhanceFunction
39. pilotCombineScoresFunction

### Phase 2: Backend Stack - Remove API Routes Section
Remove everything from "// Add API Gateway resources and methods" to "// ===== LAMBDA PERMISSIONS FOR API GATEWAY INVOCATION ====="

### Phase 3: API Stack - Update Interface
Add lambda import to imports
Update interface to NOT need backendStack prop (we'll use Fn.importValue)

### Phase 4: API Stack - Add Lambda Imports
Import all 39 Lambda functions using Fn.importValue

### Phase 5: API Stack - Add Lambda Integrations
Create apigateway.LambdaIntegration for each imported Lambda

### Phase 6: API Stack - Add API Routes
Move all API Gateway route definitions from Backend to API stack

### Phase 7: Main App - Update Dependencies
Remove apiStack from Backend stack instantiation
Add apiStack.addDependency(backendStack)

## Current Status
- Backups created
- Starting Phase 1
