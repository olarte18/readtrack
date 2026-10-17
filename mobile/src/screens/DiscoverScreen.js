import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BookCard from "../components/BookCard";
import { useTheme } from "../contexts/ThemeContext";
import { getDiscoveryBooks, logUnexpectedError } from "../services/api";

const GENRES = [
  ["fantasy", "Fantasía"],
  ["fiction", "Ficción"],
  ["mystery", "Misterio"],
  ["romance", "Romance"],
  ["science_fiction", "Ciencia ficción"],
  ["horror", "Terror"],
  ["history", "Historia"],
  ["biography", "Biografía"],
];

export default function DiscoverScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [genre, setGenre] = useState(GENRES[0][0]);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getDiscoveryBooks(genre)
      .then((results) => { if (!cancelled) setBooks(results); })
      .catch((error) => {
        if (!cancelled) {
          setBooks([]);
          setFailed(true);
          logUnexpectedError(error);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [genre, retryCount]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Descubrir libros</Text>
      </View>
      <Text style={styles.subtitle}>
        Explora por género, ordenado por cantidad de ediciones en Open Library. Priorizamos ediciones en español; cuando no existe, mostramos el título traducido.
      </Text>
      <ScrollView
        horizontal
        style={styles.genreScroller}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.genreList}
      >
        {GENRES.map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.genreButton, genre === key && styles.genreButtonActive]}
            accessibilityRole="button"
            accessibilityLabel={`Género ${label}${genre === key ? ", seleccionado" : ""}`}
            accessibilityState={{ selected: genre === key }}
            onPress={() => setGenre(key)}
          >
            <Text style={[styles.genreButtonText, genre === key && styles.genreButtonTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loading ? (
        <View style={styles.statusContainer}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : failed ? (
        <View style={styles.statusContainer}>
          <Text style={styles.message}>No se pudo cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.</Text>
          <TouchableOpacity
            style={styles.retryButton}
            accessibilityRole="button"
            accessibilityLabel="Volver a intentar cargar libros"
            onPress={() => setRetryCount((count) => count + 1)}
          >
            <Text style={styles.retryText}>Intentar de nuevo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.resultsScroll} contentContainerStyle={styles.results}>
          {books.length ? books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onPress={() => navigation.navigate("BookDetail", { book })}
            />
          )) : <Text style={styles.message}>No encontramos libros para este género.</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 50 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20 },
  title: { color: colors.text, fontSize: 23, fontWeight: "bold" },
  subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, paddingHorizontal: 20, marginTop: 10 },
  genreScroller: { flexGrow: 0, flexShrink: 0 },
  genreList: { gap: 8, paddingHorizontal: 16, paddingVertical: 16 },
  genreButton: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 9 },
  genreButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  genreButtonText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  genreButtonTextActive: { color: colors.onAccent },
  statusContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingBottom: 24 },
  resultsScroll: { flex: 1 },
  results: { paddingBottom: 32 },
  message: { color: colors.textMuted, textAlign: "center", paddingHorizontal: 24, lineHeight: 20 },
  retryButton: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: colors.accent, borderRadius: 10 },
  retryText: { color: colors.onAccent, fontWeight: "bold" },
});
