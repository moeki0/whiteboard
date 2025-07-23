import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Header } from '../components/Header';
import { BrowserRouter } from 'react-router-dom';
import { ProjectProvider } from '../contexts/ProjectContext';
import { ReactNode } from 'react';
import { vi } from 'vitest';

const mockUser = {
  uid: 'test-uid',
  displayName: 'Test User',
  email: 'test@example.com',
};

// Mock useProject hook to return a project ID
vi.mock('../contexts/ProjectContext', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useProject: () => ({
      currentProjectId: 'test-project-id',
      setCurrentProjectId: vi.fn(),
    }),
  };
});

// Mock Algolia search
vi.mock('../config/algolia', () => ({
  boardsSearchIndex: {
    search: vi.fn().mockResolvedValue({
      hits: [
        {
          objectID: '1',
          title: 'Test Board',
          name: 'Test Board',
          description: 'Test Description',
          projectSlug: 'test-project',
        }
      ]
    })
  },
  boardsAdminIndex: null,
  searchConfig: {},
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

interface HeaderWithProvidersProps {
  children?: ReactNode;
  showSearch?: boolean;
}

const HeaderWithProviders = ({ children, showSearch = false }: HeaderWithProvidersProps) => (
  <BrowserRouter>
    <ProjectProvider>
      <Header showSearch={showSearch} user={mockUser}>
        {children}
      </Header>
    </ProjectProvider>
  </BrowserRouter>
);

describe('Header Search', () => {
  test('renders search input in header', () => {
    render(<HeaderWithProviders showSearch={true} />);
    
    const searchInput = screen.getByPlaceholderText('Search boards...');
    expect(searchInput).toBeInTheDocument();
  });

  test('shows dropdown when typing in search', async () => {
    render(<HeaderWithProviders showSearch={true} />);
    
    const searchInput = screen.getByPlaceholderText('Search boards...');
    fireEvent.change(searchInput, { target: { value: 'test' } });
    
    // Wait for debounced search
    await waitFor(() => {
      expect(screen.queryByTestId('search-dropdown')).toBeInTheDocument();
    }, { timeout: 500 });
  });

  test('navigates dropdown with arrow keys', async () => {
    render(<HeaderWithProviders showSearch={true} />);
    
    const searchInput = screen.getByPlaceholderText('Search boards...');
    fireEvent.change(searchInput, { target: { value: 'test' } });
    
    await waitFor(() => {
      expect(screen.queryByTestId('search-dropdown')).toBeInTheDocument();
    }, { timeout: 500 });

    // Navigate down with arrow key
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    
    const firstItem = screen.getByText('Test Board').closest('.search-dropdown-item');
    expect(firstItem).toHaveClass('selected');
  });

  test('navigates dropdown with Emacs keybindings', async () => {
    render(<HeaderWithProviders showSearch={true} />);
    
    const searchInput = screen.getByPlaceholderText('Search boards...');
    fireEvent.change(searchInput, { target: { value: 'test' } });
    
    await waitFor(() => {
      expect(screen.queryByTestId('search-dropdown')).toBeInTheDocument();
    }, { timeout: 500 });

    // Navigate down with Ctrl+n
    fireEvent.keyDown(searchInput, { key: 'n', ctrlKey: true });
    
    const firstItem = screen.getByText('Test Board').closest('.search-dropdown-item');
    expect(firstItem).toHaveClass('selected');
  });

  test('selects item with Enter key', async () => {
    render(<HeaderWithProviders showSearch={true} />);
    
    const searchInput = screen.getByPlaceholderText('Search boards...');
    fireEvent.change(searchInput, { target: { value: 'test' } });
    
    await waitFor(() => {
      expect(screen.queryByTestId('search-dropdown')).toBeInTheDocument();
    }, { timeout: 500 });

    // Navigate down and select
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    
    expect(mockNavigate).toHaveBeenCalledWith('/test-project/Test%20Board');
  });

  test('shows search icon on mobile', () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 600,
    });

    // Trigger resize to apply mobile styles
    window.dispatchEvent(new Event('resize'));

    render(<HeaderWithProviders showSearch={true} />);
    
    const searchIcon = screen.getByTestId('mobile-search-icon');
    expect(searchIcon).toBeInTheDocument();
  });

  test('toggles mobile search bar when icon is clicked', () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 600,
    });

    // Trigger resize to apply mobile styles
    window.dispatchEvent(new Event('resize'));

    render(<HeaderWithProviders showSearch={true} />);
    
    const searchIcon = screen.getByTestId('mobile-search-icon');
    fireEvent.click(searchIcon);
    
    const mobileSearchBar = screen.getByTestId('mobile-search-bar');
    expect(mobileSearchBar).toBeInTheDocument();
  });

  test('focuses search input with Cmd+G on desktop', () => {
    // Mock desktop viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    render(<HeaderWithProviders showSearch={true} />);
    
    // Get desktop search input (the one in the header)
    const desktopSearchInput = document.querySelector('.header-search-input') as HTMLInputElement;
    expect(desktopSearchInput).toBeInTheDocument();
    
    // Simulate Cmd+G keydown event
    fireEvent.keyDown(document, { key: 'g', metaKey: true });
    
    expect(desktopSearchInput).toHaveFocus();
  });

  test('opens mobile search with Cmd+G on mobile', () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 600,
    });

    window.dispatchEvent(new Event('resize'));

    render(<HeaderWithProviders showSearch={true} />);
    
    // Simulate Cmd+G keydown event
    fireEvent.keyDown(document, { key: 'g', metaKey: true });
    
    const mobileSearchBar = screen.getByTestId('mobile-search-bar');
    expect(mobileSearchBar).toBeInTheDocument();
  });
});