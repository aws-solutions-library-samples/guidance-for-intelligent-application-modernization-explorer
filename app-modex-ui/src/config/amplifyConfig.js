import { Amplify } from 'aws-amplify';

// Get configuration from environment variables
const getAmplifyConfig = () => {
  const config = {
    Auth: {
      Cognito: {
        userPoolId: process.env.REACT_APP_USER_POOL_ID || '',
        userPoolClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID || '',
        region: process.env.REACT_APP_AWS_REGION || 'us-west-2',
        loginWith: {
          email: true,
          username: true,
        },
        signUpVerificationMethod: 'code',
        userAttributes: {
          email: {
            required: true,
          },
          given_name: {
            required: true,
          },
          family_name: {
            required: true,
          },
        },
        allowGuestAccess: false,
        passwordFormat: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireNumbers: true,
          requireSpecialCharacters: true,
        },
      },
    },
    API: {
      REST: {
        AppModExAPI: {
          endpoint: process.env.REACT_APP_API_URL || '',
          region: process.env.REACT_APP_AWS_REGION || 'us-west-2',
          headers: async () => {
            return {
              'Content-Type': 'application/json',
            };
          },
        },
      },
    },
    Storage: {
      S3: {
        bucket: process.env.REACT_APP_S3_BUCKET || '',
        region: process.env.REACT_APP_AWS_REGION || 'us-west-2',
      }
    }
  };

  // Validate required configuration
  const hasValidUserPool = config.Auth.Cognito.userPoolId && 
    config.Auth.Cognito.userPoolId !== 'placeholder-user-pool-id' && 
    config.Auth.Cognito.userPoolId.trim() !== '';
    
  const hasValidClientId = config.Auth.Cognito.userPoolClientId && 
    config.Auth.Cognito.userPoolClientId !== 'placeholder-client-id' && 
    config.Auth.Cognito.userPoolClientId.trim() !== '';
    
  const hasValidApiUrl = config.API.REST.AppModExAPI.endpoint && 
    config.API.REST.AppModExAPI.endpoint.trim() !== '' &&
    config.API.REST.AppModExAPI.endpoint.startsWith('https://');

  if (!hasValidUserPool) {
    console.error('❌ REACT_APP_USER_POOL_ID is not set, empty, or is placeholder.');
  }
  
  if (!hasValidClientId) {
    console.error('❌ REACT_APP_USER_POOL_CLIENT_ID is not set, empty, or is placeholder.');
  }
  
  if (!hasValidApiUrl) {
    console.error('❌ REACT_APP_API_URL is not set, empty, or invalid. Expected HTTPS URL.');
  }

  // Log successful configuration
  if (hasValidUserPool && hasValidClientId) {
    console.log('✅ Amplify configured for standard authentication (no Hosted UI)');
    console.log('✅ User Pool:', config.Auth.Cognito.userPoolId);
    console.log('✅ Client ID:', config.Auth.Cognito.userPoolClientId);
    console.log('✅ Region:', config.Auth.Cognito.region);
    
    if (hasValidApiUrl) {
      console.log('✅ API URL:', config.API.REST.AppModExAPI.endpoint);
    } else {
      console.warn('⚠️ API URL not configured - API calls will fail');
    }
    
    if (config.Storage.S3.bucket) {
      console.log('✅ S3 Bucket:', config.Storage.S3.bucket);
    } else {
      console.warn('⚠️ S3 Bucket not configured - S3 uploads will use project-specific buckets');
    }
  }

  return config;
};

// Configure Amplify
export const configureAmplify = () => {
  console.log('🔧 Starting Amplify configuration...');
  
  const config = getAmplifyConfig();
  
  try {
    console.log('🔧 Configuring Amplify with the following config:', JSON.stringify(config, null, 2));
    Amplify.configure(config);
    console.log('🚀 Amplify configured successfully');
    
  } catch (error) {
    console.error('❌ Error configuring Amplify:', error);
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
  }
};

// Helper function to validate if Amplify is properly configured
export const isAmplifyConfigured = () => {
  try {
    const config = getAmplifyConfig();
    
    const hasValidUserPool = config.Auth.Cognito.userPoolId && 
      config.Auth.Cognito.userPoolId !== 'placeholder-user-pool-id' && 
      config.Auth.Cognito.userPoolId.trim() !== '';
      
    const hasValidClientId = config.Auth.Cognito.userPoolClientId && 
      config.Auth.Cognito.userPoolClientId !== 'placeholder-client-id' && 
      config.Auth.Cognito.userPoolClientId.trim() !== '';
      
    const hasValidApiUrl = config.API.REST.AppModExAPI.endpoint && 
      config.API.REST.AppModExAPI.endpoint.trim() !== '' &&
      config.API.REST.AppModExAPI.endpoint.startsWith('https://');

    return {
      isValid: hasValidUserPool && hasValidClientId && hasValidApiUrl,
      hasAuth: hasValidUserPool && hasValidClientId,
      hasApi: hasValidApiUrl,
      config: config
    };
  } catch (error) {
    console.error('Error checking Amplify configuration:', error);
    return {
      isValid: false,
      hasAuth: false,
      hasApi: false,
      config: null
    };
  }
};

export { getAmplifyConfig };
