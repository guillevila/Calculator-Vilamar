import { describe, expect, it } from 'vitest'

import { doctorVacio } from './doctor.js'

describe('doctorVacio', () => {
  it('un doctor recién añadido no tiene SIA ni eje de incisión todavía', () => {
    expect(doctorVacio('d1', 'Dra. López')).toEqual({
      id: 'd1',
      nombre: 'Dra. López',
      sia: null,
      ejeIncision: null,
    })
  })
})
