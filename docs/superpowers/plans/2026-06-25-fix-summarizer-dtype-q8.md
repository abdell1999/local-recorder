# Forzar `dtype:'q8'` en el resumen LLM — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forzar `dtype: 'q8'` de forma incondicional en `summarizer.worker.ts`, en vez de basarlo en la heurística `'gpu' in navigator` — evita el agotamiento de memoria (verificado en navegador real: el runtime WASM lanza una excepción no estándar) que ocurre cuando `navigator.gpu` existe pero está roto y el modelo de 0.5B de parámetros se queda sin cuantizar (`fp32`, ~2GB) corriendo sobre `wasm`.

**Architecture:** Cambio de un solo valor en una sola llamada — `dtype` pasa de ser condicional (`device === 'wasm' ? 'q8' : undefined`) a fijo (`'q8'`). La variable `device` se mantiene para el aviso de la UI, pero deja de influir en `dtype`.

**Tech Stack:** Igual que fases anteriores — Nuxt 4, TypeScript, pnpm, `@huggingface/transformers`.

## Global Constraints

- Package manager: pnpm only.
- Commits: sin co-author, mensajes en español, siempre en `main` (`CLAUDE.md`).
- `summarizer.worker.ts` no tiene test unitario directo (requiere navegador real) — se verifica por lectura de código.
- `pnpm dlx nuxi typecheck` debe seguir pasando limpio.
- Tras la tarea, correr `pnpm test` completo para confirmar que no hay regresiones.
- Sin tocar `whisper.worker.ts` ni `speakerSegmentation.worker.ts` (fuera de alcance, ver spec).

---

### Task 1: Forzar `dtype:'q8'` en `getGenerator`

**Files:**
- Modify: `app/workers/summarizer.worker.ts:19-34`

**Interfaces:**
- No consume ni produce nada nuevo. El protocolo de mensajes
  (`SummarizerWorkerResponse`) no cambia de forma.

Este archivo no tiene test unitario directo (requiere navegador real para
`pipeline()`) — su corrección se verifica leyendo el código y con la
suite completa + typecheck.

- [ ] **Step 1: Reescribir `getGenerator`**

Cambiar (líneas 19-34 actuales):
```ts
async function getGenerator(modelSize: LlmModelSize) {
  if (generator && loadedModelSize === modelSize) return generator
  post({ type: 'progress', status: 'loading-model' })
  // Heurística usada solo como pista para la UI y para el dtype — la
  // selección real de backend la hace onnxruntime-web internamente vía
  // device:'auto' (ver docs/superpowers/specs/2026-06-24-fix-device-auto-design.md).
  const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
  post({ type: 'device', device })

  const onProgress = createProgressAggregator((percent) => post({ type: 'model-download-progress', percent }))

  generator = await pipeline<'text-generation'>(
    'text-generation',
    getLlmModelRepoId(modelSize),
    { device: 'auto', dtype: device === 'wasm' ? 'q8' : undefined, progress_callback: onProgress },
  )
  loadedModelSize = modelSize
  return generator
}
```
por:
```ts
async function getGenerator(modelSize: LlmModelSize) {
  if (generator && loadedModelSize === modelSize) return generator
  post({ type: 'progress', status: 'loading-model' })
  // Heurística usada solo como pista para la UI (aviso de "modo
  // compatibilidad") — la selección real de backend la hace
  // onnxruntime-web internamente vía device:'auto'. El dtype se fija
  // siempre a 'q8' (ver docs/superpowers/specs/2026-06-25-fix-summarizer-dtype-q8-design.md):
  // en fp32 sin cuantizar, este modelo agota la memoria del runtime wasm
  // cuando WebGPU está presente pero roto y se cae a wasm internamente.
  const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
  post({ type: 'device', device })

  const onProgress = createProgressAggregator((percent) => post({ type: 'model-download-progress', percent }))

  generator = await pipeline<'text-generation'>(
    'text-generation',
    getLlmModelRepoId(modelSize),
    { device: 'auto', dtype: 'q8', progress_callback: onProgress },
  )
  loadedModelSize = modelSize
  return generator
}
```

El resto del archivo (`self.onmessage`, `SUMMARY_SYSTEM_PROMPT`) no cambia.

- [ ] **Step 2: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones — este archivo no
tiene tests propios)

- [ ] **Step 3: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add app/workers/summarizer.worker.ts
git commit -m "Fuerza dtype:'q8' en summarizer.worker.ts para evitar OOM en wasm con fp32"
```

---
