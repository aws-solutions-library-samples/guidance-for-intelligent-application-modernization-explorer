const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const ExcelJS = require('exceljs');

const s3 = new S3Client({});
const dynamodbClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamodbClient);

const PROJECT_ID = process.env.PROJECT_ID;
const PROJECT_BUCKET = process.env.PROJECT_BUCKET;
const PROJECTS_TABLE = process.env.PROJECTS_TABLE;

// Configuration constants
const MAX_ROWS_PER_TAB = 1000000; // Excel limit is ~1M rows, use conservative limit
const MAX_COLUMNS_PER_TAB = 16384; // Excel limit
const CHART_COLORS = ['#4472C4', '#E70000', '#70AD47', '#FFC000', '#5B9BD5', '#C55A11'];

// Macro-category mapping
const MACRO_CATEGORIES = {
    'data': {
        displayName: 'DATA',
        description: 'Core data exports including skills, applications, and infrastructure',
        categories: ['skills', 'technology-vision', 'application-portfolio', 'application-tech-stack', 'application-infrastructure', 'application-utilization']
    },
    'insights': {
        displayName: 'INSIGHTS',
        description: 'Analysis and insights derived from the core data',
        categories: ['skills-analysis', 'vision-analysis', 'tech-stack-analysis', 'infrastructure-analysis', 'utilization-analysis', 'team-analysis']
    },
    'planning': {
        displayName: 'PLANNING',
        description: 'Planning outputs including estimates and recommendations',
        categories: ['pilot-identification', 'application-grouping', 'tco-estimates', 'team-estimates']
    }
};

/**
 * Excel Generator Lambda Function
 * Creates formatted Excel files from sourced data with support for:
 * - Multi-tab Excel files with proper formatting
 * - Templates for different export categories (Data, Insights, Planning)
 * - Data splitting for large datasets across multiple tabs
 * - Charts and summary statistics for insights
 * - Macro-category grouping (one Excel file per macro-category with multiple sheets)
 */

/**
 * Sanitize project name for use in filenames
 * Replaces spaces with underscores and removes special characters
 */
function sanitizeProjectName(projectName) {
    if (!projectName) return 'unknown_project';
    
    return projectName
        .toLowerCase()
        .replace(/\s+/g, '_')           // Replace spaces with underscores
        .replace(/[^a-z0-9_-]/g, '')   // Remove special characters except underscores and hyphens
        .replace(/_+/g, '_')           // Replace multiple underscores with single
        .replace(/^_|_$/g, '');        // Remove leading/trailing underscores
}

/**
 * Retrieve project name from DynamoDB
 */
async function getProjectName(projectId) {
    try {
        console.log(`🔍 Retrieving project name for projectId: ${projectId}`);
        
        const params = {
            TableName: PROJECTS_TABLE,
            Key: { projectId }
        };
        
        const result = await dynamodb.send(new GetCommand(params));
        
        if (!result.Item) {
            console.warn(`⚠️ Project not found in DynamoDB: ${projectId}`);
            return 'unknown_project';
        }
        
        const projectName = result.Item.name || 'unnamed_project';
        console.log(`✅ Retrieved project name: ${projectName}`);
        
        return sanitizeProjectName(projectName);
    } catch (error) {
        console.error('❌ Error retrieving project name:', error);
        return 'unknown_project';
    }
}

/**
 * Generate macro-category Excel files (one file per macro-category with multiple sheets)
 */
