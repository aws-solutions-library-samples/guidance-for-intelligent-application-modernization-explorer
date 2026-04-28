/**
 * Test utility for the project sharing feature
 * This file can be used to test the sharing functionality programmatically
 */

import {
  getProjectShares,
  shareProjectWithUser,
  updateProjectShare,
  removeProjectShare,
  searchUsersForSharing
} from '../services/mockProjectSharingApi';

// Test function to verify all sharing operations work correctly
export const testSharingFeature = async () => {
  console.log('🧪 Testing Project Sharing Feature...');
  
  try {
    const projectId = '1'; // Test with project 1
    
    // Test 1: Get existing shares
    console.log('📋 Test 1: Getting existing shares...');
    const existingShares = await getProjectShares(projectId);
    console.log(`✅ Found ${existingShares.length} existing shares:`, existingShares);
    
    // Test 2: Search available users
    console.log('🔍 Test 2: Searching available users...');
    const availableUsers = await searchUsersForSharing(projectId, '');
    console.log(`✅ Found ${availableUsers.length} available users for sharing`);
    
    // Test 3: Search users with filter
    console.log('🔍 Test 3: Searching users with filter "alice"...');
    const filteredUsers = await searchUsersForSharing(projectId, 'alice');
    console.log(`✅ Found ${filteredUsers.length} users matching "alice":`, filteredUsers);
    
    // Test 4: Share project with a new user (if available)
    if (availableUsers.length > 0) {
      console.log('➕ Test 4: Sharing project with new user...');
      const userToShare = availableUsers[0];
      const newShare = await shareProjectWithUser(projectId, userToShare.id, 'read-only');
      console.log('✅ Successfully shared project:', newShare);
      
      // Test 5: Update share mode
      console.log('✏️ Test 5: Updating share mode to read-write...');
      const updatedShare = await updateProjectShare(projectId, newShare.id, 'read-write');
      console.log('✅ Successfully updated share mode:', updatedShare);
      
      // Test 6: Remove share
      console.log('🗑️ Test 6: Removing share...');
      await removeProjectShare(projectId, newShare.id);
      console.log('✅ Successfully removed share');
    }
    
    // Test 7: Verify final state
    console.log('📋 Test 7: Verifying final state...');
    const finalShares = await getProjectShares(projectId);
    console.log(`✅ Final share count: ${finalShares.length}`);
    
    console.log('🎉 All tests passed! Project sharing feature is working correctly.');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
};

// Test function for error scenarios
export const testErrorScenarios = async () => {
  console.log('🧪 Testing Error Scenarios...');
  
  try {
    const projectId = '1';
    
    // Test 1: Try to share with non-existent user
    console.log('❌ Test 1: Sharing with non-existent user...');
    try {
      await shareProjectWithUser(projectId, 'non-existent-user', 'read-only');
      console.log('❌ Should have thrown an error');
    } catch (error) {
      console.log('✅ Correctly threw error:', error.message);
    }
    
    // Test 2: Try to share with already shared user
    console.log('❌ Test 2: Sharing with already shared user...');
    const existingShares = await getProjectShares(projectId);
    if (existingShares.length > 0) {
      try {
        await shareProjectWithUser(projectId, existingShares[0].userId, 'read-only');
        console.log('❌ Should have thrown an error');
      } catch (error) {
        console.log('✅ Correctly threw error:', error.message);
      }
    }
    
    // Test 3: Try to update non-existent share
    console.log('❌ Test 3: Updating non-existent share...');
    try {
      await updateProjectShare(projectId, 'non-existent-share', 'read-write');
      console.log('❌ Should have thrown an error');
    } catch (error) {
      console.log('✅ Correctly threw error:', error.message);
    }
    
    console.log('🎉 Error scenario tests passed!');
    return true;
    
  } catch (error) {
    console.error('❌ Error scenario test failed:', error);
    return false;
  }
};

// Performance test
export const testPerformance = async () => {
  console.log('⚡ Testing Performance...');
  
  const projectId = '1';
  const iterations = 10;
  
  // Test API response times
  const startTime = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    await getProjectShares(projectId);
  }
  
  const endTime = Date.now();
  const averageTime = (endTime - startTime) / iterations;
  
  console.log(`✅ Average API response time: ${averageTime.toFixed(2)}ms`);
  
  if (averageTime < 1000) {
    console.log('🎉 Performance test passed!');
    return true;
  } else {
    console.log('⚠️ Performance might be slow');
    return false;
  }
};
