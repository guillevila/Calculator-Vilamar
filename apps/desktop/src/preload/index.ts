/**
 * preload — El único puente entre la interfaz y el sistema.
 *
 * La interfaz NO tiene Node, ni disco, ni Playwright. Solo puede llamar a lo
 * que se expone aquí, y cada llamada acaba en un manejador del proceso
 * principal. Es lo que permite que una página web local no pueda leer ficheros
 * del usuario aunque algo saliera mal.
 *
 * Este fichero se mantiene deliberadamente TONTO: solo reenvía. Nada de lógica
 * y ninguna dependencia pesada — en este proyecto ya costó un fallo arrastrar
 * una librería a un preload.
 */

import { contextBridge, ipcRenderer } from 'electron'

import type { ApiVilamar } from '../compartido/ipc.js'
import { CANALES } from '../compartido/ipc.js'

const api: ApiVilamar = {
  version: () => ipcRenderer.invoke(CANALES.version),

  casoNuevo: () => ipcRenderer.invoke(CANALES.casoNuevo),
  casoActual: () => ipcRenderer.invoke(CANALES.casoActual),

  cargarDocumentos: (archivos) => ipcRenderer.invoke(CANALES.cargarDocumentos, archivos),
  elegirArchivos: () => ipcRenderer.invoke(CANALES.elegirArchivos),

  editarMedida: (ojo, campo, valor) =>
    ipcRenderer.invoke(CANALES.editarMedida, ojo, campo, valor),
  confirmarCampo: (ojo, campo) => ipcRenderer.invoke(CANALES.confirmarCampo, ojo, campo),
  confirmarTodo: () => ipcRenderer.invoke(CANALES.confirmarTodo),
  validar: () => ipcRenderer.invoke(CANALES.validar),
  elegirLente: (fabricante, modelo) =>
    ipcRenderer.invoke(CANALES.elegirLente, fabricante, modelo),

  calcular: (ojo, calculadoras) => ipcRenderer.invoke(CANALES.calcular, ojo, calculadoras),
  cancelarCalculo: () => ipcRenderer.invoke(CANALES.cancelarCalculo),

  generarPdf: () => ipcRenderer.invoke(CANALES.generarPdf),
  abrirCarpetaInformes: () => ipcRenderer.invoke(CANALES.abrirCarpetaInformes),

  alProgresar: (escucha) => {
    const manejador = (_e: unknown, estado: Parameters<typeof escucha>[0]): void => escucha(estado)
    ipcRenderer.on(CANALES.progreso, manejador)
    return () => ipcRenderer.removeListener(CANALES.progreso, manejador)
  },

  alCambiarCaso: (escucha) => {
    const manejador = (_e: unknown, caso: Parameters<typeof escucha>[0]): void => escucha(caso)
    ipcRenderer.on(CANALES.casoCambiado, manejador)
    return () => ipcRenderer.removeListener(CANALES.casoCambiado, manejador)
  },
}

contextBridge.exposeInMainWorld('vilamar', api)