async function generateMacroCategoryExcels(dataSourcingResults, projectId, exportId) {
    console.log('📊 Starting macro-category Excel generation');
    
    // Group data sourcing results by macro-category
    const macroCategoryData = {};
    
    // Initialize macro-categories
    Object.keys(MACRO_CATEGORIES).forEach(macroKey => {
        macroCategoryData[macroKey] = {
            displayName: MACRO_CATEGORIES[macroKey].displayName,
            description: MACRO_CATEGORIES[macroKey].description,
            categories: []
        };
    });
    
    // Group successful categories by macro-category
    dataSourcingResults.forEach(categoryResult => {
        // Handle both old format (dataSourcingResults) and new format (successfulCategories)
        let category, data, success, recordCount;
        
        if (categoryResult.dataSourcing && categoryResult.excelGeneration) {
            // New format from successfulCategories
            category = categoryResult.category;
            success = categoryResult.status === 'COMPLETED';
            recordCount = categoryResult.dataSourcing.recordCount || 0;
            
            console.log(`📊 Processing successful category: ${category} with ${recordCount} records`);
            
            // Create data structure compatible with Excel generation
            data = {
                category: category,
                success: success,
                data: categoryResult.dataSourcing.data || [],
                recordCount: recordCount
            };
        } else {
            // Old format from dataSourcingResults
            category = categoryResult.category;
            success = categoryResult.success;
            data = categoryResult;
        }
        
        if (!success) {
            console.log(`⏭️ Skipping ${category}: not successful`);
            return;
        }
        
        // Find which macro-category this category belongs to
        const macroKey = Object.keys(MACRO_CATEGORIES).find(key => 
            MACRO_CATEGORIES[key].categories.includes(category)
        );
        
        if (macroKey && macroCategoryData[macroKey]) {
            macroCategoryData[macroKey].categories.push(data);
            console.log(`📂 Added ${category} to ${macroKey} macro-category`);
        } else {
            console.warn(`⚠️ Category ${category} not found in any macro-category`);
        }
    });
    
    const generatedFiles = [];
    
    // Generate Excel file for each macro-category that has data
    for (const [macroKey, macroData] of Object.entries(macroCategoryData)) {
        if (macroData.categories.length === 0) {
            console.log(`⏭️ Skipping ${macroKey} macro-category: no data`);
            continue;
        }
        
        console.log(`📊 Generating ${macroKey} macro-category Excel with ${macroData.categories.length} categories`);
        
        const excelFile = await generateMacroCategoryExcel(
            macroKey,
            macroData,
            projectId,
            exportId
        );
        
        generatedFiles.push(excelFile);
    }
    
    return generatedFiles;
}
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
    console.log('📊 Excel Generator Lambda started');
    console.log('📋 Event:', JSON.stringify(sanitizeEvent(event), null, 2));
    
    try {
        const { projectId, exportId, selectedCategories, dataSourcingResults, successfulCategories, generateMacroCategoryFiles } = event;
        
        // Validate required parameters
        if (!projectId || !exportId) {
            throw new Error('Missing required parameters: projectId or exportId');
        }
        
        // Use successfulCategories if available (new format), otherwise fall back to dataSourcingResults (legacy)
        const dataToProcess = successfulCategories || dataSourcingResults;
        if (!dataToProcess) {
            throw new Error('Missing data: neither successfulCategories nor dataSourcingResults provided');
        }
        
        let generatedFiles = [];
        
        if (generateMacroCategoryFiles) {
            // New macro-category approach
            console.log('📊 Generating macro-category Excel files');
            generatedFiles = await generateMacroCategoryExcels(dataToProcess, projectId, exportId);
        } else {
            // Legacy single-category approach (for backward compatibility)
            console.log('📊 Generating individual category Excel files');
            
            // Process each data sourcing result
            for (const result of dataToProcess) {
                if (result.skipped || !result.success) {
                    console.log(`⏭️ Skipping ${result.category}: ${result.reason || 'Failed'}`);
                    continue;
                }
                
                // Validate data structure
                if (!Array.isArray(result.data)) {
                    console.error(`❌ Invalid data format for category ${result.category}: expected array, got ${typeof result.data}`);
                    continue;
                }
                
                console.log(`📊 Generating Excel for category: ${result.category} with ${result.data.length} records`);
                
                const excelFile = await generateExcelForCategory(
                    result.category, 
                    result.data, 
                    projectId, 
                    exportId
                );
                
                generatedFiles.push(excelFile);
            }
        }
        
        console.log(`✅ Successfully generated ${generatedFiles.length} Excel files`);
        
        return {
            success: true,
            files: generatedFiles,
            totalFiles: generatedFiles.length,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('❌ Excel Generator Error:', error);
        throw new Error(`Failed to generate Excel files: ${error.message}`);
    }
};

/**
 * Generate Excel file for a macro-category with multiple sheets (one per category)
 */
