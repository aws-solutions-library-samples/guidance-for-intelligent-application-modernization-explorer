// Force deployment timestamp: 2026-02-03T10:00:00.000Z
const DEPLOYMENT_TIMESTAMP = '2026-02-03T10:00:00.000Z';

/**
 * Normalization Metrics Lambda Function
 * 
 * Publishes CloudWatch metrics for normalization workflow monitoring.
 * Tracks success rate, duration, value counts, and other KPIs.
 * 
 * IAM Permissions (Least Privilege):
 * - CloudWatch: PutMetricData (namespace: AppModEx/Normalization only)
 * - CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents
 */

const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

const cloudwatchClient = new CloudWatchClient({});

// CloudWatch namespace
const NAMESPACE = 'AppModEx/Normalization';

/**
 * Publish a single metric to CloudWatch
 */
async function publishMetric(metricName, value, unit, dimensions = []) {
  try {
    await cloudwatchClient.send(new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: [{
        MetricName: metricName,
        Value: value,
        Unit: unit,
        Timestamp: new Date(),
        Dimensions: dimensions
      }]
    }));
    
    console.log(`✅ Published metric: ${metricName} = ${value} ${unit}`);
    
  } catch (error) {
    console.error(`❌ Error publishing metric ${metricName}:`, error);
    // Don't throw - metrics are non-critical
  }
}

/**
 * Publish multiple metrics in a batch
 */
async function publishMetrics(metrics) {
  try {
    const metricData = metrics.map(metric => ({
      MetricName: metric.name,
      Value: metric.value,
      Unit: metric.unit,
      Timestamp: new Date(),
      Dimensions: metric.dimensions || []
    }));
    
    await cloudwatchClient.send(new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: metricData
    }));
    
    console.log(`✅ Published ${metrics.length} metrics in batch`);
    
  } catch (error) {
    console.error('❌ Error publishing metrics batch:', error);
    // Don't throw - metrics are non-critical
  }
}

/**
 * Calculate metrics from normalization results
 */
function calculateMetrics(event) {
  const metrics = [];
  const { projectId, aggregationResults, totalNewMappings } = event;
  
  // Common dimensions
  const projectDimension = { Name: 'ProjectId', Value: projectId };
  
  // Overall metrics
  metrics.push({
    name: 'TotalNewMappings',
    value: totalNewMappings || 0,
    unit: 'Count',
    dimensions: [projectDimension]
  });
  
  // Per-column-type metrics
  if (aggregationResults && Array.isArray(aggregationResults)) {
    for (const result of aggregationResults) {
      const columnDimensions = [
        projectDimension,
        { Name: 'ColumnType', Value: result.columnType }
      ];
      
      metrics.push({
        name: 'NewMappingsByType',
        value: result.newCount || 0,
        unit: 'Count',
        dimensions: columnDimensions
      });
    }
  }
  
  // Success indicator
  metrics.push({
    name: 'NormalizationSuccess',
    value: 1,
    unit: 'Count',
    dimensions: [projectDimension]
  });
  
  return metrics;
}

/**
 * Calculate duration metrics
 */
function calculateDurationMetrics(event) {
  const metrics = [];
  const { projectId, processId, startTime } = event;
  
  if (startTime) {
    const duration = (Date.now() - new Date(startTime).getTime()) / 1000;
    
    metrics.push({
      name: 'NormalizationDuration',
      value: duration,
      unit: 'Seconds',
      dimensions: [{ Name: 'ProjectId', Value: projectId }]
    });
  }
  
  return metrics;
}

/**
 * Main handler function
 */
exports.handler = async (event) => {
  console.log('📊 Normalization Metrics Lambda started');
  console.log('📋 Event:', JSON.stringify(event, null, 2));
  
  const { projectId } = event;
  
  // Validate required parameters
  if (!projectId) {
    console.warn('⚠️ Missing projectId, skipping metrics');
    return {
      statusCode: 200,
      message: 'Skipped metrics (missing projectId)',
      ...event
    };
  }
  
  try {
    console.log('📈 Calculating metrics...');
    
    // Calculate all metrics
    const valueMetrics = calculateMetrics(event);
    const durationMetrics = calculateDurationMetrics(event);
    const allMetrics = [...valueMetrics, ...durationMetrics];
    
    console.log(`📊 Publishing ${allMetrics.length} metrics to CloudWatch`);
    
    // Publish metrics in batch
    if (allMetrics.length > 0) {
      await publishMetrics(allMetrics);
    }
    
    console.log('✅ Metrics published successfully');
    
    // Log summary
    console.log('📊 Metrics Summary:');
    allMetrics.forEach(metric => {
      const dims = metric.dimensions.map(d => `${d.Name}=${d.Value}`).join(', ');
      console.log(`   ${metric.name}: ${metric.value} ${metric.unit} [${dims}]`);
    });
    
    return {
      statusCode: 200,
      message: 'Metrics published successfully',
      metricsPublished: allMetrics.length,
      ...event // Pass through all event data
    };
    
  } catch (error) {
    console.error('❌ Error in metrics publisher:', error);
    // Don't throw - metrics are non-critical, return success
    return {
      statusCode: 200,
      message: 'Metrics publishing failed (non-critical)',
      error: error.message,
      ...event
    };
  }
};
