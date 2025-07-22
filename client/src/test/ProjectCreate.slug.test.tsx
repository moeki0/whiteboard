import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectCreate } from '../components/ProjectCreate';
import { MemoryRouter } from 'react-router-dom';
import { User } from '../types';

// Mock Firebase
vi.mock('../config/firebase', () => ({
  rtdb: {}
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  query: vi.fn(),
  orderByChild: vi.fn(),
  equalTo: vi.fn()
}));

// Mock nanoid
vi.mock('nanoid', () => ({
  customAlphabet: vi.fn(() => () => 'mock-project-id')
}));

// Mock ProjectContext
vi.mock('../contexts/ProjectContext', () => ({
  useProject: () => ({
    updateCurrentProject: vi.fn()
  })
}));

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('ProjectCreate Slug Saving', () => {
  const mockUser: User = {
    uid: 'test-user-id',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should save custom slug when user enters it manually', async () => {
    const { get, set } = await import('firebase/database');
    
    // Mock slug availability check - slug is available
    vi.mocked(get).mockResolvedValue({
      exists: () => false,
      val: () => null
    });

    const mockSetCalls: unknown[] = [];
    vi.mocked(set).mockImplementation((...args) => {
      mockSetCalls.push(args);
      return Promise.resolve();
    });

    render(
      <MemoryRouter>
        <ProjectCreate user={mockUser} />
      </MemoryRouter>
    );

    // Enter project name
    const nameInput = screen.getByLabelText('Project Name');
    fireEvent.change(nameInput, { target: { value: 'My Test Project' } });

    // Wait for auto-generated slug
    await waitFor(() => {
      expect(screen.getByDisplayValue('my-test-project')).toBeInTheDocument();
    });

    // Change the slug to a custom value
    const slugInput = screen.getByLabelText(/Project URL/);
    fireEvent.change(slugInput, { target: { value: 'custom-slug' } });

    // Wait for validation
    await waitFor(() => {
      expect(screen.getByText('✓ Available')).toBeInTheDocument();
    });

    // Create the project
    const createButton = screen.getByText('Create Project');
    fireEvent.click(createButton);

    // Wait for project creation
    await waitFor(() => {
      expect(mockSetCalls.length).toBeGreaterThan(0);
    });

    // Find the project creation call
    const projectCreationCall = mockSetCalls.find(call => {
      const [, data] = call as [unknown, Record<string, unknown>];
      return data && typeof data === 'object' && data.slug && data.name;
    });

    expect(projectCreationCall).toBeDefined();
    if (projectCreationCall) {
      const [, data] = projectCreationCall as [unknown, Record<string, unknown>];
      expect(data).toBeDefined();
      expect(data.slug).toBe('custom-slug');
      expect(data.name).toBe('My Test Project');
    }
  });

});