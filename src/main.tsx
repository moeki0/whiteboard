import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Development tools
if (import.meta.env.DEV) {
  import('./utils/migrationTool');
  // Load moeki-specific migration tool
  import('./utils/migrateMoeki');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
