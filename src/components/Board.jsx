import { useState, useEffect } from "react";
import { StickyNote } from "./StickyNote";
import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export function Board({ user }) {
  const [notes, setNotes] = useState([]);
  const [yDoc] = useState(() => new Y.Doc());
  const [provider, setProvider] = useState(null);

  useEffect(() => {
    // Initialize Yjs
    const yNotes = yDoc.getMap("notes");

    // Connect to WebSocket provider
    const wsProvider = new WebsocketProvider(
      "wss://demos.yjs.dev", // You can replace with your own WebSocket server
      `maplap-${user.uid}`, // Room name based on user ID
      yDoc
    );

    setProvider(wsProvider);

    // Sync initial state
    const syncNotes = () => {
      const notesArray = [];
      yNotes.forEach((value, key) => {
        notesArray.push({ id: key, ...value });
      });
      setNotes(notesArray);
    };

    // Observe changes
    yNotes.observe(syncNotes);
    syncNotes();

    return () => {
      wsProvider.destroy();
      yNotes.unobserve(syncNotes);
    };
  }, [yDoc, user.uid]);

  const addNote = () => {
    const newNote = {
      content: "",
      x: Math.random() * (window.innerWidth - 250),
      y: Math.random() * (window.innerHeight - 250),
      color: "#ffeb3b",
      userId: user.uid,
      createdAt: Date.now(),
    };

    const noteId = uuidv4();
    const yNotes = yDoc.getMap("notes");
    yNotes.set(noteId, newNote);
  };

  const updateNote = (noteId, updates) => {
    const yNotes = yDoc.getMap("notes");
    const note = yNotes.get(noteId);
    if (note) {
      yNotes.set(noteId, { ...note, ...updates });
    }
  };

  const deleteNote = (noteId) => {
    const yNotes = yDoc.getMap("notes");
    yNotes.delete(noteId);
  };

  return (
    <div className="board">
      <div className="notes-container">
        {notes.map((note) => (
          <StickyNote
            key={note.id}
            note={note}
            onUpdate={updateNote}
            onDelete={deleteNote}
            yDoc={yDoc}
          />
        ))}
      </div>
      <button onClick={addNote} className="fab-add-btn">
        +
      </button>
    </div>
  );
}
