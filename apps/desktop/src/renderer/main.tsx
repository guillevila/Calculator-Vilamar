/**
 * main.tsx — Arranque de la interfaz.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'
import './estilos.css'

const raiz = document.getElementById('raiz')
if (!raiz) throw new Error('Falta el elemento raíz')

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
