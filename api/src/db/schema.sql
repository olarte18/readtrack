-- ReadTrack schema

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  password      VARCHAR(255) NOT NULL,
  avatar        TEXT,
  created_at    TIMESTAMP DEFAULT NOW(),
  verified      BOOLEAN DEFAULT FALSE,
  reading_goal  INTEGER DEFAULT 0,
  CONSTRAINT users_username_key UNIQUE (username)
);

CREATE TABLE IF NOT EXISTS books (
  id          SERIAL PRIMARY KEY,
  google_id   VARCHAR(50) UNIQUE,
  title       VARCHAR(255) NOT NULL,
  author      VARCHAR(255),
  cover       TEXT,
  pages       INTEGER,
  chapters    INTEGER,
  year        VARCHAR(10),
  isbn        VARCHAR(50),
  description TEXT,
  created_at  TIMESTAMP DEFAULT NOW(),
  genre       VARCHAR(100),
  publisher   VARCHAR(120),
  book_type   VARCHAR(20)
);

-- Para bases creadas antes de estas columnas
ALTER TABLE books ADD COLUMN IF NOT EXISTS publisher VARCHAR(120);
ALTER TABLE books ADD COLUMN IF NOT EXISTS book_type   VARCHAR(20);
ALTER TABLE books ADD COLUMN IF NOT EXISTS chapters    INTEGER;
ALTER TABLE books ALTER COLUMN isbn TYPE VARCHAR(50);
ALTER TABLE reading_sessions ADD COLUMN IF NOT EXISTS start_page INTEGER;
ALTER TABLE user_books ADD COLUMN IF NOT EXISTS reading_mode VARCHAR(20) DEFAULT 'page';
-- Relecturas: cada lectura es una fila de user_books; las anteriores se archivan
-- (is_archived) y quedan como historial numerado (read_number) sin salir en la
-- biblioteca activa. Bases creadas antes lo adoptan.
ALTER TABLE user_books ADD COLUMN IF NOT EXISTS read_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_books ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_books_reading_mode_check'
  ) THEN
    ALTER TABLE user_books ADD CONSTRAINT user_books_reading_mode_check
      CHECK (reading_mode IN ('page', 'chapter', 'percentage'));
  END IF;
END $$;

-- Libros creados manualmente no tienen google_id
ALTER TABLE books ALTER COLUMN google_id DROP NOT NULL;

-- Categorías por libro: máximo 3, la primera es la principal
CREATE TABLE IF NOT EXISTS book_categories (
  id         SERIAL PRIMARY KEY,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  name       VARCHAR(40) NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  position   SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT book_categories_position_check CHECK (position >= 0 AND position <= 2)
);

-- Relecturas de un libro (ciclos distintos a la primera lectura)
CREATE TABLE IF NOT EXISTS reading_cycles (
  id           SERIAL PRIMARY KEY,
  user_book_id INTEGER NOT NULL REFERENCES user_books(id) ON DELETE CASCADE,
  nth          INTEGER NOT NULL,
  started_at   DATE,
  finished_at  DATE,
  rating       INTEGER,
  review       TEXT,
  created_at   TIMESTAMP DEFAULT NOW(),
  CONSTRAINT reading_cycles_rating_check CHECK (rating >= 1 AND rating <= 5 OR rating IS NULL)
);

