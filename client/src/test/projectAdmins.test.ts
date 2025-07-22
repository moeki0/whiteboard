import { describe, it, expect } from 'vitest';
import { Project } from '../types';
import { isProjectAdmin } from '../utils/permissions';

describe('Project Admin Functionality', () => {
  const mockProject: Project = {
    id: 'test-project',
    name: 'Test Project',
    slug: 'test-project',
    createdBy: 'creator-uid',
    createdAt: Date.now(),
    isPublic: false,
    members: {
      'creator-uid': {
        role: 'owner',
        displayName: 'Creator',
        email: 'creator@example.com',
        joinedAt: Date.now()
      },
      'admin-uid': {
        role: 'admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        joinedAt: Date.now()
      },
      'member-uid': {
        role: 'member',
        displayName: 'Regular Member',
        email: 'member@example.com',
        joinedAt: Date.now()
      }
    }
  };

  describe('isProjectAdmin', () => {
    it('should return true for project creator', () => {
      expect(isProjectAdmin(mockProject, 'creator-uid')).toBe(true);
    });

    it('should return true for admin role', () => {
      expect(isProjectAdmin(mockProject, 'admin-uid')).toBe(true);
    });

    it('should return false for regular member', () => {
      expect(isProjectAdmin(mockProject, 'member-uid')).toBe(false);
    });

    it('should return false for non-member', () => {
      expect(isProjectAdmin(mockProject, 'non-member-uid')).toBe(false);
    });
  });
});