async function generateMacroCategoryExcel(macroKey, macroData, projectId, exportId) {
    console.log(`📊 Generating macro-category Excel: ${macroData.displayName} with ${macroData.categories.length} categories`);
    
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AppModEx Export System';
    workbook.created = new Date();
    workbook.company = 'AppModEx';
    
    // Add overview sheet first
    const overviewSheet = workbook.addWorksheet('Overview');
    await addMacroCategoryOverview(overviewSheet, macroData);
    
    // Add sheet for each category in this macro-category
    for (const categoryResult of macroData.categories) {
        const categoryConfig = getCategoryConfig(categoryResult.category);
        
        if (!Array.isArray(categoryResult.data)) {
            console.error(`❌ Invalid data format for category ${categoryResult.category}: expected array, got ${typeof categoryResult.data}`);
            continue;
        }
        
        console.log(`📄 Adding sheet for ${categoryResult.category} with ${categoryResult.data.length} records`);
        
        // Create worksheet for this category
        const worksheet = workbook.addWorksheet(categoryConfig.displayName);
        
        if (categoryResult.data.length === 0) {
            // Add empty data message
            worksheet.addRow(['No data available for this category']);
            worksheet.getCell('A1').font = { italic: true, size: 12 };
            worksheet.getCell('A1').alignment = { horizontal: 'center' };
        } else {
            // Add data to worksheet
            await addDataToWorksheet(worksheet, categoryResult.data, categoryConfig, 1, 1);
        }
    }
    
    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Get project name for filename
    const projectName = await getProjectName(projectId);
    
    // Upload to S3 in project-specific bucket with new naming convention
    const fileName = `appmodex-${projectName}-${projectId}-${macroData.displayName}.xlsx`;
    const s3Key = `exports/${exportId}/${fileName}`;
    
    await s3.send(new PutObjectCommand({
        Bucket: PROJECT_BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        Metadata: {
            macroCategory: macroKey,
            projectId,
            exportId,
            categoriesIncluded: macroData.categories.map(c => c.category).join(','),
            totalRecords: macroData.categories.reduce((sum, c) => sum + c.data.length, 0).toString()
        }
    }));
    
    console.log(`✅ Macro-category Excel file uploaded: ${s3Key} (${Math.round(buffer.length / 1024)}KB)`);
    
    return {
        macroCategory: macroKey,
        fileName,
        s3Key,
        sizeBytes: buffer.length,
        categoriesIncluded: macroData.categories.map(c => c.category),
        totalRecords: macroData.categories.reduce((sum, c) => sum + c.data.length, 0),
        sheetsCount: macroData.categories.length + 1 // +1 for overview sheet
    };
}

/**
 * Add overview sheet to macro-category Excel file
 */
async function addMacroCategoryOverview(worksheet, macroData) {
    // Add title
    const titleRow = worksheet.addRow([macroData.displayName]);
    titleRow.getCell(1).font = { bold: true, size: 20, color: { argb: 'FF4472C4' } };
    titleRow.getCell(1).alignment = { horizontal: 'center' };
    
    // Add description
    worksheet.addRow([]);
    const descRow = worksheet.addRow([macroData.description]);
    descRow.getCell(1).font = { italic: true, size: 12 };
    descRow.getCell(1).alignment = { horizontal: 'center' };
    
    // Add generation info
    worksheet.addRow([]);
    const infoRow = worksheet.addRow([`Generated on: ${new Date().toLocaleString()}`]);
    infoRow.getCell(1).font = { size: 10 };
    infoRow.getCell(1).alignment = { horizontal: 'center' };
    
    // Add summary table
    worksheet.addRow([]);
    worksheet.addRow([]);
    const summaryHeaderRow = worksheet.addRow(['Category', 'Records', 'Description']);
    summaryHeaderRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' }
        };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    
    // Add category summary rows
    macroData.categories.forEach((categoryResult, index) => {
        const categoryConfig = getCategoryConfig(categoryResult.category);
        const row = worksheet.addRow([
            categoryConfig.displayName,
            categoryResult.data.length,
            categoryConfig.description
        ]);
        
        // Alternate row colors
        const fillColor = index % 2 === 0 ? 'FFF2F2F2' : 'FFFFFFFF';
        
        row.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: fillColor }
            };
        });
    });
    
    // Add total row
    const totalRecords = macroData.categories.reduce((sum, c) => sum + c.data.length, 0);
    const totalRow = worksheet.addRow(['TOTAL', totalRecords, `${macroData.categories.length} categories`]);
    totalRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFCCCCCC' }
        };
        cell.border = {
            top: { style: 'thick' },
            left: { style: 'thin' },
            bottom: { style: 'thick' },
            right: { style: 'thin' }
        };
    });
    
    // Auto-fit columns
    worksheet.columns.forEach(column => {
        column.width = 25;
    });
    
    // Set column widths specifically
    worksheet.getColumn(1).width = 30; // Category name
    worksheet.getColumn(2).width = 15; // Records count
    worksheet.getColumn(3).width = 50; // Description
}