CREATE TABLE IF NOT EXISTS user_books (
  id           SERIAL PRIMARY KEY,
  book_id      INTEGER REFERENCES books(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  status       VARCHAR(20) DEFAULT 'pending',
  current_page INTEGER DEFAULT 0,
  rating       INTEGER,
  started_at   DATE,
  finished_at  DATE,
  created_at   TIMESTAMP DEFAULT NOW(),
  review       TEXT,
  reading_mode VARCHAR(20) DEFAULT 'page',
  read_number  INTEGER NOT NULL DEFAULT 1,
  is_archived  BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT user_books_reading_mode_check CHECK (reading_mode IN ('page', 'chapter', 'percentage')),
  CONSTRAINT user_books_rating_check CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT user_books_status_check CHECK (status IN (
    'reading', 'completed', 'pending', 'abandoned', 'wishlist', 'paused'
  ))
);

CREATE TABLE IF NOT EXISTS notes (
  id         SERIAL PRIMARY KEY,
  book_id    INTEGER REFERENCES books(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  page       INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- DB2: FK de notas a user_books con CASCADE (borrar una copia de la biblioteca
-- elimina sus notas). La columna se agrega nullable para permitir el backfill.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS user_book_id INTEGER REFERENCES user_books(id) ON DELETE CASCADE;
-- Backfill: ata cada nota a la copia (user_book) más reciente de su (user, book).
UPDATE notes n
SET user_book_id = ub.id
FROM (SELECT DISTINCT ON (user_id, book_id) id, user_id, book_id
      FROM user_books ORDER BY user_id, book_id, id DESC) ub
WHERE ub.user_id = n.user_id AND ub.book_id = n.book_id AND n.user_book_id IS NULL;
CREATE INDEX IF NOT EXISTS notes_user_book_idx ON notes (user_book_id);

CREATE TABLE IF NOT EXISTS reading_sessions (
  id               SERIAL PRIMARY KEY,
  user_book_id     INTEGER NOT NULL REFERENCES user_books(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id        UUID,
  page             INTEGER NOT NULL,
  start_page       INTEGER,
  duration_seconds INTEGER,
  pages_read       INTEGER,
  created_at       TIMESTAMP DEFAULT NOW()
);
-- Idempotencia de sesiones: el móvil genera un client_id por sesión; si se
-- reintenta (o sincroniza la cola offline), devuelve la sesión existente en
-- lugar de duplicarla. Bases creadas antes lo adoptan.
ALTER TABLE reading_sessions ADD COLUMN IF NOT EXISTS client_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS reading_sessions_user_client_uidx
  ON reading_sessions (user_id, client_id) WHERE client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS reading_goals (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(20),
  metric     VARCHAR(20),
  value      INTEGER NOT NULL,
  year       INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT reading_goals_user_id_type_year_key UNIQUE (user_id, type, year),
  CONSTRAINT reading_goals_metric_check CHECK (metric IN ('books', 'hours', 'minutes')),
  CONSTRAINT reading_goals_type_check CHECK (type IN ('annual', 'monthly', 'weekly', 'daily'))
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  email      VARCHAR(100),
  code       VARCHAR(255) NOT NULL,
  type       VARCHAR(20),
  expires_at TIMESTAMP NOT NULL,
  used       BOOLEAN DEFAULT FALSE,
  attempts   INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT verification_codes_type_check CHECK (type IN ('verification', 'password_reset', 'registration'))
);
-- Los códigos de recuperación se guardan hasheados; bases creadas antes se amplían a propósito
ALTER TABLE verification_codes ALTER COLUMN code TYPE VARCHAR(255);
-- Límite de intentos por código (anti fuerza bruta): bases creadas antes lo adoptan
ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
-- Registro requiere verificar un código por email (el code viaja sin user_id): bases
-- creadas antes ganan la columna email y amplían el check a type 'registration'
ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS email VARCHAR(100);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'verification_codes_type_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%registration%'
  ) THEN
    ALTER TABLE verification_codes DROP CONSTRAINT verification_codes_type_check;
    ALTER TABLE verification_codes ADD CONSTRAINT verification_codes_type_check
      CHECK (type IN ('verification', 'password_reset', 'registration'));
  END IF;
END $$;

-- Refresh tokens de sesión (rotación + revocación de JWT)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash     VARCHAR(64) NOT NULL,
  expires_at     TIMESTAMP NOT NULL,
  revoked_at     TIMESTAMP,
  replaced_by_id INTEGER REFERENCES refresh_tokens(id),
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_hash_active_idx ON refresh_tokens (token_hash) WHERE revoked_at IS NULL;

-- Logros: el catálogo es idéntico para todos y los desbloqueos quedan por
-- usuario. Cada fila del catálogo es un (code, tier): el mismo code comparte
-- icono y descripción y escala su umbral (target) por tier. Los logros
-- is_secret solo se muestran una vez desbloqueados.
CREATE TABLE IF NOT EXISTS achievements (
  code        TEXT NOT NULL,
  tier        TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'special')),
  name        VARCHAR(60) NOT NULL,
  description VARCHAR(180) NOT NULL,
  leyenda     VARCHAR(180),
  icon        VARCHAR(40) NOT NULL,
  grp         VARCHAR(20) NOT NULL,
  target      INTEGER NOT NULL,
  is_secret   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (code, tier)
);
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS leyenda VARCHAR(180);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  tier        TEXT NOT NULL,
  unlocked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  seen_at     TIMESTAMP,
  PRIMARY KEY (user_id, code, tier),
  FOREIGN KEY (code, tier) REFERENCES achievements(code, tier)
);
CREATE INDEX IF NOT EXISTS user_achievements_user_idx ON user_achievements (user_id);

