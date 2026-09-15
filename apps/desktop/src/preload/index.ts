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
  listarCasosGuardados: () => ipcRenderer.invoke(CANALES.listarCasosGuardados),
  abrirCaso: (codigo) => ipcRenderer.invoke(CANALES.abrirCaso, codigo),
  resumenDashboard: (rango) => ipcRenderer.invoke(CANALES.resumenDashboard, rango),
  listarDoctoresExcluidosDeEstadisticas: () =>
    ipcRenderer.invoke(CANALES.listarDoctoresExcluidosDeEstadisticas),
  excluirDoctorDeEstadisticas: (nombre) =>
    ipcRenderer.invoke(CANALES.excluirDoctorDeEstadisticas, nombre),
  incluirDoctorEnEstadisticas: (nombre) =>
    ipcRenderer.invoke(CANALES.incluirDoctorEnEstadisticas, nombre),
  eliminarCasosDeDoctor: (nombre, rango) =>
    ipcRenderer.invoke(CANALES.eliminarCasosDeDoctor, nombre, rango),

  cargarDocumentos: (rutas) => ipcRenderer.invoke(CANALES.cargarDocumentos, rutas),
  elegirYCargarDocumentos: () => ipcRenderer.invoke(CANALES.elegirYCargarDocumentos),

  // La única función que hace algo más que reenviar. El objeto File del
  // navegador no expone su ruta en disco: hay que pedírsela a Electron.
  rutaDeArchivo: (fichero) => webUtils.getPathForFile(fichero),

  editarMedida: (ojo, campo, valor, aparato) =>
    ipcRenderer.invoke(CANALES.editarMedida, ojo, campo, valor, aparato),
  establecerIdentificacion: (datos) => ipcRenderer.invoke(CANALES.establecerIdentificacion, datos),
  listarDoctores: () => ipcRenderer.invoke(CANALES.listarDoctores),
  guardarDoctor: (doctor) => ipcRenderer.invoke(CANALES.guardarDoctor, doctor),
  eliminarDoctor: (id) => ipcRenderer.invoke(CANALES.eliminarDoctor, id),
  aplicarDoctor: (id) => ipcRenderer.invoke(CANALES.aplicarDoctor, id),
  listarBandeja: () => ipcRenderer.invoke(CANALES.listarBandeja),
  crearEntradaBandeja: (datos) => ipcRenderer.invoke(CANALES.crearEntradaBandeja, datos),
  editarEntradaBandeja: (id, datos) => ipcRenderer.invoke(CANALES.editarEntradaBandeja, id, datos),
  vincularEntradaBandeja: (id, casoCodigo) =>
    ipcRenderer.invoke(CANALES.vincularEntradaBandeja, id, casoCodigo),
  marcarEntradaBandejaEnviada: (id, enviado) =>
    ipcRenderer.invoke(CANALES.marcarEntradaBandejaEnviada, id, enviado),
  eliminarEntradaBandeja: (id) => ipcRenderer.invoke(CANALES.eliminarEntradaBandeja, id),
  obtenerCarpetaEntrada: () => ipcRenderer.invoke(CANALES.obtenerCarpetaEntrada),
  elegirYConfigurarCarpetaEntrada: () =>
    ipcRenderer.invoke(CANALES.elegirYConfigurarCarpetaEntrada),
  buscarFotosNuevasEnCarpeta: () => ipcRenderer.invoke(CANALES.buscarFotosNuevasEnCarpeta),
  confirmarCampo: (ojo, campo, aparato) =>
    ipcRenderer.invoke(CANALES.confirmarCampo, ojo, campo, aparato),
  confirmarTodoElOjo: (ojo, aparato) =>
    ipcRenderer.invoke(CANALES.confirmarTodoElOjo, ojo, aparato),
  elegirSexo: (sexo) => ipcRenderer.invoke(CANALES.elegirSexo, sexo),
  confirmarSexo: () => ipcRenderer.invoke(CANALES.confirmarSexo),
  confirmarTodo: () => ipcRenderer.invoke(CANALES.confirmarTodo),
  validar: () => ipcRenderer.invoke(CANALES.validar),
  discrepanciasDe: (ojo) => ipcRenderer.invoke(CANALES.discrepanciasDe, ojo),
  reconocerDiscrepancia: (ojo) => ipcRenderer.invoke(CANALES.reconocerDiscrepancia, ojo),
  renombrarAparato: (ojo, aparatoViejo, aparatoNuevo) =>
    ipcRenderer.invoke(CANALES.renombrarAparato, ojo, aparatoViejo, aparatoNuevo),
  editarAparatoCaraPosterior: (ojo, aparato, aparatoCaraPosterior) =>
    ipcRenderer.invoke(CANALES.editarAparatoCaraPosterior, ojo, aparato, aparatoCaraPosterior),
  editarSituacionCorneal: (ojo, aparato, situacionCorneal) =>
    ipcRenderer.invoke(CANALES.editarSituacionCorneal, ojo, aparato, situacionCorneal),
  elegirLente: (fabricante, modelo, nombreEnEvo, nombreEnKane, constanteConocida) =>
    ipcRenderer.invoke(
      CANALES.elegirLente,
      fabricante,
      modelo,
      nombreEnEvo,
      nombreEnKane,
      constanteConocida,
    ),
  elegirLenteSecundaria: (eleccion) => ipcRenderer.invoke(CANALES.elegirLenteSecundaria, eleccion),
  intercambiarLentes: () => ipcRenderer.invoke(CANALES.intercambiarLentes),

  calcular: (calculadoras, filtro) => ipcRenderer.invoke(CANALES.calcular, calculadoras, filtro),
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
