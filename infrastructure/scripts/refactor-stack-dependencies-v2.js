#!/usr/bin/env node

/**
 * Automated Stack Dependency Refactoring Script V2
 * 
 * Improved version that handles:
 * - Inline Lambda function definitions
 * - All integration variables
 * - Proper main app updates
 * - Duplicate detection
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

// Parse Lambda function definitions from Backend stack (before API routes section)
function parseLambdaFunctions(backendContent) {
  const lambdaFunctions = [];
  const seen = new Set();
  
  // Find the API routes section start
  const apiRoutesStart = backendContent.indexOf('// Add API Gateway resources and methods');
  
  // Only parse Lambda functions BEFORE the API routes section
  const beforeApiRoutes = backendContent.substring(0, apiRoutesStart);
  
  // Regex to match Lambda function definitions
  const lambdaRegex = /const\s+(\w+Function)\s*=\s*new\s+lambda\.Function\(this,\s*'(\w+)',\s*\{[^}]*functionName:\s*'([^']+)'/g;
  
  let match;
  while ((match = lambdaRegex.exec(beforeApiRoutes)) !== null) {
    const variableName = match[1];
    if (!seen.has(variableName)) {
      seen.add(variableName);
      lambdaFunctions.push({
        variableName: variableName,
        constructId: match[2],
        functionName: match[3]
      });
    }
  }
  
  console.log(`📊 Found ${lambdaFunctions.length} Lambda functions (before API routes)`);
  return lambdaFunctions;
}

// Parse Lambda functions created WITHIN the API routes section
function parseInlineApiLambdas(apiRoutesSection) {
  const inlineLambdas = [];
  const seen = new Set();
  
  // Regex to match inline Lambda function definitions
  const lambdaRegex = /const\s+(\w+Function)\s*=\s*new\s+lambda\.Function\(this,\s*'(\w+)',\s*\{[^}]*functionName:\s*'([^']+)'/g;
  
  let match;
  while ((match = lambdaRegex.exec(apiRoutesSection)) !== null) {
    const variableName = match[1];
    if (!seen.has(variableName)) {
      seen.add(variableName);
      inlineLambdas.push({
        variableName: variableName,
        constructId: match[2],
        functionName: match[3]
      });
    }
  }
  
  console.log(`📊 Found ${inlineLambdas.length} inline Lambda functions (within API routes)`);
  return inlineLambdas;
}

// Extract the inline Lambda definitions from API routes section
function extractInlineLambdaDefinitions(apiRoutesSection, inlineLambdas) {
  const definitions = [];
  
  for (const lambda of inlineLambdas) {
    // Find the full Lambda definition
    const startPattern = `const ${lambda.variableName} = new lambda.Function(this, '${lambda.constructId}',`;
    const startIndex = apiRoutesSection.indexOf(startPattern);
    
    if (startIndex !== -1) {
      // Find the closing of this Lambda definition (look for the next '});')
      let braceCount = 0;
      let inFunction = false;
      let endIndex = startIndex;
      
      for (let i = startIndex; i < apiRoutesSection.length; i++) {
        if (apiRoutesSection[i] === '{') {
          braceCount++;
          inFunction = true;
        } else if (apiRoutesSection[i] === '}') {
          braceCount--;
          if (inFunction && braceCount === 0) {
            // Found the closing brace, now look for ');'
            if (apiRoutesSection.substring(i, i + 3) === '});') {
              endIndex = i + 3;
              break;
            }
          }
        }
      }
      
      const definition = apiRoutesSection.substring(startIndex, endIndex);
      definitions.push({
        lambda: lambda,
        definition: definition
      });
    }
  }
  
  return definitions;
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
  const apiRoutesStart = backendContent.indexOf('// Add API Gateway resources and methods');
  const apiRoutesEnd = backendContent.indexOf('// ===== LAMBDA PERMISSIONS FOR API GATEWAY INVOCATION =====');
  
  if (apiRoutesStart === -1 || apiRoutesEnd === -1) {
    console.error('❌ Could not find API routes section');
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
function updateBackendStack(backendContent, lambdaFunctions, apiRoutesSection, inlineLambdaDefinitions) {
  console.log('\n🔧 Updating Backend Stack...');
  
  let updated = backendContent;
  
  // 1. Remove apiStack from interface
  updated = updated.replace(
    /apiStack: AppModExApiStack;/g,
    ''
  );
  
  // 2. Remove apiStack from class properties
  updated = updated.replace(
    /private readonly apiStack: AppModExApiStack;\s*/g,
    ''
  );
  
  // 3. Remove apiStack from constructor destructuring
  updated = updated.replace(
    /const \{ environment, dataStack, apiStack \} = props;/,
    'const { environment, dataStack } = props;'
  );
  
  // 4. Remove apiStack assignment
  updated = updated.replace(
    /this\.apiStack = apiStack;\s*/g,
    ''
  );
  
  // 5. Remove api and authorizer getters
  updated = updated.replace(
    /\/\/ Re-export getters for backward compatibility\s+get api\(\) \{ return this\.apiStack\.api; \}\s+get authorizer\(\) \{ return this\.apiStack\.authorizer; \}\s*/g,
    ''
  );
  
  // 6. Remove inline Lambda definitions from API routes section
  for (const inlineDef of inlineLambdaDefinitions) {
    updated = updated.replace(inlineDef.definition, '');
  }
  
  // 7. Remove API routes section
  updated = updated.replace(apiRoutesSection, '');
  
  // 8. Remove references to inline Lambdas in the permissions section
  for (const inlineDef of inlineLambdaDefinitions) {
    const permissionPattern = new RegExp(
      `\\s*${inlineDef.lambda.variableName}\\.grantInvokeUrl\\(new iam\\.ServicePrincipal\\('apigateway\\.amazonaws\\.com'\\)\\);`,
      'g'
    );
    updated = updated.replace(permissionPattern, '');
  }
  
  // 9. Add Lambda exports before the API URL comment
  const apiUrlComment = '// API URL output is in the API stack';
  const apiUrlIndex = updated.indexOf(apiUrlComment);
  
  if (apiUrlIndex === -1) {
    console.error('❌ Could not find insertion point for Lambda exports');
    return null;
  }
  
  const allLambdas = [...lambdaFunctions, ...inlineLambdaDefinitions.map(d => d.lambda)];
  const lambdaExports = generateLambdaExports(allLambdas);
  
  updated = updated.substring(0, apiUrlIndex) + 
            '\n    // ===== LAMBDA FUNCTION EXPORTS =====' + 
            lambdaExports + '\n\n    ' + 
            updated.substring(apiUrlIndex);
  
  console.log('✅ Backend stack updated');
  return updated;
}