-- Eventos de logro: contadores que no se pueden derivar del estado actual
-- (retroalimentación = ediciones, abandono = acción puntual). Los hooks de las
-- rutas insertan aquí y computeProgress hace COUNT.
CREATE TABLE IF NOT EXISTS achievement_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS achievement_events_user_idx ON achievement_events (user_id, code);

-- El seed usa UPSERT: actualiza umbrales, descripciones, iconos y banderas
-- (is_secret) de filas ya sembradas sin tocar user_achievements (FK intacta).
-- Los códigos eliminados del catálogo se purgan antes de sembrar.
DELETE FROM user_achievements WHERE code IN ('madrugador','tras_medianoche');
DELETE FROM achievements WHERE code IN ('madrugador','tras_medianoche');

INSERT INTO achievements (code, tier, name, description, leyenda, icon, grp, target, is_secret, sort_order) VALUES
  ('en_racha','bronze','En racha','Lee 7 días seguidos','El hábito empieza con una semana.','flame','rachas',7,FALSE,1),
  ('en_racha','silver','En racha','Lee 30 días seguidos','Un mes entero a tu ritmo.','flame','rachas',30,FALSE,2),
  ('en_racha','gold','En racha','Lee 100 días seguidos','El tiempo ya se acostumbró a leerte.','flame','rachas',100,FALSE,3),
  ('en_racha','special','En racha','Lee 250 días seguidos','El año no pasa sin tus páginas.','flame','rachas',250,TRUE,4),
  ('mes_perfecto','special','Mes perfecto','Leíste todos los días de un mes','La constancia tiene su calendario.','calendar','rachas',1,TRUE,5),
  ('primer_libro','special','Primer libro','Terminaste tu primer libro','Cada historia comienza por la primera.','book','volumen',1,TRUE,1),
  ('raton_biblioteca','bronze','Ratón de biblioteca','Termina 5 libros distintos','Tu biblioteca empieza a tener dueño.','library','volumen',5,FALSE,2),
  ('raton_biblioteca','silver','Ratón de biblioteca','Termina 25 libros distintos','Ya nadie puede quitarles tu lugar.','library','volumen',25,FALSE,3),
  ('raton_biblioteca','gold','Ratón de biblioteca','Termina 50 libros distintos','Los estantes te reconocen.','library','volumen',50,FALSE,4),
  ('raton_biblioteca','special','Ratón de biblioteca','Termina 100 libros distintos','Eres parte del inventario.','library','volumen',100,TRUE,5),
  ('maratonista','bronze','Maratonista','Lee 5 000 páginas','Las páginas ya suman kilómetros.','walk','volumen',5000,FALSE,6),
  ('maratonista','silver','Maratonista','Lee 15 000 páginas','Palabra por palabra, llegaste lejos.','walk','volumen',15000,FALSE,7),
  ('maratonista','gold','Maratonista','Lee 30 000 páginas','Nadie corre como tú entre páginas.','walk','volumen',30000,FALSE,8),
  ('maratonista','special','Maratonista','Lee 60 000 páginas','Ya no lees libros, los atraviesas.','walk','volumen',60000,TRUE,9),
  ('tomo_pesado','bronze','Tomo pesado','Termina 3 libros de más de 500 páginas','Le entraste al ladrillo y no te asustaste.','barbell','volumen',3,FALSE,10),
  ('tomo_pesado','silver','Tomo pesado','Termina 7 libros de más de 500 páginas','El grosor ya no te intimida.','barbell','volumen',7,FALSE,11),
  ('tomo_pesado','gold','Tomo pesado','Termina 12 libros de más de 500 páginas','Los tomos gruesos son tu terreno favorito.','barbell','volumen',12,FALSE,12),
  ('tomo_pesado','special','Tomo pesado','Termina 22 libros de más de 500 páginas','Ya no lees libros pesados, los cargas como si nada.','barbell','volumen',22,TRUE,13),
  ('lectura_expres','bronze','Lectura exprés','Termina 3 libros de menos de 150 páginas','Corto pero no menos importante.','flash','volumen',3,FALSE,14),
  ('lectura_expres','silver','Lectura exprés','Termina 10 libros de menos de 150 páginas','Sabes que una gran historia no necesita ser larga.','flash','volumen',10,FALSE,15),
  ('lectura_expres','gold','Lectura exprés','Termina 25 libros de menos de 150 páginas','El maestro de las lecturas rápidas.','flash','volumen',25,FALSE,16),
  ('lectura_expres','special','Lectura exprés','Termina 50 libros de menos de 150 páginas','Ni parpadeas y ya terminaste otro.','flash','volumen',50,TRUE,17),
  ('maraton_fin_de_semana','bronze','Maratón de fin de semana','Lee más de 50 páginas los fines de semana','El fin de semana fue tuyo y de tu libro.','sunny','volumen',50,FALSE,18),
  ('maraton_fin_de_semana','silver','Maratón de fin de semana','Lee más de 150 páginas los fines de semana','Ni el sofá te movió de esa lectura.','sunny','volumen',150,FALSE,19),
  ('maraton_fin_de_semana','gold','Maratón de fin de semana','Lee más de 300 páginas los fines de semana','Convertiste dos días en una biblioteca completa.','sunny','volumen',300,FALSE,20),
  ('maraton_fin_de_semana','special','Maratón de fin de semana','Lee más de 600 páginas los fines de semana','El mundo esperó, tú seguiste leyendo.','sunny','volumen',600,TRUE,21),
  ('meta_anual','bronze','Meta cumplida','Cumple tu meta anual de lectura','Cumpliste lo que te prometiste.','ribbon','volumen',1,FALSE,22),
  ('explorador','bronze','Explorador de géneros','Lee en 5 géneros distintos','Un mundo nuevo se abrió contigo.','grid','variedad',5,FALSE,1),
  ('explorador','silver','Explorador de géneros','Lee en 10 géneros distintos','Tus lecturas hablan varios idiomas.','grid','variedad',10,FALSE,2),
  ('autor_fiel','bronze','Autor fiel','Lee 3 libros del mismo autor','Encontraste una voz que vuelve.','people','variedad',3,FALSE,3),
  ('autor_fiel','silver','Autor fiel','Lee 6 libros del mismo autor','El autor ya te espera en cada lanzamiento.','people','variedad',6,FALSE,4),
  ('autor_fiel','gold','Autor fiel','Lee 9 libros del mismo autor','Su estilo ya se siente como casa.','people','variedad',9,FALSE,5),
  ('autor_fiel','special','Autor fiel','Lee 15 libros del mismo autor','De tanto leerlo, el autor ya te conoce.','people','variedad',15,TRUE,6),
  ('critico','bronze','Crítico','Califica 10 libros','Tu opinión empieza a contar.','star','interaccion',10,FALSE,1),
  ('critico','silver','Crítico','Califica 50 libros','Juzgar con cariño es un oficio.','star','interaccion',50,FALSE,2),
  ('anotador','bronze','Anotador','Escribe 20 notas','Las ideas que no se van.','document-text','interaccion',20,FALSE,3),
  ('anotador','silver','Anotador','Escribe 100 notas','Dejaste la huella de tu pensamiento.','document-text','interaccion',100,FALSE,4),
  ('retroalimentacion','bronze','Retroalimentación','Edita 5 veces una nota o calificación en libros terminados','Vuelves a tus palabras para afinarlas.','pencil','interaccion',5,FALSE,5),
  ('retroalimentacion','silver','Retroalimentación','Edita 20 veces una nota o calificación en libros terminados','Tus reseñas maduran con el tiempo.','pencil','interaccion',20,FALSE,6),
  ('retroalimentacion','gold','Retroalimentación','Edita 50 veces una nota o calificación en libros terminados','Revisar es parte de tu forma de leer.','pencil','interaccion',50,FALSE,7),
  ('retroalimentacion','special','Retroalimentación','Edita 100 veces una nota o calificación en libros terminados','Nunca dejas una opinión a medio pulir.','pencil','interaccion',100,TRUE,8),
  ('dedicacion','special','Dedicación','Lees 3 horas en un solo día','El tiempo se rindió ante tu lectura.','hourglass','secretos',1,TRUE,1),
  ('abandono','special','Abandono con estilo','Dejaste un libro cuando tocaba decir adiós','Leer también es dejar ir.','flag-outline','secretos',1,TRUE,2)
