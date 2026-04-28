/**
 * Tests for export error logger
 */

import {
  categorizeError,
  determineSeverity,
  createErrorLogEntry,
  ERROR_CATEGORIES,
  ERROR_SEVERITY
} from '../exportErrorLogger';

describe('Export Error Logger', () => {
  describe('categorizeError', () => {
    it('should categorize network errors', () => {
      const networkError = new Error('Network connection failed');
      expect(categorizeError(networkError)).toBe(ERROR_CATEGORIES.NETWORK);
    });

    it('should categorize authentication errors', () => {
      const authError = { status: 401, message: 'Unauthorized' };
      expect(categorizeError(authError)).toBe(ERROR_CATEGORIES.AUTHENTICATION);
    });

    it('should categorize authorization errors', () => {
      const authzError = { status: 403, message: 'Forbidden' };
      expect(categorizeError(authzError)).toBe(ERROR_CATEGORIES.AUTHORIZATION);
    });

    it('should categorize validation errors', () => {
      const validationError = { status: 400, message: 'Invalid request' };
      expect(categorizeError(validationError)).toBe(ERROR_CATEGORIES.VALIDATION);
    });

    it('should categorize rate limit errors', () => {
      const rateLimitError = { status: 429, message: 'Too many requests' };
      expect(categorizeError(rateLimitError)).toBe(ERROR_CATEGORIES.RATE_LIMIT);
    });

    it('should categorize timeout errors', () => {
      const timeoutError = { status: 408, message: 'Request timeout' };
      expect(categorizeError(timeoutError)).toBe(ERROR_CATEGORIES.TIMEOUT);
    });

    it('should categorize server errors', () => {
      const serverError = { status: 500, message: 'Internal server error' };
      expect(categorizeError(serverError)).toBe(ERROR_CATEGORIES.SERVER);
    });

    it('should categorize client errors', () => {
      const clientError = { status: 404, message: 'Not found' };
      expect(categorizeError(clientError)).toBe(ERROR_CATEGORIES.CLIENT);
    });

    it('should categorize unknown errors', () => {
      const unknownError = { message: 'Something went wrong' };
      expect(categorizeError(unknownError)).toBe(ERROR_CATEGORIES.UNKNOWN);
    });
  });

  describe('determineSeverity', () => {
    it('should assign critical severity to server errors', () => {
      const serverError = { status: 500, message: 'Server error' };
      expect(determineSeverity(serverError)).toBe(ERROR_SEVERITY.CRITICAL);
    });

    it('should assign high severity to auth errors', () => {
      const authError = { status: 401, message: 'Unauthorized' };
      expect(determineSeverity(authError)).toBe(ERROR_SEVERITY.HIGH);
    });

    it('should assign medium severity to network errors', () => {
      const networkError = new Error('Network error');
      expect(determineSeverity(networkError)).toBe(ERROR_SEVERITY.MEDIUM);
    });

    it('should assign low severity to validation errors', () => {
      const validationError = { status: 400, message: 'Bad request' };
      expect(determineSeverity(validationError)).toBe(ERROR_SEVERITY.LOW);
    });
  });

  describe('createErrorLogEntry', () => {
    beforeEach(() => {
      // Mock navigator and window for testing
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'test-agent' },
        writable: true
      });
      
      Object.defineProperty(global, 'window', {
        value: { location: { href: 'http://test.com' } },
        writable: true
      });

      // Mock sessionStorage
      const mockSessionStorage = {
        getItem: jest.fn(),
        setItem: jest.fn()
      };
      Object.defineProperty(global, 'sessionStorage', {
        value: mockSessionStorage,
        writable: true
      });
    });

    it('should create structured error log entry', () => {
      const error = new Error('Test error');
      error.status = 500;
      
      const context = {
        component: 'TestComponent',
        operation: 'testOperation',
        userId: 'user123',
        projectId: 'project456'
      };

      const logEntry = createErrorLogEntry(error, context);

      expect(logEntry).toMatchObject({
        message: 'Test error',
        name: 'Error',
        status: 500,
        category: ERROR_CATEGORIES.SERVER,
        severity: ERROR_SEVERITY.CRITICAL,
        context: expect.objectContaining({
          component: 'TestComponent',
          operation: 'testOperation',
          userId: 'user123',
          projectId: 'project456'
        }),
        environment: expect.objectContaining({
          userAgent: 'test-agent',
          url: 'http://test.com',
          timestamp: expect.any(String)
        }),
        metadata: expect.objectContaining({
          errorId: expect.any(String),
          correlationId: expect.any(String)
        })
      });
    });

    it('should handle errors without status', () => {
      const error = new Error('Simple error');
      const logEntry = createErrorLogEntry(error);

      expect(logEntry.status).toBeUndefined();
      expect(logEntry.category).toBe(ERROR_CATEGORIES.UNKNOWN);
    });

    it('should include stack trace when available', () => {
      const error = new Error('Error with stack');
      const logEntry = createErrorLogEntry(error);

      expect(logEntry.stack).toBeDefined();
    });
  });
});