// Update API stack
function updateApiStack(apiContent, lambdaFunctions, apiRoutesSection, inlineLambdaDefinitions) {
  console.log('\n🔧 Updating API Stack...');
  
  let updated = apiContent;
  
  // 1. Add lambda import at the top if not present
  if (!updated.includes("import * as lambda from 'aws-cdk-lib/aws-lambda'")) {
    updated = updated.replace(
      "import * as apigateway from 'aws-cdk-lib/aws-apigateway';",
      "import * as apigateway from 'aws-cdk-lib/aws-apigateway';\nimport * as lambda from 'aws-cdk-lib/aws-lambda';"
    );
  }
  
  // 2. Clean up API routes section
  let cleanedApiRoutes = apiRoutesSection
    .replace(/this\.apiStack\.api\./g, 'this.api.')
    .replace(/this\.apiStack\.authorizer/g, 'this.authorizer');
  
  // 3. Remove inline Lambda definitions from the routes (they'll be imported instead)
  for (const inlineDef of inlineLambdaDefinitions) {
    cleanedApiRoutes = cleanedApiRoutes.replace(inlineDef.definition, '');
  }
  
  // 4. Generate imports for all Lambdas
  const allLambdas = [...lambdaFunctions, ...inlineLambdaDefinitions.map(d => d.lambda)];
  const lambdaImports = generateLambdaImports(allLambdas);
  const lambdaIntegrations = generateLambdaIntegrations(allLambdas);
  
  // 5. Insert Lambda imports, integrations, and routes before exports
  const authorizerSection = updated.indexOf('// Export outputs');
  if (authorizerSection === -1) {
    console.error('❌ Could not find export outputs section');
    return null;
  }
  
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
  
  let updated = appContent;
  
  // 1. Remove apiStack prop from backendStack instantiation
  // Match the entire backendStack creation block
  const backendStackPattern = /const backendStack = new AppModExBackendStack\(app, `AppModEx-Backend`, \{[\s\S]*?\}\);/;
  const match = updated.match(backendStackPattern);
  
  if (match) {
    const originalBlock = match[0];
    // Remove apiStack line
    const updatedBlock = originalBlock.replace(/\s*apiStack,?\s*/g, '\n  ');
    updated = updated.replace(originalBlock, updatedBlock);
  }
  
  // 2. Update dependencies - add apiStack dependency on backendStack
  const dependencyPattern = /\/\/ Ensure proper deployment order[\s\S]*?\/\/ Frontend deploys independently/;
  const dependencyMatch = updated.match(dependencyPattern);
  
  if (dependencyMatch) {
    const newDependencies = `// Ensure proper deployment order
promptTemplatesStack.addDependency(applicationStack);
dataStack.addDependency(applicationStack);
backendStack.addDependency(dataStack);
apiStack.addDependency(dataStack);
apiStack.addDependency(backendStack);  // API stack now depends on Backend stack
// Frontend deploys independently`;
    
    updated = updated.replace(dependencyMatch[0], newDependencies);
  }
  
  console.log('✅ Main app updated');
  return updated;
}

