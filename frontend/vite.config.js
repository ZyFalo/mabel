import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Update flow silencioso: el nuevo SW toma el control sin prompt
      // y la próxima navegación ya ve la versión nueva. Decisión PO
      // 2026-05-25 (PWA scope) — preferimos no interrumpir al usuario
      // con banners "actualizar".
      registerType: 'autoUpdate',
      // Inyecta automáticamente <link rel="manifest"> + el bootstrap
      // del SW en index.html. No requiere `<script>` manual en main.jsx.
      injectRegister: 'auto',
      includeAssets: [
        'brand/umb-shield.png',
        'brand/umb-shield-white.png',
        'icons/apple-touch-icon.png',
      ],
      manifest: {
        name: 'Mabel IA — Bienestar UMB',
        short_name: 'Mabel',
        description:
          'Asistente conversacional de psicoeducación en salud mental para estudiantes de la Universidad Manuela Beltrán.',
        theme_color: '#A51916',
        background_color: '#A51916',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        lang: 'es-CO',
        categories: ['health', 'education', 'lifestyle'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // SPA routing: cualquier navigate sin asset coincidente cae a
        // /index.html para que React Router maneje la ruta offline.
        navigateFallback: '/index.html',
        // No interceptar las llamadas a la API durante el navigate
        // fallback — si el SW responde index.html a un /api/* en flight
        // el frontend se confunde y muestra HTML como JSON.
        navigateFallbackDenylist: [/^\/api\//],
        // Workbox precachea por defecto todos los assets de build
        // (CSS/JS/imágenes con hash). Subimos el límite para que los
        // chunks del frontend grandes (lucide-react, recharts) no
        // queden fuera de la lista de precache.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        runtimeCaching: [
          {
            // GET /api/v1/sessions* (listing, detalle y mensajes
            // históricos) → NetworkFirst con fallback cache:
            // online siempre trae fresh; offline muestra la última
            // versión vista (PWA offline scope = leer historial).
            // SSE / POST de mensajes NO entra porque filtramos por
            // request.method === 'GET' — incluir /messages aquí
            // permite que `SessionDetail` renderice el historial
            // cacheado de la última visita cuando se está offline
            // (CR-04 review 2026-05-25: antes excluíamos /messages
            // con un regex demasiado amplio y el detalle quedaba
            // vacío offline a pesar de que el OfflineBanner promete
            // lectura del historial).
            // CR-A8 (review 2026-05-26): regex sin `\?` porque
            // url.pathname NUNCA contiene query string (eso vive en
            // url.search). Simplificado a `/` | end-of-string.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              /^\/api\/v1\/sessions(\/|$)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mabel-sessions-history',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 días
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Fuentes externas (Google Fonts CSS + woff2) — CacheFirst
            // largo; rara vez cambian y son caros de re-bajar.
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' ||
              url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'mabel-google-fonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 año
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Imágenes y assets estáticos servidos por la misma origin
            // (logo UMB, iconos, futuras imágenes brand). CacheFirst
            // con expiración media; los assets con hash quedan
            // precacheados por workbox separadamente.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\.(png|jpg|jpeg|svg|webp|gif|ico)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'mabel-static-images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 días
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // SW deshabilitado en `npm run dev` a propósito: workbox
        // cachea los chunks emitidos por HMR de Vite y ensucia el
        // dev loop (cambios JS no aplican hasta cerrar/limpiar el
        // SW manualmente). Para probar el flujo offline / instalable
        // usar `npm run build && npm run preview` — esa salida sí
        // monta el SW y refleja exactamente lo que ve producción.
        enabled: false,
        type: 'module',
      },
    }),
  ],
})
