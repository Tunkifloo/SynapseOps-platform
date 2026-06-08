import { afterEach, describe, expect, it } from 'vitest'

import { consumeDeployHandoff, setDeployHandoff } from './deployHandoff'

describe('deployHandoff (HU-027 → HU-028)', () => {
  afterEach(() => localStorage.clear())

  it('persiste y consume el handoff una sola vez', () => {
    setDeployHandoff({ runId: 'run-1', modelName: 'mnist_cnn', version: '3' })

    const first = consumeDeployHandoff()
    expect(first).toEqual({ runId: 'run-1', modelName: 'mnist_cnn', version: '3' })

    // Es de un solo uso: la segunda lectura ya no devuelve nada.
    expect(consumeDeployHandoff()).toBeNull()
  })

  it('devuelve null cuando no hay handoff', () => {
    expect(consumeDeployHandoff()).toBeNull()
  })

  it('no lanza si el contenido almacenado es inválido', () => {
    localStorage.setItem('synapseops:deploy-handoff', '{no-es-json')
    expect(() => consumeDeployHandoff()).not.toThrow()
    expect(consumeDeployHandoff()).toBeNull()
  })
})
