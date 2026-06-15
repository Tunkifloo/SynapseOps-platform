import { describe, expect, it } from 'vitest'

import { defaultConfig, validateConfig } from './nodeConfig'

// Configuración de entrenamiento válida y completa (incluye los parámetros
// de CNN: optimizer, batchNorm, earlyStopping — todos obligatorios en el esquema).
const fullTrainConfig = {
  framework: 'tensorflow',
  architecture: 'cnn',
  optimizer: 'adam',
  epochs: 5,
  batchSize: '32',
  learningRate: '0.001',
  dropout: 0.4,
  l2: 0,
  batchNorm: 'false',
  earlyStopping: 'false',
  modelMode: 'new',
  modelName: 'mnist_cnn_demo',
}

describe('validateConfig (HU-003 / HU-004 / HU-005)', () => {
  it('exige el nombre del modelo en la configuración por defecto de entrenamiento', () => {
    // El modelName por defecto está vacío → obligatorio.
    const error = validateConfig('train', defaultConfig('train'))
    expect(error).toMatch(/nombre/i)
  })

  it('acepta una configuración de entrenamiento completa', () => {
    expect(validateConfig('train', fullTrainConfig)).toBeNull()
  })

  it('rechaza epochs fuera de rango (máx 100)', () => {
    const error = validateConfig('train', { ...fullTrainConfig, epochs: 999, modelName: 'm' })
    expect(error).toMatch(/Epochs/i)
  })

  it('rechaza learning rate no numérico', () => {
    const error = validateConfig('train', { ...fullTrainConfig, learningRate: 'abc', modelName: 'm' })
    expect(error).toMatch(/Learning rate/i)
  })

  it('valida el rango de split (50–90%)', () => {
    expect(validateConfig('split', { trainRatio: 80 })).toBeNull()
    expect(validateConfig('split', { trainRatio: 40 })).toMatch(/mínimo/i)
    expect(validateConfig('split', { trainRatio: 95 })).toMatch(/máximo/i)
  })

  it('ignora campos ocultos por showIf en ingesta (modo keras no exige URL)', () => {
    const error = validateConfig('ingest', { mode: 'keras', kerasDataset: 'mnist', url: '' })
    expect(error).toBeNull()
  })

  it('exige URL cuando el modo de ingesta es url', () => {
    const error = validateConfig('ingest', { mode: 'url', kerasDataset: '', url: '' })
    expect(error).toMatch(/URL/i)
  })
})

describe('defaultConfig', () => {
  it('entrega valores base coherentes por tipo de nodo', () => {
    expect(defaultConfig('split')).toEqual({ trainRatio: 80 })
    expect(defaultConfig('train')).toMatchObject({ framework: 'tensorflow', architecture: 'cnn' })
    expect(defaultConfig('deploy')).toEqual({})
  })
})
