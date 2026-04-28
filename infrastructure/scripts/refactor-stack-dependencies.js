#!/usr/bin/env node

/**
 * Automated Stack Dependency Refactoring Script
 * 
 * This script refactors the Backend and API stacks to eliminate circular dependencies:
 * - Removes API stack dependency from Backend stack
 * - Adds Lambda function exports to Backend stack
 * - Moves all API Gateway route definitions from Backend to API stack
 * - Updates the main app file to establish correct dependency chain
 */

const fs = require('fs');
const path = require('path');

// File paths
const BACKEND_STACK_PATH = path.join(__dirname, '../lib/app-modex-backend-stack.ts');
const API_STACK_PATH = path.join(__dirname, '../lib/app-modex-api-stack.ts');
const MAIN_APP_PATH = path.join(__dirname, '../bin/app-modex-infrastructure.ts');

// Backup original files
function backupFile(filePath) {
  const backupPath = `${filePath}.backup.${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);
  console.log(`✅ Backed up: ${path.basename(filePath)} -> ${path.basename(backupPath)}`);
  return backupPath;
}

// Parse Lambda function definitions from Backend stack
function parseLambdaFunctions(backendContent) {
  const lambdaFunctions = [];
  
  // Regex to match Lambda function definitions
  const lambdaRegex = /const\s+(\w+Function)\s*=\s*new\s+lambda\.Function\(this,\s*'(\w+)',\s*\{[^}]*functionName:\s*'([^']+)'/g;
  
  let match;
  while ((match = lambdaRegex.exec(backendContent)) !== null) {
    lambdaFunctions.push({
      variableName: match[1],
      constructId: match[2],
      functionName: match[3]
    });
  }
  
  console.log(`📊 Found ${lambdaFunctions.length} Lambda functions`);
  return lambdaFunctions;
}

// Generate CfnOutput exports for Lambda functions
function generateLambdaExports(lambdaFunctions) {
  const exports = lambdaFunctions.map(fn => {
    const exportName = `AppModEx-Backend-${fn.constructId}Arn`;
    return `
    // Export ${fn.variableName} ARN
    new cdk.CfnOutput(this, '${fn.constructId}Arn', {
      value: ${fn.variableName}.functionArn,
      exportName: '${exportName}',
      description: 'ARN for ${fn.functionName} Lambda function',
    });`;
  }).join('\n');
  
  return exports;
}

// Extract API Gateway route definitions
function extractApiRoutes(backendContent) {
  // Find the section where API routes are defined
  const apiRoutesStart = backendContent.indexOf('// Add API Gateway resources and methods');
  const apiRoutesEnd = backendContent.indexOf('// ===== LAMBDA PERMISSIONS FOR API GATEWAY INVOCATION =====');
  
  if (apiRoutesStart === -1 || apiRoutesEnd === -1) {
    console.error('❌ Could not find API routes section');
    console.error(`   apiRoutesStart: ${apiRoutesStart}, apiRoutesEnd: ${apiRoutesEnd}`);
    return null;
  }
  
  const apiRoutesSection = backendContent.substring(apiRoutesStart, apiRoutesEnd);
  console.log(`📊 Extracted API routes section (${apiRoutesSection.split('\n').length} lines)`);
  
  return apiRoutesSection;
}

// Generate API stack imports for Lambda functions
function generateLambdaImports(lambdaFunctions) {
  const imports = lambdaFunctions.map(fn => {
    const exportName = `AppModEx-Backend-${fn.constructId}Arn`;
    return `
    // Import ${fn.variableName}
    const ${fn.variableName} = lambda.Function.fromFunctionArn(
      this,
      '${fn.constructId}',
      cdk.Fn.importValue('${exportName}')
    );`;
  }).join('\n');
  
  return imports;
}

// Generate Lambda integrations
function generateLambdaIntegrations(lambdaFunctions) {
  const integrations = lambdaFunctions.map(fn => {
    const integrationName = fn.variableName.replace('Function', 'Integration');
    return `    const ${integrationName} = new apigateway.LambdaIntegration(${fn.variableName});`;
  }).join('\n');
  
  return integrations;
}

// Update Backend stack
function updateBackendStack(backendContent, lambdaFunctions, apiRoutesSection) {
  console.log('\n🔧 Updating Backend Stack...');
  
  // 1. Remove apiStack from interface
  let updated = backendContent.replace(
    /export interface AppModExBackendStackProps extends cdk\.StackProps \{[^}]*apiStack: AppModExApiStack;[^}]*\}/s,
    `export interface AppModExBackendStackProps extends cdk.StackProps {
  environment: string;
  dataStack: AppModExDataStack;
}`
  );
  
  // 2. Remove apiStack from class properties
  updated = updated.replace(
    /private readonly apiStack: AppModExApiStack;/,
    ''
  );
  
  // 3. Remove apiStack from constructor destructuring
  updated = updated.replace(
    /const \{ environment, dataStack, apiStack \} = props;/,
    'const { environment, dataStack } = props;'
  );
  
  // 4. Remove apiStack assignment
  updated = updated.replace(
    /this\.apiStack = apiStack;/,
    ''
  );
  
  // 5. Remove api and authorizer getters
  updated = updated.replace(
    /\/\/ Re-export getters for backward compatibility\s+get api\(\) \{ return this\.apiStack\.api; \}\s+get authorizer\(\) \{ return this\.apiStack\.authorizer; \}/,
    ''
  );
  
  // 6. Remove API routes section
  updated = updated.replace(apiRoutesSection, '');
  
  // 7. Add Lambda exports at the end of constructor (before the last closing brace)
  // Find the comment about API URL output which is near the end
  const apiUrlComment = '// API URL output is in the API stack';
  const apiUrlIndex = updated.indexOf(apiUrlComment);
  
  if (apiUrlIndex === -1) {
    console.error('❌ Could not find insertion point for Lambda exports');
    return null;
  }
  
  const lambdaExports = generateLambdaExports(lambdaFunctions);
  
  // Insert before the API URL comment
  updated = updated.substring(0, apiUrlIndex) + 
            '\n    // ===== LAMBDA FUNCTION EXPORTS =====' + 
            lambdaExports + '\n\n    ' + 
            updated.substring(apiUrlIndex);
  
  console.log('✅ Backend stack updated');
  return updated;
}

// Update API stack
function updateApiStack(apiContent, lambdaFunctions, apiRoutesSection) {
  console.log('\n🔧 Updating API Stack...');
  
  // 1. Update interface to remove backendStack (we'll use imports instead)
  let updated = apiContent.replace(
    /export interface AppModExApiStackProps extends cdk\.StackProps \{[^}]*\}/s,
    `export interface AppModExApiStackProps extends cdk.StackProps {
  environment: string;
  userPool: cognito.UserPool;
}`
  );
  
  // 2. Add lambda import at the top
  if (!updated.includes("import * as lambda from 'aws-cdk-lib/aws-lambda'")) {
    updated = updated.replace(
      "import * as apigateway from 'aws-cdk-lib/aws-apigateway';",
      "import * as apigateway from 'aws-cdk-lib/aws-apigateway';\nimport * as lambda from 'aws-cdk-lib/aws-lambda';"
    );
  }
  
  // 3. Add Lambda imports and integrations after authorizer creation
  const lambdaImports = generateLambdaImports(lambdaFunctions);
  const lambdaIntegrations = generateLambdaIntegrations(lambdaFunctions);
  
  const authorizerSection = updated.indexOf('// Export outputs');
  if (authorizerSection === -1) {
    console.error('❌ Could not find export outputs section');
    return null;
  }
  
  // Clean up API routes section (remove this.apiStack references)
  let cleanedApiRoutes = apiRoutesSection
    .replace(/this\.apiStack\.api\./g, 'this.api.')
    .replace(/this\.apiStack\.authorizer/g, 'this.authorizer');
  
  // Insert Lambda imports, integrations, and routes before exports
  const insertion = `
    // ===== LAMBDA FUNCTION IMPORTS =====
${lambdaImports}

    // ===== LAMBDA INTEGRATIONS =====
${lambdaIntegrations}

    // ===== API GATEWAY ROUTES =====
${cleanedApiRoutes}
`;
  
  updated = updated.substring(0, authorizerSection) + insertion + '\n    ' + updated.substring(authorizerSection);
  
  console.log('✅ API stack updated');
  return updated;
}

// Update main app file
function updateMainApp(appContent) {
  console.log('\n🔧 Updating Main App...');
  
  // 1. Remove apiStack prop from backendStack
  let updated = appContent.replace(
    /const backendStack = new AppModExBackendStack\(app, `AppModEx-Backend`, \{[^}]*apiStack,[^}]*\}\);/s,
    `const backendStack = new AppModExBackendStack(app, \`AppModEx-Backend\`, {
  environment,
  description: 'App-ModEx Backend Stack (Lambda, SQS, Step Functions)',
  dataStack,
  env: {
    account: account,
    region: appmodexRegion,
  },
  tags: {
    Project: 'App-ModEx',
    Environment: environment,
    Component: 'Backend',
  }
});`
  );
  
  // 2. Update dependencies
  updated = updated.replace(
    /\/\/ Ensure proper deployment order[\s\S]*?\/\/ Frontend deploys independently/,
    `// Ensure proper deployment order
promptTemplatesStack.addDependency(applicationStack);
dataStack.addDependency(applicationStack);
backendStack.addDependency(dataStack);
apiStack.addDependency(dataStack);
apiStack.addDependency(backendStack);  // API stack now depends on Backend stack
// Frontend deploys independently`
  );
  
  console.log('✅ Main app updated');
  return updated;
}

