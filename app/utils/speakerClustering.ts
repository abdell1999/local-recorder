export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let normA = 0
  let normB = 0
  a.forEach((valueA, i) => {
    const valueB = b[i] ?? 0
    dot += valueA * valueB
    normA += valueA * valueA
    normB += valueB * valueB
  })
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

interface Centroid {
  sum: Float32Array
  count: number
}

function centroidMean(centroid: Centroid): Float32Array {
  return centroid.sum.map((value) => value / centroid.count)
}

export function clusterEmbeddings(embeddings: Float32Array[], threshold: number): number[] {
  const centroids: Centroid[] = []
  const assignments: number[] = []

  for (const embedding of embeddings) {
    let bestIndex = -1
    let bestSimilarity = -Infinity
    centroids.forEach((centroid, index) => {
      const similarity = cosineSimilarity(embedding, centroidMean(centroid))
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity
        bestIndex = index
      }
    })

    const matchedCentroid = bestIndex === -1 ? undefined : centroids[bestIndex]
    if (matchedCentroid && bestSimilarity >= threshold) {
      embedding.forEach((value, i) => {
        matchedCentroid.sum[i] = (matchedCentroid.sum[i] ?? 0) + value
      })
      matchedCentroid.count += 1
      assignments.push(bestIndex)
    } else {
      centroids.push({ sum: Float32Array.from(embedding), count: 1 })
      assignments.push(centroids.length - 1)
    }
  }

  return assignments
}
