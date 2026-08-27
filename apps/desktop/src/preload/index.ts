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

import { contextBridge, ipcRenderer, webUtils } from 'electron'

import type { ApiVilamar } from '../compartido/ipc.js'
import { CANALES } from '../compartido/ipc.js'

const api: ApiVilamar = {
  version: () => ipcRenderer.invoke(CANALES.version),

  casoNuevo: () => ipcRenderer.invoke(CANALES.casoNuevo),
  casoActual: () => ipcRenderer.invoke(CANALES.casoActual),

  cargarDocumentos: (rutas) => ipcRenderer.invoke(CANALES.cargarDocumentos, rutas),
  elegirYCargarDocumentos: () => ipcRenderer.invoke(CANALES.elegirYCargarDocumentos),

  // La única función que hace algo más que reenviar. El objeto File del
  // navegador no expone su ruta en disco: hay que pedírsela a Electron.
  rutaDeArchivo: (fichero) => webUtils.getPathForFile(fichero),

  editarMedida: (ojo, campo, valor) => ipcRenderer.invoke(CANALES.editarMedida, ojo, campo, valor),
  establecerIdentificacion: (datos) =>
    ipcRenderer.invoke(CANALES.establecerIdentificacion, datos),
  confirmarCampo: (ojo, campo) => ipcRenderer.invoke(CANALES.confirmarCampo, ojo, campo),
  elegirSexo: (sexo) => ipcRenderer.invoke(CANALES.elegirSexo, sexo),
  confirmarSexo: () => ipcRenderer.invoke(CANALES.confirmarSexo),
  confirmarTodo: () => ipcRenderer.invoke(CANALES.confirmarTodo),
  validar: () => ipcRenderer.invoke(CANALES.validar),
  elegirLente: (fabricante, modelo) => ipcRenderer.invoke(CANALES.elegirLente, fabricante, modelo),

  calcular: (calculadoras) => ipcRenderer.invoke(CANALES.calcular, calculadoras),
  reintentar: (calculadora, ojo) => ipcRenderer.invoke(CANALES.reintentar, calculadora, ojo),
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
