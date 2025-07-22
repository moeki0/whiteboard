import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectSettings } from '../components/ProjectSettings';
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
  remove: vi.fn()
}));

describe('ProjectSettings Slug Feature', () => {
  const mockUser: User = {
    uid: 'test-user-id',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: null
  };

  it('should display slug field in project information section', async () => {
    const { get } = await import('firebase/database');
    
    // Mock project data with slug
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        name: 'Test Project',
        slug: 'test-project',
        members: {
          'test-user-id': {
            role: 'owner',
            displayName: 'Test User',
            email: 'test@example.com'
          }
        },
        isPublic: false
      })
    });

    render(
      <MemoryRouter initialEntries={['/projects/test-id/settings']}>
        <ProjectSettings user={mockUser} />
      </MemoryRouter>
    );

    // Wait for loading to complete and check for slug field
    const slugInput = await screen.findByLabelText('Project Slug');
    expect(slugInput).toBeInTheDocument();
    expect(slugInput).toHaveValue('test-project');
  });

  it('should validate slug format', async () => {
    const { get } = await import('firebase/database');
    
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        name: 'Test Project',
        slug: 'test-project',
        members: {
          'test-user-id': {
            role: 'owner',
            displayName: 'Test User',
            email: 'test@example.com'
          }
        },
        isPublic: false
      })
    });

    render(
      <MemoryRouter initialEntries={['/projects/test-id/settings']}>
        <ProjectSettings user={mockUser} />
      </MemoryRouter>
    );

    const slugInput = await screen.findByLabelText('Project Slug');
    expect(slugInput).toHaveAttribute('pattern', '[a-z0-9-]+');
  });

  it('should disable slug editing for non-admins', async () => {
    const { get } = await import('firebase/database');
    
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        name: 'Test Project',
        slug: 'test-project',
        members: {
          'test-user-id': {
            role: 'admin',
            displayName: 'Test User',
            email: 'test@example.com'
          }
        },
        isPublic: false
      })
    });

    render(
      <MemoryRouter initialEntries={['/projects/test-id/settings']}>
        <ProjectSettings user={mockUser} />
      </MemoryRouter>
    );

    const slugInput = await screen.findByLabelText('Project Slug');
    expect(slugInput).not.toBeDisabled();
  });

  it('should show access denied for non-admin members', async () => {
    const { get } = await import('firebase/database');
    
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        name: 'Test Project',
        slug: 'test-project',
        members: {
          'test-user-id': {
            role: 'member',
            displayName: 'Test User',
            email: 'test@example.com'
          }
        },
        isPublic: false
      })
    });

    render(
      <MemoryRouter initialEntries={['/projects/test-id/settings']}>
        <ProjectSettings user={mockUser} />
      </MemoryRouter>
    );

    const accessDeniedHeading = await screen.findByText('Access Denied');
    expect(accessDeniedHeading).toBeInTheDocument();
    expect(screen.getByText('Admin privileges required to access project settings.')).toBeInTheDocument();
  });
});