import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";

const STATUS_LABEL = {
  reading: "Leyendo",
  completed: "Completado",
  pending: "Pendiente",
  abandoned: "Abandonado",
};

export default function BookCard({ book, onPress }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const statusText = book.status ? STATUS_LABEL[book.status] : null;
  const pagesText =
    book.status === "reading" && book.current_page && book.pages
      ? `Página ${book.current_page} de ${book.pages}`
      : null;
  const label = [book.title, book.author, statusText, pagesText]
    .filter(Boolean)
    .join(", ");
  return (
    <TouchableOpacity
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
    >
      {book.cover ? (
        <Image
          source={{ uri: book.cover }}
          style={styles.cover}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />
      ) : (
        <View
          style={styles.noCover}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name="book" size={26} color={colors.textDim} />
        </View>
      )}
      <View
        style={styles.info}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.title} numberOfLines={2}>{book.title}</Text>
        <Text style={styles.author}>{book.author}</Text>
        {statusText && (
          <Text style={styles.status}>{statusText}</Text>
        )}
        {pagesText && (
          <Text style={styles.pages}>{pagesText}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 12,
    alignItems: "center",
    elevation: 2,
  },
  cover: {
    width: 60,
    height: 90,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
  },
  noCover: {
    width: 60,
    height: 90,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
    justifyContent: "center",
    alignItems: "center",
  },
  info: { flex: 1, marginLeft: 12 },
  title: { fontSize: 15, fontWeight: "bold", color: colors.text, marginBottom: 4 },
  author: { fontSize: 13, color: colors.textMuted, marginBottom: 6 },
  status: { fontSize: 12, color: colors.accent },
  pages: { fontSize: 11, color: colors.textDim, marginTop: 2 },
});