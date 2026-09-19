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