/**
 * Generate Excel file for a specific category with enhanced formatting and multi-tab support
 */
async function generateExcelForCategory(category, data, projectId, exportId) {
    console.log(`📊 Generating Excel for category: ${category} with ${data.length} records`);
    
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AppModEx Export System';
    workbook.created = new Date();
    workbook.company = 'AppModEx';
    
    // Get category configuration
    const categoryConfig = getCategoryConfig(category);
    
    if (data.length === 0) {
        // Create single worksheet with empty data message
        const worksheet = workbook.addWorksheet(categoryConfig.displayName);
        worksheet.addRow(['No data available for this category']);
        worksheet.getCell('A1').font = { italic: true, size: 12 };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };
    } else {
        // Generate Excel based on category type
        switch (categoryConfig.type) {
            case 'data':
                await generateDataSectionExcel(workbook, category, data, categoryConfig);
                break;
            case 'insights':
                await generateInsightsSectionExcel(workbook, category, data, categoryConfig);
                break;
            case 'planning':
                await generatePlanningSectionExcel(workbook, category, data, categoryConfig);
                break;
            default:
                // Fallback to basic generation
                await generateBasicExcel(workbook, category, data, categoryConfig);
        }
    }
    
    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Get project name for filename
    const projectName = await getProjectName(projectId);
    
    // Upload to S3 in project-specific bucket with new naming convention
    const fileName = `appmodex-${projectName}-${projectId}-${category}.xlsx`;
    const s3Key = `exports/${exportId}/${fileName}`;
    
    await s3.send(new PutObjectCommand({
        Bucket: PROJECT_BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        Metadata: {
            category,
            projectId,
            exportId,
            recordCount: data.length.toString(),
            categoryType: categoryConfig.type
        }
    }));
    
    console.log(`✅ Excel file uploaded: ${s3Key} (${Math.round(buffer.length / 1024)}KB)`);
    
    return {
        category,
        fileName,
        s3Key,
        sizeBytes: buffer.length,
        recordCount: data.length,
        categoryType: categoryConfig.type
    };
}

/**
 * Get category configuration including type and display information
 */
function getCategoryConfig(category) {
    const categoryConfigs = {
        // Data section categories
        'skills': {
            type: 'data',
            displayName: 'Team Skills',
            description: 'Skills inventory and team capabilities'
        },
        'technology-vision': {
            type: 'data',
            displayName: 'Technology Vision',
            description: 'Technology radar and strategic direction'
        },
        'application-portfolio': {
            type: 'data',
            displayName: 'Application Portfolio',
            description: 'Complete application inventory'
        },
        'application-tech-stack': {
            type: 'data',
            displayName: 'Application Tech Stack',
            description: 'Technology components by application'
        },
        'application-infrastructure': {
            type: 'data',
            displayName: 'Application Infrastructure',
            description: 'Infrastructure resources by application'
        },
        'application-utilization': {
            type: 'data',
            displayName: 'Application Utilization',
            description: 'Resource utilization metrics'
        },
        
        // Insights section categories
        'skills-analysis': {
            type: 'insights',
            displayName: 'Skills Analysis',
            description: 'Skills gap analysis and recommendations'
        },
        'vision-analysis': {
            type: 'insights',
            displayName: 'Vision Analysis',
            description: 'Technology vision analysis and insights'
        },
        'tech-stack-analysis': {
            type: 'insights',
            displayName: 'Tech Stack Analysis',
            description: 'Technology stack analysis and patterns'
        },
        'infrastructure-analysis': {
            type: 'insights',
            displayName: 'Infrastructure Analysis',
            description: 'Infrastructure analysis and optimization'
        },
        'utilization-analysis': {
            type: 'insights',
            displayName: 'Utilization Analysis',
            description: 'Resource utilization analysis and trends'
        },
        'team-analysis': {
            type: 'insights',
            displayName: 'Team Analysis',
            description: 'Team composition and capability analysis'
        },
        
        // Planning section categories
        'pilot-identification': {
            type: 'planning',
            displayName: 'Pilot Identification',
            description: 'Pilot project identification and scoring'
        },
        'application-grouping': {
            type: 'planning',
            displayName: 'Application Buckets',
            description: 'Application grouping and migration waves'
        },
        'tco-estimates': {
            type: 'planning',
            displayName: 'TCO Estimates',
            description: 'Total cost of ownership estimates'
        },
        'team-estimates': {
            type: 'planning',
            displayName: 'Team Estimates',
            description: 'Team sizing and effort estimates'
        }
    };
    
    return categoryConfigs[category] || {
        type: 'data',
        displayName: category.charAt(0).toUpperCase() + category.slice(1),
        description: 'Data export'
    };
}

