import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config/firebase';
import { Auth } from './components/Auth';
import { Board } from './components/Board';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="app">
      {!user ? (
        <Auth user={user} />
      ) : (
        <>
          <div className="user-info">
            <Auth user={user} />
          </div>
          <Board user={user} />
        </>
      )}
    </div>
  );
}

export default App;