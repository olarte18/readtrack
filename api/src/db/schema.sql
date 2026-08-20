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
  google_id   VARCHAR(50) NOT NULL UNIQUE,
  title       VARCHAR(255) NOT NULL,
  author      VARCHAR(255),
  cover       TEXT,
  pages       INTEGER,
  year        VARCHAR(10),
  isbn        VARCHAR(20),
  description TEXT,
  created_at  TIMESTAMP DEFAULT NOW(),
  genre       VARCHAR(100)
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

CREATE TABLE IF NOT EXISTS reading_sessions (
  id               SERIAL PRIMARY KEY,
  user_book_id     INTEGER NOT NULL REFERENCES user_books(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page             INTEGER NOT NULL,
  duration_seconds INTEGER,
  pages_read       INTEGER,
  created_at       TIMESTAMP DEFAULT NOW()
);

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
  code       VARCHAR(6) NOT NULL,
  type       VARCHAR(20),
  expires_at TIMESTAMP NOT NULL,
  used       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT verification_codes_type_check CHECK (type IN ('verification', 'password_reset'))
);