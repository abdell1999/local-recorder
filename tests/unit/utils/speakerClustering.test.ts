import { describe, it, expect } from 'vitest'
import { cosineSimilarity, clusterEmbeddings } from '../../../app/utils/speakerClustering'

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([1, 0, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(1)
  })

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([0, 1, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(0)
  })

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([-1, 0, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1)
  })
})

describe('clusterEmbeddings', () => {
  it('returns an empty array for no embeddings', () => {
    expect(clusterEmbeddings([], 0.5)).toEqual([])
  })

  it('assigns a single embedding to cluster 0', () => {
    const embeddings = [new Float32Array([1, 0, 0])]
    expect(clusterEmbeddings(embeddings, 0.5)).toEqual([0])
  })

  it('groups two very similar embeddings into the same cluster', () => {
    const embeddings = [new Float32Array([1, 0, 0]), new Float32Array([0.9, 0.1, 0])]
    expect(clusterEmbeddings(embeddings, 0.5)).toEqual([0, 0])
  })

  it('splits two very different (orthogonal) embeddings into separate clusters', () => {
    const embeddings = [new Float32Array([1, 0, 0]), new Float32Array([0, 1, 0])]
    expect(clusterEmbeddings(embeddings, 0.5)).toEqual([0, 1])
  })

  it('reuses an earlier cluster when a later embedding matches it, even with a different one in between', () => {
    const embeddings = [
      new Float32Array([1, 0, 0]),
      new Float32Array([0, 1, 0]),
      new Float32Array([0.95, 0.05, 0]),
    ]
    expect(clusterEmbeddings(embeddings, 0.5)).toEqual([0, 1, 0])
  })
})
