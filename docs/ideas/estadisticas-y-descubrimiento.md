# Estadísticas y descubrimiento de lecturas

## Problema

¿Cómo podríamos ayudar a cualquier persona a descubrir patrones en sus lecturas y encontrar su próximo libro, incluso si todavía no tiene historial en ReadTrack?

## Dirección recomendada

Mantener las estadísticas como espacio para entender los hábitos propios y crear una pantalla independiente para descubrir libros. Son tareas relacionadas, pero distintas: una mira hacia lo que la persona ya leyó; la otra le ayuda a decidir qué leer después.

En descubrimiento, priorizar recomendaciones personales cuando haya suficientes señales de lecturas o favoritos. Para quienes aún no las tienen, ofrecer libros populares en general, organizados por género. Mantener también populares por género como opción de exploración para quienes ya reciben sugerencias personalizadas.

## Supuestos que conviene validar

- [ ] Los datos disponibles del catálogo permiten identificar géneros de forma suficientemente consistente.
- [ ] Existe una fuente adecuada para determinar qué libros son populares en general, sin confundir popularidad con recomendaciones personalizadas.
- [ ] Las personas valoran recibir recomendaciones basadas en su historial o favoritos, y no solo listas populares.
- [ ] Hay suficientes lecturas o favoritos para personalizar con utilidad; si no, la pantalla debe seguir ofreciendo una alternativa general.

## Tareas incrementales: de lo esencial a lo complejo

### Etapa 1: revisar los datos disponibles — completada

- Confirmar qué información de género, autor y editorial ya se guarda para cada libro.
- Detectar qué tan completos y consistentes son esos datos.
- Definir cómo tratar libros sin género o con metadatos incompletos.

**Resultado:** el esquema ya dispone de `book_categories` y campos de género, autor y editorial. Se usan categorías cuando existen y `books.genre` como respaldo; las estadísticas consideran libros terminados no archivados.

### Etapa 2: añadir patrones iniciales a las estadísticas — completada

- Mostrar los cinco géneros/categorías, autores y editoriales con más libros terminados.
- Mostrar conteos y barras relativas para comparar frecuencias.
- Incluir un estado útil cuando todavía no haya suficientes libros para encontrar un patrón.

**Resultado:** sección integrada en Estadísticas; el endpoint está autenticado y limita los datos a la biblioteca activa del usuario.

### Etapa 3: incorporar más dimensiones

- Agregar autores y, si los datos lo justifican, editoriales.
- Mantener una presentación compacta y priorizar los patrones más claros.
- Evitar llenar la pantalla con gráficos de categorías poco representativas.

**Resultado:** estadísticas más variadas sin perder legibilidad.

### Etapa 4: diseñar la pantalla de descubrimiento — completada

- Separarla de estadísticas: su objetivo es ayudar a elegir qué leer.
- Definir su estructura y sus estados: con historial, con pocos datos y sin historial.
- Mantener las estadísticas como punto de acceso, no como parte de la pantalla de recomendaciones.

**Resultado:** pantalla independiente con estilo propio dentro de la app, con selección de género, carga, error y estado vacío.

### Etapa 5: ofrecer populares por género a personas nuevas — completada

- Permitir explorar libros populares en general organizados por género.
- Usar la Search API de Open Library y ordenar los resultados por `edition_count`.
- Priorizar obras con edición en español (título y portada reales de esa edición).
- Para obras sin edición en español, traducir el título con MyMemory (respaldo) y
  conservar el título original como valor real del libro.
- Aclarar en pantalla que el orden usa la cantidad de ediciones registradas en Open Library; no son señales personalizadas de ReadTrack.

**Resultado:** la pantalla funciona sin historial ni favoritos. Se pasó de la Subjects API (experimental) a la Search API, más estable. La traducción automática solo actúa como respaldo cuando no hay edición en español.

### Etapa 6: añadir recomendaciones personales

- Usar lecturas y favoritos como señales iniciales.
- Mostrar sugerencias personales primero cuando haya datos suficientes.
- Conservar los populares por género como alternativa para explorar.
- Definir qué ocurre cuando la personalización todavía no sea confiable.

**Resultado:** descubrimiento personalizado con una alternativa general disponible.

### Etapa 7: mejorar la experiencia con evidencia de uso

- Observar qué secciones se consultan y si las recomendaciones llevan a abrir o guardar libros.
- Ajustar el orden y la cantidad de resultados según el uso.
- Considerar después comparaciones entre periodos u observaciones narrativas en estadísticas.

**Resultado:** decidir ampliaciones basándose en el uso real, no solo en más métricas.

## Alcance implementado

Se añadieron estadísticas por género/categoría, autor y editorial, además de una pantalla de descubrimiento por género (pestaña principal "Descubrir") con resultados de Open Library ordenados por `edition_count`. Los resultados priorizan ediciones en español; si no existe, se traduce el título con MyMemory y se conserva el original. La personalización sigue pendiente.

## No incluir todavía

- Recomendaciones avanzadas basadas en modelos complejos: primero validar que la personalización básica aporte valor.
- Comparaciones sociales o rankings entre usuarios: no son necesarias para descubrir preferencias personales.
- Muchas gráficas por cada dimensión estadística: priorizar patrones fáciles de interpretar.
- Asumir que la variedad de géneros es una meta: mostrar tendencias sin juzgar los hábitos de lectura.

## Preguntas abiertas

- ~~¿Qué fuente concreta proporcionará los libros populares por género?~~ Resuelto: Search API de Open Library filtrando por materia y ordenando por `edition_count`, con ediciones en español prioritarias.
- ¿Qué cantidad o tipo de actividad basta para empezar a personalizar las sugerencias?
- ¿Conviene cachear la traducción de títulos a nivel global (varios géneros) o basta la caché por género?