// Main execution
async function main() {
  console.log('🚀 Starting Stack Dependency Refactoring V2\n');
  
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
    
    // Parse inline Lambda functions within API routes
    const inlineLambdas = parseInlineApiLambdas(apiRoutesSection);
    const inlineLambdaDefinitions = extractInlineLambdaDefinitions(apiRoutesSection, inlineLambdas);
    console.log(`📊 Extracted ${inlineLambdaDefinitions.length} inline Lambda definitions`);
    
    // Update files
    const updatedBackend = updateBackendStack(backendContent, lambdaFunctions, apiRoutesSection, inlineLambdaDefinitions);
    const updatedApi = updateApiStack(apiContent, lambdaFunctions, apiRoutesSection, inlineLambdaDefinitions);
    const updatedApp = updateMainApp(appContent);
    
    if (!updatedBackend || !updatedApi || !updatedApp) {
      throw new Error('Failed to update one or more files');
    }
    
    // Write updated files
    console.log('\n💾 Writing updated files...');
    fs.writeFileSync(BACKEND_STACK_PATH, updatedBackend);
    fs.writeFileSync(API_STACK_PATH, updatedApi);
    fs.writeFileSync(MAIN_APP_PATH, updatedApp);
    
    const totalLambdas = lambdaFunctions.length + inlineLambdas.length;
    
    console.log('\n✅ Refactoring completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - ${lambdaFunctions.length} Lambda functions from Backend stack`);
    console.log(`   - ${inlineLambdas.length} inline Lambda functions from API routes`);
    console.log(`   - ${totalLambdas} total Lambda functions exported/imported`);
    console.log(`   - API routes moved from Backend to API stack`);
    console.log(`   - Dependency chain updated: Data → Backend → API`);
    console.log('\n⚠️  Next steps:');
    console.log('   1. Review the changes in the updated files');
    console.log('   2. Run: cd infrastructure && npm run build');
    console.log('   3. Fix any remaining TypeScript compilation errors manually');
    console.log('   4. Deploy: ./scripts/deploy-backend.sh --profile gturrini --region eu-west-2');
    
  } catch (error) {
    console.error('\n❌ Error during refactoring:', error.message);
    console.error(error.stack);
    console.error('\n🔄 Backup files created - you can restore them if needed');
    process.exit(1);
  }
}

main();
