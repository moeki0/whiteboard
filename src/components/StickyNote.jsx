import { useState, useRef, useEffect } from 'react';

export function StickyNote({ note, onUpdate, onDelete, yDoc }) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [position, setPosition] = useState({ x: note.x, y: note.y });
  const [isDragging, setIsDragging] = useState(false);
  const noteRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setContent(note.content);
    setPosition({ x: note.x, y: note.y });
  }, [note]);

  const handleMouseDown = (e) => {
    if (e.target.classList.contains('note-header')) {
      setIsDragging(true);
      const rect = noteRef.current.getBoundingClientRect();
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;
      setPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      onUpdate(note.id, { x: position.x, y: position.y });
    }
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, position]);

  const handleContentChange = (e) => {
    setContent(e.target.value);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (content !== note.content) {
      onUpdate(note.id, { content });
    }
  };

  const handleDelete = () => {
    onDelete(note.id);
  };

  return (
    <div
      ref={noteRef}
      className="sticky-note"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        backgroundColor: note.color || '#ffeb3b'
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="note-header">
        <button className="delete-btn" onClick={handleDelete}>×</button>
      </div>
      <div className="note-content">
        {isEditing ? (
          <textarea
            value={content}
            onChange={handleContentChange}
            onBlur={handleBlur}
            autoFocus
          />
        ) : (
          <div onClick={() => setIsEditing(true)}>
            {content || 'Click to edit...'}
          </div>
        )}
      </div>
    </div>
  );
}