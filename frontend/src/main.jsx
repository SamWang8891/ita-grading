import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { SessionProvider } from './auth/SessionContext.jsx'
import { ThemeProvider } from './theme/ThemeContext.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