ON CONFLICT (code, tier) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  leyenda = EXCLUDED.leyenda,
  icon = EXCLUDED.icon,
  grp = EXCLUDED.grp,
  target = EXCLUDED.target,
  is_secret = EXCLUDED.is_secret,
  sort_order = EXCLUDED.sort_order;

-- Catálogo de referencia: elimina filas huérfanas (tiers que cambiaron de nombre o códigos
-- retirados no contemplados arriba), respetando la FK de user_achievements. El motor reinserta
-- el escalón correcto al recalcular el progreso del usuario.
DELETE FROM user_achievements ua
WHERE (ua.code, ua.tier) NOT IN (
  SELECT code, tier FROM (VALUES
      ('en_racha','bronze'),('en_racha','silver'),('en_racha','gold'),('en_racha','special'),
      ('mes_perfecto','special'),
      ('primer_libro','special'),
      ('raton_biblioteca','bronze'),('raton_biblioteca','silver'),('raton_biblioteca','gold'),('raton_biblioteca','special'),
      ('maratonista','bronze'),('maratonista','silver'),('maratonista','gold'),('maratonista','special'),
      ('tomo_pesado','bronze'),('tomo_pesado','silver'),('tomo_pesado','gold'),('tomo_pesado','special'),
      ('lectura_expres','bronze'),('lectura_expres','silver'),('lectura_expres','gold'),('lectura_expres','special'),
      ('maraton_fin_de_semana','bronze'),('maraton_fin_de_semana','silver'),('maraton_fin_de_semana','gold'),('maraton_fin_de_semana','special'),
      ('meta_anual','bronze'),
      ('explorador','bronze'),('explorador','silver'),
      ('autor_fiel','bronze'),('autor_fiel','silver'),('autor_fiel','gold'),('autor_fiel','special'),
      ('critico','bronze'),('critico','silver'),
      ('anotador','bronze'),('anotador','silver'),
      ('retroalimentacion','bronze'),('retroalimentacion','silver'),('retroalimentacion','gold'),('retroalimentacion','special'),
      ('dedicacion','special'),
      ('abandono','special')
    ) AS catalog(code, tier)
  );