/**
 * Generate Excel for Data Section categories (Requirements 3.1)
 * Creates Excel files with appropriate column headers and data formatting
 */
async function generateDataSectionExcel(workbook, category, data, categoryConfig) {
    console.log(`📊 Generating Data Section Excel for ${category}`);
    
    // Check if data needs to be split across multiple tabs
    const needsMultipleTabs = data.length > MAX_ROWS_PER_TAB;
    
    if (needsMultipleTabs) {
        // Split data across multiple tabs (Requirements 3.4)
        const chunks = chunkArray(data, MAX_ROWS_PER_TAB);
        
        for (let i = 0; i < chunks.length; i++) {
            const tabName = chunks.length > 1 ? `${categoryConfig.displayName} (${i + 1})` : categoryConfig.displayName;
            const worksheet = workbook.addWorksheet(tabName);
            await addDataToWorksheet(worksheet, chunks[i], categoryConfig, i + 1, chunks.length);
        }
    } else {
        // Single tab
        const worksheet = workbook.addWorksheet(categoryConfig.displayName);
        await addDataToWorksheet(worksheet, data, categoryConfig, 1, 1);
    }
}

/**
 * Generate Excel for Insights Section categories (Requirements 3.2)
 * Includes charts and summary statistics where applicable
 */
async function generateInsightsSectionExcel(workbook, category, data, categoryConfig) {
    console.log(`📈 Generating Insights Section Excel for ${category}`);
    
    // Create summary worksheet first
    const summaryWorksheet = workbook.addWorksheet('Summary');
    await addInsightsSummary(summaryWorksheet, data, categoryConfig);
    
    // Create detailed data worksheet
    const dataWorksheet = workbook.addWorksheet('Detailed Data');
    await addDataToWorksheet(dataWorksheet, data, categoryConfig, 1, 1);
    
    // Add charts if data supports it
    if (data.length > 0) {
        await addInsightsCharts(summaryWorksheet, data, categoryConfig);
    }
}

/**
 * Generate Excel for Planning Section categories (Requirements 3.3)
 * Organizes data into logical tabs (estimates, pilot identification, etc.)
 */
async function generatePlanningSectionExcel(workbook, category, data, categoryConfig) {
    console.log(`📋 Generating Planning Section Excel for ${category}`);
    
    // Organize data into logical tabs based on category
    switch (category) {
        case 'pilot-identification':
            await addPilotIdentificationTabs(workbook, data, categoryConfig);
            break;
        case 'application-grouping':
            await addApplicationGroupingTabs(workbook, data, categoryConfig);
            break;
        case 'tco-estimates':
            await addTCOEstimatesTabs(workbook, data, categoryConfig);
            break;
        case 'team-estimates':
            await addTeamEstimatesTabs(workbook, data, categoryConfig);
            break;
        default:
            // Fallback to basic data worksheet
            const worksheet = workbook.addWorksheet(categoryConfig.displayName);
            await addDataToWorksheet(worksheet, data, categoryConfig, 1, 1);
    }
}

/**
 * Generate basic Excel file (fallback)
 */
async function generateBasicExcel(workbook, category, data, categoryConfig) {
    console.log(`📄 Generating basic Excel for ${category}`);
    
    const worksheet = workbook.addWorksheet(categoryConfig.displayName);
    await addDataToWorksheet(worksheet, data, categoryConfig, 1, 1);
}

/**
 * Add data to worksheet with proper formatting
 */
