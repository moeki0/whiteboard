import "./StickyNoteCounter.css";

interface StickyNoteCounterProps {
  noteCount: number;
}

export function StickyNoteCounter({ noteCount }: StickyNoteCounterProps) {
  return <div className="sticky-note-counter">{noteCount} Notes</div>;
}