// Main execution
async function main() {
  console.log('🚀 Starting Stack Dependency Refactoring\n');
  
  try {
    // Backup files
    console.log('📦 Creating backups...');
    backupFile(BACKEND_STACK_PATH);
    backupFile(API_STACK_PATH);
    backupFile(MAIN_APP_PATH);
    
    // Read files
    console.log('\n📖 Reading files...');
    const backendContent = fs.readFileSync(BACKEND_STACK_PATH, 'utf8');
    const apiContent = fs.readFileSync(API_STACK_PATH, 'utf8');
    const appContent = fs.readFileSync(MAIN_APP_PATH, 'utf8');
    
    // Parse Lambda functions
    console.log('\n🔍 Parsing Lambda functions...');
    const lambdaFunctions = parseLambdaFunctions(backendContent);
    
    // Extract API routes
    console.log('\n🔍 Extracting API routes...');
    const apiRoutesSection = extractApiRoutes(backendContent);
    if (!apiRoutesSection) {
      throw new Error('Failed to extract API routes');
    }
    
    // Update files
    const updatedBackend = updateBackendStack(backendContent, lambdaFunctions, apiRoutesSection);
    const updatedApi = updateApiStack(apiContent, lambdaFunctions, apiRoutesSection);
    const updatedApp = updateMainApp(appContent);
    
    if (!updatedBackend || !updatedApi || !updatedApp) {
      throw new Error('Failed to update one or more files');
    }
    
    // Write updated files
    console.log('\n💾 Writing updated files...');
    fs.writeFileSync(BACKEND_STACK_PATH, updatedBackend);
    fs.writeFileSync(API_STACK_PATH, updatedApi);
    fs.writeFileSync(MAIN_APP_PATH, updatedApp);
    
    console.log('\n✅ Refactoring completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - ${lambdaFunctions.length} Lambda functions exported from Backend stack`);
    console.log(`   - ${lambdaFunctions.length} Lambda functions imported in API stack`);
    console.log(`   - API routes moved from Backend to API stack`);
    console.log(`   - Dependency chain updated: Data → Backend → API`);
    console.log('\n⚠️  Next steps:');
    console.log('   1. Review the changes in the updated files');
    console.log('   2. Run: cd infrastructure && npm run build');
    console.log('   3. Fix any TypeScript compilation errors');
    console.log('   4. Deploy: ./scripts/deploy-backend.sh --profile gturrini --region eu-west-2');
    
  } catch (error) {
    console.error('\n❌ Error during refactoring:', error.message);
    console.error('\n🔄 Backup files created - you can restore them if needed');
    process.exit(1);
  }
}

main();
