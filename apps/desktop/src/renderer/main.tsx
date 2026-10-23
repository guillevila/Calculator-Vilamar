/**
 * main.tsx — Arranque de la interfaz.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'
import { aplicarAspecto, leerAspecto } from './aspecto.js'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-800.css'
import './estilos.css'
// El «aspecto nuevo» va después: solo actúa si <html> lleva data-aspecto="familia".
import './aspecto-familia.css'

// Antes de pintar nada, para que no haya un parpadeo con el aspecto equivocado.
aplicarAspecto(leerAspecto())

const raiz = document.getElementById('raiz')
if (!raiz) throw new Error('Falta el elemento raíz')

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
