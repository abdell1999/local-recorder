<div align="center">
  <h1>🎙️ Local Recorder</h1>
  <h3>Grabación, transcripción, resumen y diarización — 100% en tu navegador</h3>
  <p><i>Tu audio nunca sale de tu dispositivo. Sin servidores. Sin subidas. Sin rastreo.</i></p>
</div>

---

## 🧭 Visión

**Local Recorder** es una herramienta de grabación de voz con transcripción automática que se ejecuta **íntegramente en el lado del cliente** usando IA local (Whisper sobre WebGPU/WASM). Está pensada para reuniones, notas de voz, entrevistas o memos personales en los que la privacidad es innegociable.

A diferencia de los servicios de transcripción en la nube (que suben tu audio a un servidor de terceros), aquí **el audio jamás abandona el navegador**: ni el archivo, ni la transcripción, ni los resúmenes.

---

## ✨ Características principales

| Función | Descripción |
|---------|-------------|
| 🎧 **Grabación** | Captura desde micrófono, pestaña del navegador o ambos (mezcla). |
| 📝 **Transcripción local** | Speech-to-text con Whisper ejecutándose en WebGPU (o WASM como *fallback*). |
| 🌍 **Multiidioma** | Español e inglés de salida, con arquitectura escalable a idiomas complejos (árabe, japonés). |
| 👥 **Diarización** | Identificación de quién habla (Hablante 1, Hablante 2…). |
| 🧠 **Resumen IA local** | Generación de TL;DR y puntos clave con un LLM pequeño en cliente. |
| 💾 **Persistencia opcional** | Efímero por defecto; historial cifrado local si el usuario lo activa. |
| 📤 **Exportación** | TXT, SRT/VTT (subtítulos), JSON estructurado y Markdown. |

---

## 🌍 Soporte de idiomas

El motor Whisper está entrenado en ~99 idiomas, por lo que la base multiidioma **ya viene incluida** en el modelo. El enfoque por fases:

- **Fase 1 — Español + Inglés.** Idiomas de validación, alta precisión incluso con modelos pequeños.
- **Fase 2 — Idiomas complejos (árabe, japonés).** Técnicamente viable sin cambios de arquitectura. Consideraciones específicas:
  - **Árabe:** mejor precisión con árabe estándar moderno (MSA); los dialectos regionales bajan calidad. Requiere soporte de renderizado **RTL** en la interfaz.
  - **Japonés:** funciona bien, pero la ausencia de espacios entre palabras complica la segmentación de subtítulos. Conviene un post-procesado de segmentación.
  - Ambos se benefician de un **modelo más grande** (`medium`/`large`), lo que aumenta RAM y tiempo de cómputo.

> **Clave de diseño:** un **selector de tamaño de modelo** (`tiny` → `large`) que equilibre velocidad/precisión según el idioma y el hardware del usuario. Idiomas complejos → recomendar modelo mayor automáticamente.

---

## 🏗️ Arquitectura

**Formato recomendado: aplicación web (PWA).**
La grabadora necesita acceso sostenido al micrófono, descargar y cachear modelos grandes (decenas a cientos de MB) y mantener estado durante sesiones largas. Una PWA ofrece instalación, trabajo offline (modelos cacheados) y acceso completo a `MediaRecorder` y WebGPU, sin las limitaciones de tiempo de vida de un *service worker* de extensión.

```
┌─────────────────────────────────────────────┐
│                  UI (Cliente)                 │
│   Grabación · Estado · Editor de transcript   │
└───────────────┬───────────────────────────────┘
                │
   ┌────────────┼────────────┬──────────────┐
   ▼            ▼            ▼              ▼
┌────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐
│MediaRec│ │ Whisper  │ │Diarizador│ │  LLM local │
│ (audio)│ │(WebGPU/  │ │(embeddings│ │ (resumen)  │
│        │ │  WASM)   │ │ de voz)  │ │            │
└────────┘ └──────────┘ └──────────┘ └────────────┘
                │
                ▼
       ┌──────────────────┐
       │ IndexedDB cifrado │  (persistencia opcional)
       └──────────────────┘
```

### Stack propuesto

- **Captura:** `MediaRecorder API` + `getUserMedia` / `getDisplayMedia` (para audio de pestaña).
- **Transcripción:** `transformers.js` (Whisper) sobre **WebGPU**, con *fallback* a `whisper.cpp` compilado a **WASM** para hardware sin WebGPU.
- **Diarización:** modelo de *speaker embeddings* + clustering ligero en cliente. (El componente técnicamente más delicado; ver retos.)
- **Resumen:** LLM pequeño (p. ej. familia Qwen/Llama 1–3B cuantizado) vía WebGPU.
- **Persistencia:** `IndexedDB` con cifrado **AES-GCM** mediante `Web Crypto API`.
- **Exportación:** generación de SRT/VTT/JSON/MD en cliente.

---

## 💾 Persistencia (efímero vs. guardado)

Modelo recomendado: **efímero por defecto, persistencia cifrada opcional**.

- **Por defecto:** nada se guarda. Al cerrar la pestaña, todo desaparece.
- **Opcional (toggle):** el usuario activa "Guardar historial", se le pide una contraseña, y las grabaciones + transcripciones se almacenan **cifradas con AES-GCM** en IndexedDB. La clave se deriva de la contraseña (PBKDF2/Argon2) y nunca se persiste en claro.

Esto mantiene la coherencia con la filosofía *privacy-first* y deja la decisión en manos del usuario.

---

## ⚠️ Retos técnicos

1. **Peso de los modelos.** Whisper `medium`/`large` y el LLM de resumen ocupan mucho. Solución: descarga bajo demanda, caché en *Cache Storage*, selector de tamaño y aviso claro de descarga.
2. **Diarización en cliente.** Es la pieza menos madura del ecosistema web. Posible MVP: diarización aproximada por cambios de energía/silencios; versión avanzada con *speaker embeddings*.
3. **Rendimiento sin WebGPU.** El *fallback* WASM es mucho más lento; conviene detectar capacidad y avisar.
4. **Sesiones largas.** Transcribir en *streaming* por bloques en vez de esperar al final, para no agotar memoria.
5. **RTL y segmentación.** Interfaz adaptable a árabe (RTL) y segmentación específica para japonés.

---

## 🚀 MVP por fases

### Fase 1 — Núcleo
- [ ] Grabación desde micrófono.
- [ ] Transcripción local con Whisper (WebGPU + *fallback* WASM).
- [ ] Español e inglés.
- [ ] Editor de transcripción y exportación a TXT/SRT.

### Fase 2 — Inteligencia
- [ ] Resumen y puntos clave con LLM local.
- [ ] Selector de tamaño de modelo.
- [ ] Captura de audio de pestaña.

### Fase 3 — Avanzado
- [ ] Diarización (quién habla).
- [ ] Soporte de árabe (RTL) y japonés (segmentación).
- [ ] Persistencia cifrada opcional.
- [ ] Exportación a JSON/Markdown estructurado.

---

<div align="center">
  <i>🔒 Privacidad por diseño: si tu audio nunca sale del dispositivo, nadie más puede escucharlo.</i>
</div>