async function addDataToWorksheet(worksheet, data, categoryConfig, tabNumber, totalTabs) {
    if (data.length === 0) {
        worksheet.addRow(['No data available']);
        worksheet.getCell('A1').font = { italic: true };
        return;
    }
    
    // Add title and description
    const titleRow = worksheet.addRow([categoryConfig.displayName]);
    titleRow.getCell(1).font = { bold: true, size: 16 };
    titleRow.getCell(1).alignment = { horizontal: 'center' };
    
    if (totalTabs > 1) {
        const subtitleRow = worksheet.addRow([`Part ${tabNumber} of ${totalTabs}`]);
        subtitleRow.getCell(1).font = { italic: true, size: 12 };
        subtitleRow.getCell(1).alignment = { horizontal: 'center' };
    }
    
    const descRow = worksheet.addRow([categoryConfig.description]);
    descRow.getCell(1).font = { italic: true, size: 10 };
    descRow.getCell(1).alignment = { horizontal: 'center' };
    
    // Add empty row
    worksheet.addRow([]);
    
    // Add headers
    const headers = Object.keys(data[0]);
    const headerRow = worksheet.addRow(headers);
    
    // Style headers
    headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' }
        };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    
    // Add data rows
    data.forEach((record, index) => {
        const row = worksheet.addRow(Object.values(record));
        
        // Alternate row colors
        const fillColor = index % 2 === 0 ? 'FFF2F2F2' : 'FFFFFFFF';
        
        row.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: fillColor }
            };
        });
    });
    
    // Auto-fit columns
    worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
            const columnLength = cell.value ? cell.value.toString().length : 10;
            if (columnLength > maxLength) {
                maxLength = columnLength;
            }
        });
        column.width = Math.min(Math.max(maxLength + 2, 12), 50); // Min 12, Max 50
    });
    
    // Freeze header row
    worksheet.views = [{ state: 'frozen', ySplit: 5 }]; // Freeze at row 5 (after title/description)
}

/**
 * Add insights summary with statistics
 */
async function addInsightsSummary(worksheet, data, categoryConfig) {
    // Add title
    const titleRow = worksheet.addRow([`${categoryConfig.displayName} - Summary`]);
    titleRow.getCell(1).font = { bold: true, size: 16 };
    titleRow.getCell(1).alignment = { horizontal: 'center' };
    
    worksheet.addRow([]); // Empty row
    
    // Add summary statistics
    const summaryData = calculateSummaryStatistics(data);
    
    const statsHeaderRow = worksheet.addRow(['Metric', 'Value']);
    statsHeaderRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6FA' } };
    });
    
    Object.entries(summaryData).forEach(([key, value]) => {
        worksheet.addRow([key, value]);
    });
    
    // Auto-fit columns
    worksheet.columns.forEach(column => {
        column.width = 25;
    });
}

/**
 * Add charts to insights worksheets
 */
async function addInsightsCharts(worksheet, data, categoryConfig) {
    // This is a placeholder for chart functionality
    // ExcelJS chart support is limited, so we'll add chart data that can be used to create charts manually
    
    const chartDataRow = worksheet.addRow([]);
    worksheet.addRow(['Chart Data Available Below - Use Excel Chart Tools to Visualize']);
    
    // Add chart-ready data based on category type
    const chartData = prepareChartData(data, categoryConfig);
    if (chartData.length > 0) {
        const chartHeaderRow = worksheet.addRow(Object.keys(chartData[0]));
        chartHeaderRow.eachCell((cell) => {
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCC00' } };
        });
        
        chartData.forEach(record => {
            worksheet.addRow(Object.values(record));
        });
    }
}

/**
 * Add pilot identification specific tabs
 */
async function addPilotIdentificationTabs(workbook, data, categoryConfig) {
    // Filter for AI_ENHANCED results (final consolidated scores) and sort by score
    const summaryWorksheet = workbook.addWorksheet('Pilot Summary');
    const summaryData = data.filter(item => item.resultType === 'AI_ENHANCED' && item.score && item.score > 0)
                           .sort((a, b) => (b.score || 0) - (a.score || 0))
                           .slice(0, 20); // Top 20 pilots
    await addDataToWorksheet(summaryWorksheet, summaryData, { ...categoryConfig, displayName: 'Top Pilot Candidates' }, 1, 1);
    
    // Rule-based results tab
    const ruleBasedWorksheet = workbook.addWorksheet('Rule-Based Results');
    const ruleBasedData = data.filter(item => item.resultType === 'RULE_BASED');
    await addDataToWorksheet(ruleBasedWorksheet, ruleBasedData, { ...categoryConfig, displayName: 'Rule-Based Analysis' }, 1, 1);
    
    // AI-enhanced results tab
    const aiEnhancedWorksheet = workbook.addWorksheet('AI-Enhanced Results');
    const aiEnhancedData = data.filter(item => item.resultType === 'AI_ENHANCED');
    await addDataToWorksheet(aiEnhancedWorksheet, aiEnhancedData, { ...categoryConfig, displayName: 'AI-Enhanced Analysis' }, 1, 1);
    
    // All results tab
    const detailsWorksheet = workbook.addWorksheet('All Results');
    await addDataToWorksheet(detailsWorksheet, data, categoryConfig, 1, 1);
}

