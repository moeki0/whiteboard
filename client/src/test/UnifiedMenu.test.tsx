import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { UnifiedMenu } from "../components/UnifiedMenu";
import { User } from "../types";

// Firebase のモック
vi.mock("../config/firebase", () => ({
  auth: {},
  rtdb: {},
}));

// react-router-dom のモック
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useLocation: () => ({
      pathname: "/test-project",
    }),
  };
});

// Context のモック
vi.mock("../contexts/ProjectContext", () => ({
  useProject: () => ({
    currentProjectId: "project1",
  }),
}));

vi.mock("../contexts/SlugContext", () => ({
  useSlug: () => ({
    resolvedBoardId: null,
  }),
}));

// firebase/database のモック
vi.mock("firebase/database", () => ({
  ref: vi.fn(),
  onValue: vi.fn((ref, callback) => {
    // モックデータでコールバックを実行
    callback({
      val: () => ({
        project1: {
          name: "Test Project",
          slug: "test-project",
          createdBy: "owner1",
          createdAt: Date.now(),
          isPublic: false,
          members: {
            owner1: {
              role: "owner",
              displayName: "Owner User",
              email: "owner@test.com",
              joinedAt: Date.now(),
            },
            admin1: {
              role: "admin",
              displayName: "Admin User",
              email: "admin@test.com",
              joinedAt: Date.now(),
            },
            member1: {
              role: "member",
              displayName: "Member User",
              email: "member@test.com",
              joinedAt: Date.now(),
            },
          },
        },
      }),
    });
    return () => {}; // unsubscribe function
  }),
  get: vi.fn(() => Promise.resolve({
    exists: () => true,
    val: () => ({
      name: "Test Project",
      slug: "test-project",
      createdBy: "owner1",
      createdAt: Date.now(),
      isPublic: false,
      members: {
        owner1: {
          role: "owner",
          displayName: "Owner User",
          email: "owner@test.com",
          joinedAt: Date.now(),
        },
        admin1: {
          role: "admin",
          displayName: "Admin User",
          email: "admin@test.com",
          joinedAt: Date.now(),
        },
        member1: {
          role: "member",
          displayName: "Member User",
          email: "member@test.com",
          joinedAt: Date.now(),
        },
      },
    }),
  })),
}));

// firebase/auth のモック
vi.mock("firebase/auth", () => ({
  signOut: vi.fn(),
}));

const mockOwnerUser: User = {
  uid: "owner1",
  displayName: "Owner User",
  email: "owner@test.com",
};

const mockAdminUser: User = {
  uid: "admin1",
  displayName: "Admin User",
  email: "admin@test.com",
};

const mockMemberUser: User = {
  uid: "member1",
  displayName: "Member User",
  email: "member@test.com",
};

const mockNonMemberUser: User = {
  uid: "nonmember",
  displayName: "Non Member User",
  email: "nonmember@test.com",
};

describe("UnifiedMenu - Project Settings 権限チェック", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderUnifiedMenu = (user: User) => {
    return render(
      <BrowserRouter>
        <UnifiedMenu user={user} />
      </BrowserRouter>
    );
  };

  it("プロジェクトオーナーには Project Settings メニューが表示される", async () => {
    renderUnifiedMenu(mockOwnerUser);
    
    // メニューを開く
    const menuTrigger = screen.getByRole("button");
    fireEvent.click(menuTrigger);
    
    // 非同期処理を待つ
    await waitFor(() => {
      expect(screen.getByText("Project Settings")).toBeInTheDocument();
    });
  });

  it("プロジェクト管理者には Project Settings メニューが表示される", async () => {
    renderUnifiedMenu(mockAdminUser);
    
    // メニューを開く
    const menuTrigger = screen.getByRole("button");
    fireEvent.click(menuTrigger);
    
    // 非同期処理を待つ
    await waitFor(() => {
      expect(screen.getByText("Project Settings")).toBeInTheDocument();
    });
  });

  it("プロジェクトメンバーには Project Settings メニューが表示されない", async () => {
    renderUnifiedMenu(mockMemberUser);
    
    // メニューを開く
    const menuTrigger = screen.getByRole("button");
    fireEvent.click(menuTrigger);
    
    // 非同期処理を待つ
    await waitFor(() => {
      expect(screen.queryByText("Project Settings")).not.toBeInTheDocument();
    });
  });

  it("非メンバーには Project Settings メニューが表示されない", async () => {
    renderUnifiedMenu(mockNonMemberUser);
    
    // メニューを開く
    const menuTrigger = screen.getByRole("button");
    fireEvent.click(menuTrigger);
    
    // 非同期処理を待つ
    await waitFor(() => {
      expect(screen.queryByText("Project Settings")).not.toBeInTheDocument();
    });
  });
});