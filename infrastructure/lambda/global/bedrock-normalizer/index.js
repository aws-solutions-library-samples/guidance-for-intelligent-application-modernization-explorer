// Force deployment timestamp: 2026-02-01T00:00:00.000Z
const DEPLOYMENT_TIMESTAMP = '2026-02-01T00:00:00.000Z';

/**
 * Bedrock Normalizer Lambda Function
 * 
 * Normalizes technology names for ONE column type using direct Bedrock model invocation.
 * This Lambda is invoked in parallel by the Step Function (5 instances, one per column type).
 * 
 * ARCHITECTURE: Direct Model Invocation with Prompt Templates
 * - Uses BedrockRuntimeClient with InvokeModelCommand (not Bedrock Agent)
 * - Prompts stored in DynamoDB for centralized management
 * - Supports versioning and runtime updates without redeployment
 * 
 * IAM Permissions (Least Privilege):
 * - Bedrock: InvokeModel on amazon.nova-lite-v1:0
 * - DynamoDB: GetItem on prompt templates table
 * - CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { promptService, sanitizeEvent } = require('app-modex-shared');

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Batch size for Bedrock requests
const BATCH_SIZE = 20;

/**
 * Invoke Bedrock model to normalize a batch of technology names
 */
async function normalizeBatch(batch, columnType, promptTemplate) {
  console.log(`🤖 Invoking Bedrock for ${batch.length} values (${columnType})`);
  
  // Build the user prompt by replacing ${technologies} with the batch
  const technologiesText = batch.map((tech, idx) => `${idx + 1}. ${tech}`).join('\n');
  const userPrompt = promptTemplate.userPromptTemplate.replace('${technologies}', technologiesText);
  
  try {
    const command = new InvokeModelCommand({
      modelId: promptTemplate.model,
      contentType: 'application/json',
      accept: 'application/json',
      guardrailIdentifier: process.env.BEDROCK_GUARDRAIL_ID,
      guardrailVersion: process.env.BEDROCK_GUARDRAIL_VERSION || 'DRAFT',
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              {
                text: userPrompt
              }
            ]
          }
        ],
        system: [
          {
            text: promptTemplate.systemPrompt
          }
        ],
        inferenceConfig: {
          maxTokens: 2048,
          temperature: 0.1,
          topP: 0.9
        }
      })
    });
    
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    console.log(`📥 Bedrock response received`);
    
    // Extract text from response
    const content = responseBody.output?.message?.content?.[0]?.text || '';
    
    if (!content) {
      throw new Error('Empty response from Bedrock');
    }
    
    // Parse JSON response
    let normalizedBatch;
    try {
      // Try to extract JSON array from response (in case there's extra text)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        normalizedBatch = JSON.parse(jsonMatch[0]);
      } else {
        normalizedBatch = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('❌ Failed to parse Bedrock response as JSON:', content.substring(0, 200));
      throw new Error(`Invalid JSON response from Bedrock: ${parseError.message}`);
    }
    
    // Validate response is an array
    if (!Array.isArray(normalizedBatch)) {
      throw new Error('Bedrock response is not an array');
    }
    
    // Validate response length matches input length
    if (normalizedBatch.length !== batch.length) {
      console.warn(`⚠️ Response length (${normalizedBatch.length}) doesn't match input length (${batch.length})`);
      // Pad with original values if response is shorter
      while (normalizedBatch.length < batch.length) {
        normalizedBatch.push(batch[normalizedBatch.length]);
      }
    }
    
    // Build normalized mappings
    const mappings = [];
    const timestamp = new Date().toISOString();
    
    for (let i = 0; i < batch.length; i++) {
      const original = batch[i];
      const normalized = normalizedBatch[i] || original;
      
      mappings.push({
        original_name: original,
        normalized_name: typeof normalized === 'string' ? normalized : original,
        confidence_score: typeof normalized === 'string' && normalized !== original ? 0.9 : 0.5,
        created_date: timestamp,
        last_updated: timestamp
      });
    }
    
    return mappings;
    
  } catch (error) {
    console.error(`❌ Error invoking Bedrock:`, error);
    throw error;
  }
}

/**
 * Main handler function
 */
exports.handler = async (event) => {
  console.log('🤖 Bedrock Normalizer Lambda started');
  console.log('📋 Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  const { columnType, unknownValues, projectId, processId, originalTimestamp, s3Key, filename } = event;
  
  // Validate required parameters
  if (!columnType || !unknownValues) {
    throw new Error('Missing required parameters: columnType, unknownValues');
  }
  
  try {
    console.log(`🔄 Normalizing ${unknownValues.length} unknown values for column type: ${columnType}`);
    
    if (unknownValues.length === 0) {
      console.log('ℹ️ No unknown values to normalize');
      return {
        statusCode: 200,
        columnType,
        projectId,
        processId,
        originalTimestamp,
        s3Key,
        filename,
        normalizedMappings: [],
        processedCount: 0
      };
    }
    
    // Fetch prompt template from DynamoDB
    const promptTemplate = await promptService.getPrompt('normalization', 'amazon.nova-lite-v1:0');
    console.log(`📋 Retrieved normalization prompt template (model: ${promptTemplate.model})`);
    
    // Process in batches
    const allMappings = [];
    const totalBatches = Math.ceil(unknownValues.length / BATCH_SIZE);
    
    console.log(`📦 Processing ${totalBatches} batches (batch size: ${BATCH_SIZE})`);
    
    for (let i = 0; i < unknownValues.length; i += BATCH_SIZE) {
      const batch = unknownValues.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      
      console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} values)`);
      
      const mappings = await normalizeBatch(batch, columnType, promptTemplate);
      allMappings.push(...mappings);
      
      console.log(`✅ Batch ${batchNumber}/${totalBatches} completed`);
      
      // Small delay between batches to avoid throttling
      if (i + BATCH_SIZE < unknownValues.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`✅ Normalization complete: ${allMappings.length} mappings created`);
    
    return {
      statusCode: 200,
      columnType,
      projectId,
      processId,
      originalTimestamp,
      s3Key,
      filename,
      normalizedMappings: allMappings,
      processedCount: allMappings.length
    };
    
  } catch (error) {
    console.error('❌ Error in Bedrock normalizer:', error);
    throw error;
  }
};