DELETE FROM achievements a
WHERE (a.code, a.tier) NOT IN (
  SELECT code, tier FROM (VALUES
    ('en_racha','bronze'),('en_racha','silver'),('en_racha','gold'),('en_racha','special'),
    ('mes_perfecto','special'),
    ('primer_libro','special'),
    ('raton_biblioteca','bronze'),('raton_biblioteca','silver'),('raton_biblioteca','gold'),('raton_biblioteca','special'),
    ('maratonista','bronze'),('maratonista','silver'),('maratonista','gold'),('maratonista','special'),
    ('tomo_pesado','bronze'),('tomo_pesado','silver'),('tomo_pesado','gold'),('tomo_pesado','special'),
    ('lectura_expres','bronze'),('lectura_expres','silver'),('lectura_expres','gold'),('lectura_expres','special'),
    ('maraton_fin_de_semana','bronze'),('maraton_fin_de_semana','silver'),('maraton_fin_de_semana','gold'),('maraton_fin_de_semana','special'),
    ('meta_anual','bronze'),
    ('explorador','bronze'),('explorador','silver'),
    ('autor_fiel','bronze'),('autor_fiel','silver'),('autor_fiel','gold'),('autor_fiel','special'),
    ('critico','bronze'),('critico','silver'),
    ('anotador','bronze'),('anotador','silver'),
    ('retroalimentacion','bronze'),('retroalimentacion','silver'),('retroalimentacion','gold'),('retroalimentacion','special'),
    ('dedicacion','special'),
    ('abandono','special')
  ) AS catalog(code, tier)
);