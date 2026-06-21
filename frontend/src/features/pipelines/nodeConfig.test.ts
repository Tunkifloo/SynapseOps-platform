import { describe, expect, it } from 'vitest'

import { defaultConfig, validateConfig } from './nodeConfig'

// Nodo Entrenamiento (ejecución): framework, batch, batch norm, early stopping y el modelo.
// La arquitectura y los hiperparámetros viven ahora en el nodo Hiperparámetros.
const fullTrainConfig = {
  framework: 'tensorflow',
  batchSize: '32',
  batchNorm: 'false',
  earlyStopping: 'false',
  modelMode: 'new',
  modelName: 'mnist_cnn_demo',
}

// Nodo Hiperparámetros: arquitectura + knobs (con HPO desactivado, los manuales son visibles).
const fullHparamsConfig = {
  architecture: 'cnn',
  hpo: 'false',
  optimizer: 'adam',
  epochs: 5,
  learningRate: '0.001',
  dropout: 0.4,
  l2: 0,
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

  it('acepta una configuración de hiperparámetros completa', () => {
    expect(validateConfig('hparams', fullHparamsConfig)).toBeNull()
  })

  it('rechaza epochs fuera de rango (máx 100) en Hiperparámetros', () => {
    const error = validateConfig('hparams', { ...fullHparamsConfig, epochs: 999 })
    expect(error).toMatch(/Epochs/i)
  })

  it('rechaza learning rate no numérico en Hiperparámetros', () => {
    const error = validateConfig('hparams', { ...fullHparamsConfig, learningRate: 'abc' })
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
    expect(defaultConfig('train')).toMatchObject({ framework: 'tensorflow' })
    expect(defaultConfig('hparams')).toMatchObject({ architecture: 'cnn', hpo: 'true' })
    expect(defaultConfig('deploy')).toEqual({})
  })
})
