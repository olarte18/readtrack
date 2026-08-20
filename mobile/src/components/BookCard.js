import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const STATUS_LABEL = {
  reading: "Leyendo",
  completed: "Completado",
  pending: "Pendiente",
  abandoned: "Abandonado",
};

export default function BookCard({ book, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      {book.cover ? (
        <Image source={{ uri: book.cover }} style={styles.cover} />
      ) : (
        <View style={styles.noCover}>
          <Ionicons name="book" size={26} color="#666" />
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{book.title}</Text>
        <Text style={styles.author}>{book.author}</Text>
        {book.status && (
          <Text style={styles.status}>{STATUS_LABEL[book.status]}</Text>
        )}
        {book.status === "reading" && book.current_page && book.pages && (
          <Text style={styles.pages}>Página {book.current_page} de {book.pages}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#1e1e2e",
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
    backgroundColor: "#2a2a3e",
  },
  noCover: {
    width: 60,
    height: 90,
    borderRadius: 6,
    backgroundColor: "#2a2a3e",
    justifyContent: "center",
    alignItems: "center",
  },
  info: { flex: 1, marginLeft: 12 },
  title: { fontSize: 15, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  author: { fontSize: 13, color: "#aaa", marginBottom: 6 },
  status: { fontSize: 12, color: "#cba6f7" },
  pages: { fontSize: 11, color: "#888", marginTop: 2 },
});
