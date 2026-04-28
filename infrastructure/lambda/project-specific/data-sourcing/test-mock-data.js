/**
 * Simple test script to verify mock data generation
 * Run with: node test-mock-data.js
 */

// Set environment variable for testing
process.env.USE_MOCK_DATA = 'true';
process.env.PROJECT_ID = 'test-project-123';

// Import the handler
const { handler } = require('./index.js');

async function testMockDataGeneration() {
    console.log('🧪 Testing Mock Data Generation\n');
    
    const categories = [
        'skills',
        'technology-vision', 
        'application-portfolio',
        'application-tech-stack',
        'skills-analysis',
        'pilot-identification',
        'tco-estimates'
    ];
    
    for (const category of categories) {
        console.log(`\n📊 Testing category: ${category}`);
        
        const event = {
            category: category,
            projectId: 'test-project-123',
            exportId: 'test-export-456',
            selectedCategories: [category]
        };
        
        try {
            const result = await handler(event);
            
            if (result.success && result.data) {
                console.log(`✅ ${category}: Generated ${result.recordCount} records`);
                
                // Show sample data structure
                if (result.data.length > 0) {
                    const sampleRecord = result.data[0];
                    const fields = Object.keys(sampleRecord);
                    console.log(`   Fields: ${fields.slice(0, 5).join(', ')}${fields.length > 5 ? '...' : ''}`);
                }
            } else {
                console.log(`❌ ${category}: Failed - ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.log(`❌ ${category}: Exception - ${error.message}`);
        }
    }
    
    console.log('\n🎉 Mock data generation test completed!');
}

// Run the test
testMockDataGeneration().catch(console.error);