import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { brand } from '@brand/brand'
import App from './App.tsx'

document.title = brand.productName
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
if (icon) icon.href = brand.favicon

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
