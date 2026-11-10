# Entre nosotros

Primera versión de la aplicación personal de conexión de Oliver y Yasmine. `index.html` es autónomo y contiene el diseño, código y grabación musical acreditada en `MUSIC-CREDITS.md`.

## Estado
Esta publicación aloja la interfaz. El guardado sigue siendo local en el navegador mediante IndexedDB: NO hay backend conectado, login seguro, sincronización entre teléfonos, juego remoto ni widget. Los perfiles locales no son protección de acceso y «Para compartir» no envía nada.

## Funciones
Diario de notas/poemas y ánimo con fotos/audio/vídeo; preguntas por temas y respuestas propias; música inicialmente apagada, playlist de archivos locales y dedicatorias por enlace; jardín ASCII persistente; exportación/importación completa con archivos.

## Privacidad y copias
Este repositorio contiene solo código/recursos públicos y documentación, no vuestros datos personales. IndexedDB pertenece a cada navegador y origen. Exportar incluye ambos perfiles y todos los medios SIN cifrado: no subir las copias a este repositorio ni compartirlas como si fueran el HTML vacío. El navegador puede borrar el almacenamiento; exportar es necesario para conservar una copia.

Límites locales: 25 MB por archivo, 100 MB totales y JSON de importación hasta 150 MB. Evitar edición concurrente en varias pestañas.

## Verificación del artefacto
12 pruebas funcionales y seis regresiones de integridad pasadas en Chromium, revisión independiente aprobada. Probada respuesta visual a 320/390/1024 px; no se afirma prueba en Safari/iPhone físico.

## Música
Ver `MUSIC-CREDITS.md`. No incluye canciones comerciales nuevas ni un servicio de streaming. No reproduce automáticamente.