/**
 * Add application grouping specific tabs
 */
async function addApplicationGroupingTabs(workbook, data, categoryConfig) {
    // Group by bucket/wave
    const buckets = {};
    data.forEach(app => {
        const bucket = app.bucket || app.wave || 'Unassigned';
        if (!buckets[bucket]) buckets[bucket] = [];
        buckets[bucket].push(app);
    });
    
    // Create tab for each bucket
    Object.entries(buckets).forEach(([bucketName, apps]) => {
        const worksheet = workbook.addWorksheet(`${bucketName} (${apps.length})`);
        addDataToWorksheet(worksheet, apps, { ...categoryConfig, displayName: `${bucketName} Applications` }, 1, 1);
    });
}

/**
 * Add TCO estimates specific tabs
 */
async function addTCOEstimatesTabs(workbook, data, categoryConfig) {
    // Summary tab
    const summaryWorksheet = workbook.addWorksheet('TCO Summary');
    const summaryStats = calculateTCOSummary(data);
    await addDataToWorksheet(summaryWorksheet, summaryStats, { ...categoryConfig, displayName: 'TCO Summary' }, 1, 1);
    
    // Detailed estimates tab
    const detailsWorksheet = workbook.addWorksheet('Detailed Estimates');
    await addDataToWorksheet(detailsWorksheet, data, categoryConfig, 1, 1);
}

/**
 * Add team estimates specific tabs
 */
async function addTeamEstimatesTabs(workbook, data, categoryConfig) {
    // By role tab
    const roleData = groupByRole(data);
    Object.entries(roleData).forEach(([role, estimates]) => {
        const worksheet = workbook.addWorksheet(`${role} Estimates`);
        addDataToWorksheet(worksheet, estimates, { ...categoryConfig, displayName: `${role} Estimates` }, 1, 1);
    });
}

/**
 * Utility functions
 */

function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

function calculateSummaryStatistics(data) {
    if (data.length === 0) return { 'Total Records': 0 };
    
    const stats = {
        'Total Records': data.length,
        'Generated At': new Date().toISOString()
    };
    
    // Add numeric field statistics
    const numericFields = Object.keys(data[0]).filter(key => 
        typeof data[0][key] === 'number' || !isNaN(parseFloat(data[0][key]))
    );
    
    numericFields.forEach(field => {
        const values = data.map(item => parseFloat(item[field])).filter(val => !isNaN(val));
        if (values.length > 0) {
            stats[`${field} - Average`] = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
            stats[`${field} - Min`] = Math.min(...values);
            stats[`${field} - Max`] = Math.max(...values);
        }
    });
    
    return stats;
}

function prepareChartData(data, categoryConfig) {
    // Prepare aggregated data suitable for charts
    if (data.length === 0) return [];
    
    // Generic aggregation - count by first string field
    const stringFields = Object.keys(data[0]).filter(key => 
        typeof data[0][key] === 'string' && data[0][key].length < 50
    );
    
    if (stringFields.length === 0) return [];
    
    const field = stringFields[0];
    const counts = {};
    
    data.forEach(item => {
        const value = item[field] || 'Unknown';
        counts[value] = (counts[value] || 0) + 1;
    });
    
    return Object.entries(counts).map(([key, value]) => ({
        Category: key,
        Count: value
    }));
}

function calculateTCOSummary(data) {
    const summary = [];
    const totalCost = data.reduce((sum, item) => sum + (parseFloat(item.totalCost) || 0), 0);
    
    summary.push({ Metric: 'Total Applications', Value: data.length });
    summary.push({ Metric: 'Total Estimated Cost', Value: `$${totalCost.toLocaleString()}` });
    summary.push({ Metric: 'Average Cost per Application', Value: `$${(totalCost / data.length).toLocaleString()}` });
    
    return summary;
}

function groupByRole(data) {
    const roles = {};
    data.forEach(item => {
        const role = item.role || item.skillType || 'General';
        if (!roles[role]) roles[role] = [];
        roles[role].push(item);
    });
    return roles;
}