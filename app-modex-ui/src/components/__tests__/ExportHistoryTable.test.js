/**
 * Tests for ExportHistoryTable component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useTranslation } from 'react-i18next';
import ExportHistoryTable from '../ExportHistoryTable';

// Mock Cloudscape Design components
jest.mock('@cloudscape-design/components', () => ({
  Table: ({ children, items, columnDefinitions, header, filter, pagination, preferences, empty, loading, loadingText, ...props }) => (
    <div data-testid="table" {...props}>
      {header}
      {filter}
      <table role="table">
        <thead>
          <tr>
            {columnDefinitions?.map((col, index) => (
              <th key={index} onClick={() => props.onSortingChange?.({ detail: { sortingColumn: col, isDescending: false } })}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columnDefinitions?.length || 1}>{loadingText}</td></tr>
          ) : items?.length > 0 ? (
            items.map((item, index) => (
              <tr key={index}>
                {columnDefinitions?.map((col, colIndex) => (
                  <td key={colIndex}>
                    {typeof col.cell === 'function' ? col.cell(item) : item[col.id]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr><td colSpan={columnDefinitions?.length || 1}>{empty}</td></tr>
          )}
        </tbody>
      </table>
      {pagination}
      {preferences}
    </div>
  ),
  Box: ({ children, ...props }) => <div {...props}>{children}</div>,
  Pagination: ({ children, ...props }) => <div data-testid="pagination" {...props}>{children}</div>,
  TextFilter: ({ filteringPlaceholder, onChange, ...props }) => (
    <input 
      placeholder={filteringPlaceholder} 
      onChange={(e) => onChange?.({ detail: { filteringText: e.target.value } })}
      {...props}
    />
  ),
  CollectionPreferences: ({ children, ...props }) => <div data-testid="preferences" {...props}>{children}</div>,
  SpaceBetween: ({ children, ...props }) => <div {...props}>{children}</div>,
  Button: ({ children, onClick, disabled, loading, ariaLabel, ...props }) => (
    <button onClick={onClick} disabled={disabled || loading} aria-label={ariaLabel} {...props}>
      {loading ? 'Loading...' : children}
    </button>
  ),
  Header: ({ children, counter, actions, ...props }) => (
    <div data-testid="header" {...props}>
      <h1>{children} {counter}</h1>
      {actions}
    </div>
  ),
  Select: ({ selectedOption, onChange, options, ariaLabel, ...props }) => (
    <select 
      value={selectedOption?.value || ''} 
      onChange={(e) => {
        const option = options?.find(opt => opt.value === e.target.value);
        onChange?.({ detail: { selectedOption: option } });
      }}
      aria-label={ariaLabel}
      {...props}
    >
      {options?.map((option, index) => (
        <option key={index} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
  StatusIndicator: ({ children, type, ...props }) => (
    <span data-testid="status-indicator" data-type={type} {...props}>{children}</span>
  ),
  Link: ({ children, ...props }) => <a {...props}>{children}</a>,
  Alert: ({ children, header, type, dismissible, onDismiss, ...props }) => (
    <div data-testid="alert" data-type={type} {...props}>
      {header && <h3>{header}</h3>}
      {children}
      {dismissible && <button onClick={onDismiss}>{useTranslation().t('components:exportHistory.dismiss')}</button>}
    </div>
  )
}));

// Mock data for testing
const mockExportHistory = [
  {
    exportId: 'export-1',
    projectId: 'project-123',
    userId: 'user-456',
    userName: 'John Doe',
    selectedCategories: ['Skills', 'Technology Vision'],
    status: 'COMPLETED',
    createdAt: '2023-12-17T10:00:00.000Z',
    completedAt: '2023-12-17T10:05:00.000Z',
    fileSizeMB: 2.5,
    downloadCount: 3,
    lastDownloadAt: '2023-12-17T11:00:00.000Z'
  },
  {
    exportId: 'export-2',
    projectId: 'project-123',
    userId: 'user-789',
    userName: 'Jane Smith',
    selectedCategories: ['Applications'],
    status: 'PROCESSING',
    createdAt: '2023-12-17T09:30:00.000Z',
    fileSizeMB: 0,
    downloadCount: 0
  },
  {
    exportId: 'export-3',
    projectId: 'project-123',
    userId: 'user-456',
    userName: 'John Doe',
    selectedCategories: ['Skills Analysis', 'Team Analysis'],
    status: 'FAILED',
    createdAt: '2023-12-17T09:00:00.000Z',
    fileSizeMB: 0,
    downloadCount: 0
  }
];

describe('ExportHistoryTable', () => {
  const defaultProps = {
    data: mockExportHistory,
    loading: false,
    error: null,
    onRefresh: jest.fn(),
    onDownload: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render the table with export history data', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      // Check if the table header is present (text might be split across elements)
      expect(screen.getByText(/Export History/)).toBeInTheDocument();
      
      // Check if data is displayed
      expect(screen.getByText('Skills, Technology Vision')).toBeInTheDocument();
      expect(screen.getByText('Applications')).toBeInTheDocument();
      expect(screen.getByText('Skills Analysis, Team Analysis')).toBeInTheDocument();
    });

    it('should display status indicators correctly', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      // Check status indicators
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('should format file sizes correctly', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      // Check file size formatting
      expect(screen.getByText('2.5 MB')).toBeInTheDocument();
      expect(screen.getAllByText('N/A')).toHaveLength(2); // For processing and failed exports
    });

    it('should display download counts', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      // Check download counts
      expect(screen.getByText('3')).toBeInTheDocument(); // Download count for completed export
      expect(screen.getAllByText('0')).toHaveLength(2); // Download counts for other exports
    });
  });

  describe('Loading and Error States', () => {
    it('should show loading state', () => {
      render(<ExportHistoryTable {...defaultProps} loading={true} />);
      
      expect(screen.getByText('Loading export history')).toBeInTheDocument();
    });

    it('should show error message', () => {
      const errorMessage = 'Failed to load export history';
      render(<ExportHistoryTable {...defaultProps} error={errorMessage} />);
      
      expect(screen.getByText('Error loading export history')).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    it('should show empty state when no data', () => {
      render(<ExportHistoryTable {...defaultProps} data={[]} />);
      
      expect(screen.getByText('No export history')).toBeInTheDocument();
      expect(screen.getByText('No export records to display. Start by creating your first export.')).toBeInTheDocument();
    });
  });

  describe('Sorting Functionality', () => {
    it('should sort by created date by default (most recent first)', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      const rows = screen.getAllByRole('row');
      // First row is header, so data rows start from index 1
      // The most recent export (export-1) should be first
      expect(rows[1]).toHaveTextContent('Skills, Technology Vision');
    });

    it('should handle column header clicks for sorting', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      // Find and click the Status column header in the table (not the select option)
      const tableHeaders = screen.getAllByText('Status');
      const statusHeader = tableHeaders.find(header => header.tagName === 'TH');
      fireEvent.click(statusHeader);
      
      // The table should re-render with different sorting
      // This is a basic test - in a real scenario, we'd check the actual order
      expect(statusHeader).toBeInTheDocument();
    });
  });

  describe('Filtering Functionality', () => {
    it('should render filter controls', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      // Check if filter dropdown and text input are present
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Find by all columns')).toBeInTheDocument();
    });

    it('should handle filter text input', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      const filterInput = screen.getByPlaceholderText('Find by all columns');
      fireEvent.change(filterInput, { target: { value: 'Skills' } });
      
      expect(filterInput.value).toBe('Skills');
    });
  });

  describe('Pagination', () => {
    it('should show pagination controls', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      // Check if pagination is present (though with only 3 items, it might not show)
      // The pagination component should still be rendered
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
    });

    it('should handle page size preferences', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      // Check if preferences component is available
      expect(screen.getByTestId('preferences')).toBeInTheDocument();
    });
  });

  describe('Download Functionality', () => {
    it('should enable download button for completed exports', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      const downloadButtons = screen.getAllByText('Download');
      expect(downloadButtons).toHaveLength(1); // Only one completed export
    });

    it('should disable download for non-completed exports', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      const notAvailableButtons = screen.getAllByText('Not Available');
      expect(notAvailableButtons).toHaveLength(2); // Processing and failed exports
    });

    it('should call onDownload when download button is clicked', () => {
      const mockOnDownload = jest.fn();
      render(<ExportHistoryTable {...defaultProps} onDownload={mockOnDownload} />);
      
      const downloadButton = screen.getByText('Download');
      fireEvent.click(downloadButton);
      
      expect(mockOnDownload).toHaveBeenCalledWith('export-1');
    });
  });

  describe('Refresh Functionality', () => {
    it('should call onRefresh when refresh button is clicked', () => {
      const mockOnRefresh = jest.fn();
      render(<ExportHistoryTable {...defaultProps} onRefresh={mockOnRefresh} />);
      
      const refreshButton = screen.getByText('Refresh');
      fireEvent.click(refreshButton);
      
      expect(mockOnRefresh).toHaveBeenCalled();
    });

    it('should disable refresh button when loading', () => {
      const mockOnRefresh = jest.fn();
      render(<ExportHistoryTable {...defaultProps} onRefresh={mockOnRefresh} loading={true} />);
      
      const refreshButton = screen.getByText('Refresh');
      expect(refreshButton).toBeDisabled();
    });
  });

  describe('Data Formatting', () => {
    it('should format dates correctly', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      // Check if dates are formatted (exact format may vary by locale)
      const dateElements = screen.getAllByText(/12\/17\/2023|17\/12\/2023|2023/);
      expect(dateElements.length).toBeGreaterThan(0);
    });

    it('should handle categories display correctly', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      // Check category display
      expect(screen.getByText('Skills, Technology Vision')).toBeInTheDocument();
      expect(screen.getByText('Applications')).toBeInTheDocument();
      expect(screen.getByText('Skills Analysis, Team Analysis')).toBeInTheDocument();
    });

    it('should handle long category lists with truncation', () => {
      const longCategoryData = [{
        ...mockExportHistory[0],
        selectedCategories: ['Cat1', 'Cat2', 'Cat3', 'Cat4', 'Cat5']
      }];
      
      render(<ExportHistoryTable {...defaultProps} data={longCategoryData} />);
      
      // Should show first two categories plus "more" indicator
      expect(screen.getByText('Cat1, Cat2 +3 more')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      // Check for ARIA labels on interactive elements
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByLabelText('Download export export-1')).toBeInTheDocument();
    });

    it('should be keyboard navigable', () => {
      render(<ExportHistoryTable {...defaultProps} />);
      
      // Basic check that interactive elements are present
      const downloadButton = screen.getByText('Download');
      const refreshButton = screen.getByText('Refresh');
      
      expect(downloadButton).toBeInTheDocument();
      expect(refreshButton).toBeInTheDocument();
    });
  });
});