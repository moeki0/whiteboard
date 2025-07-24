import { render, screen, fireEvent } from "@testing-library/react";
import { Minimap } from "../components/Minimap";
import { Note } from "../types";

describe("Minimap", () => {
  const mockNotes: Note[] = [
    {
      id: "note1",
      type: "note",
      x: 100,
      y: 200,
      width: "160",
      content: "Test note 1",
      zIndex: 1,
      color: "#ffeb3b",
      createdAt: Date.now(),
      userId: "user1",
    },
    {
      id: "note2",
      type: "note",
      x: 300,
      y: 400,
      width: "160",
      content: "Test note 2",
      zIndex: 2,
      color: "#e3f2fd",
      createdAt: Date.now(),
      userId: "user2",
    },
  ];

  const defaultProps = {
    notes: mockNotes,
    viewportX: 0,
    viewportY: 0,
    viewportWidth: 800,
    viewportHeight: 600,
    zoom: 1,
    onViewportChange: vi.fn(),
    unreadNoteIds: new Set<string>(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render minimap with notes", () => {
    render(<Minimap {...defaultProps} />);
    expect(screen.getByTestId("minimap")).toBeInTheDocument();
  });

  it("should call onViewportChange when clicked", () => {
    const mockOnViewportChange = vi.fn();
    render(
      <Minimap {...defaultProps} onViewportChange={mockOnViewportChange} />
    );

    const minimap = screen.getByTestId("minimap");
    fireEvent.mouseDown(minimap, { clientX: 50, clientY: 50 });

    expect(mockOnViewportChange).toHaveBeenCalled();
  });

  it("should render without notes", () => {
    render(<Minimap {...defaultProps} notes={[]} />);
    expect(screen.getByTestId("minimap")).toBeInTheDocument();
  });

  it("should have fixed position at bottom left", () => {
    render(<Minimap {...defaultProps} />);
    const minimap = screen.getByTestId("minimap");

    expect(minimap).toHaveStyle({
      position: "fixed",
      bottom: "36px",
      left: "8px",
    });
  });

  it("should highlight large notes with asterisk", () => {
    const largeNote: Note = {
      id: "largeNote",
      type: "note",
      x: 500,
      y: 300,
      width: "200",
      content: "* Important Title\nSome content",
      zIndex: 3,
      color: "#ffeb3b",
      createdAt: Date.now(),
      userId: "user3",
    };

    const { container } = render(
      <Minimap {...defaultProps} notes={[...mockNotes, largeNote]} />
    );

    // 大文字付箋は黒い背景色（#333）を持つ
    const largeNoteElement = container.querySelector(
      '[style*="background-color: rgb(51, 51, 51)"]'
    );
    expect(largeNoteElement).toBeInTheDocument();
  });

  it("should not highlight notes with media URLs", () => {
    const mediaNote: Note = {
      id: "mediaNote",
      type: "note",
      x: 600,
      y: 400,
      width: "200",
      content: "* https://gyazo.com/image.png",
      zIndex: 4,
      color: "#ffeb3b",
      createdAt: Date.now(),
      userId: "user4",
    };

    const { container } = render(
      <Minimap {...defaultProps} notes={[mediaNote]} />
    );

    // メディアURLの付箋は通常の色
    const mediaElement = container.querySelector(
      '[style*="background-color: rgb(255, 87, 34)"]'
    );
    expect(mediaElement).not.toBeInTheDocument();
  });

  it("should show unread marker on unread notes", () => {
    const unreadNoteIds = new Set(["note1"]);

    const { container } = render(
      <Minimap {...defaultProps} unreadNoteIds={unreadNoteIds} />
    );

    // 未読マーカーが表示されていることを確認
    const unreadMarker = container.querySelector(
      '[style*="background-color: rgb(76, 175, 80)"]'
    );
    expect(unreadMarker).toBeInTheDocument();
    expect(unreadMarker).toHaveStyle({
      width: "4px",
      height: "4px",
      borderRadius: "50%",
    });
  });

  it("should not show unread marker on read notes", () => {
    const unreadNoteIds = new Set<string>();

    const { container } = render(
      <Minimap {...defaultProps} unreadNoteIds={unreadNoteIds} />
    );

    // 未読マーカーが表示されていないことを確認
    const unreadMarker = container.querySelector(
      '[style*="background-color: rgb(76, 175, 80)"]'
    );
    expect(unreadMarker).not.toBeInTheDocument();
  });
});
