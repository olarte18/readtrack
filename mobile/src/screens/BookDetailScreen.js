import { useState, useEffect } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, TextInput } from "react-native";
import { addBook, updateBook, checkBook, deleteBook, getNotes, addNote, deleteNote, updateBookPages } from "../services/api";
import DateTimePicker from "@react-native-community/datetimepicker";

const STATUS_OPTIONS = [
  { key: "reading", label: "📖 Leyendo" },
  { key: "paused", label: "⏸ Pausado" },
  { key: "completed", label: "✅ Completado" },
  { key: "pending", label: "🕐 Pendiente" },
  { key: "wishlist", label: "🌟 Deseos" },
  { key: "abandoned", label: "❌ Abandonado" },
];

export default function BookDetailScreen({ route, navigation }) {
  const { book, onGoBack } = route.params;
  const isInLibrary = !!book.status;
  const [selectedStatus, setSelectedStatus] = useState(book.status ?? null);
  const [loading, setLoading] = useState(false);
  const [libraryEntry, setLibraryEntry] = useState(
    isInLibrary ? { id: book.id, status: book.status } : null
  );
  const [currentPage, setCurrentPage] = useState(
    book.current_page ? String(book.current_page) : ""
  );
  const [rating, setRating] = useState(book.rating ?? 0);
 const [totalPages, setTotalPages] = useState(book.pages ? String(book.pages) : "");
  const [notes, setNotes] = useState([]);
const [newNote, setNewNote] = useState("");
const [notePage, setNotePage] = useState("");
const [startedAt, setStartedAt] = useState(book.started_at ? new Date(book.started_at) : null);
const [finishedAt, setFinishedAt] = useState(book.finished_at ? new Date(book.finished_at) : null);
const [showStartPicker, setShowStartPicker] = useState(false);
const [showEndPicker, setShowEndPicker] = useState(false);
  useEffect(() => {
    if (!isInLibrary && book.id) {
      checkBook(book.id).then((data) => {
        if (data.exists) {
          console.log("checkBook data:", JSON.stringify(data));
          setLibraryEntry(data);
          setSelectedStatus(data.status);
        }
      });
    }
  }, []);
useEffect(() => {
  if (alreadyInLibrary && entryId) {
    getNotes(entryId).then(setNotes).catch(console.error);
  }
}, [alreadyInLibrary]);

  const alreadyInLibrary = isInLibrary || !!libraryEntry;
  const entryId = libraryEntry?.id ?? book.id;

  const handleAdd = async (status) => {
    setSelectedStatus(status);
    setLoading(true);
    try {
      const result = await addBook({ ...book, google_id: book.id }, status);
      setLibraryEntry({ id: result.id, status });
      Alert.alert("✅ Listo", `"${book.title}" agregado a tu biblioteca`);
      onGoBack?.();
    } catch (error) {
      Alert.alert("Error", "No se pudo agregar el libro");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id, status) => {
    setSelectedStatus(status);
    setLoading(true);
    try {
      const updates = { status };
if (status === "reading" && !libraryEntry?.started_at) {
  updates.started_at = new Date().toISOString().split("T")[0];
}
if (status === "completed") {
  updates.finished_at = new Date().toISOString().split("T")[0];
}
await updateBook(id, updates);
      setLibraryEntry((prev) => ({ ...prev, status }));
      onGoBack?.();
    } catch (error) {
      Alert.alert("Error", "No se pudo actualizar el estado");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePage = async () => {
    const page = parseInt(currentPage);
    if (isNaN(page) || page < 0) return Alert.alert("Error", "Ingresa una página válida");
    if (book.pages && page > book.pages) return Alert.alert("Error", `El libro tiene ${book.pages} páginas`);

    try {
      // Auto-completar si llegó a la última página
      if (book.pages && page === book.pages) {
        await updateBook(entryId, { current_page: page, status: "completed" });
        setSelectedStatus("completed");
        setLibraryEntry((prev) => ({ ...prev, status: "completed" }));
        Alert.alert("🎉 ¡Felicidades!", `Terminaste "${book.title}"`);
      } else {
        await updateBook(entryId, { current_page: page });
        Alert.alert("✅ Guardado", `Página ${page} guardada`);
      }
      onGoBack?.();
    } catch {
      Alert.alert("Error", "No se pudo guardar la página");
    }
  };

  const handleRating = async (stars) => {
    setRating(stars);
    try {
      await updateBook(entryId, { rating: stars });
    } catch {
      Alert.alert("Error", "No se pudo guardar el rating");
    }
  };
const handleDateChange = async (field, date) => {
  if (!date) return;
  const iso = date.toISOString().split("T")[0];
  if (field === "started_at") setStartedAt(date);
  else setFinishedAt(date);
  try {
    await updateBook(entryId, { [field]: iso });
  } catch {
    Alert.alert("Error", "No se pudo guardar la fecha");
  }
};
  const handleDelete = () => {
    Alert.alert(
      "Eliminar libro",
      `¿Quitar "${book.title}" de tu biblioteca?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBook(entryId);
              onGoBack?.();
              navigation.goBack();
            } catch {
              Alert.alert("Error", "No se pudo eliminar el libro");
            }
          }
        }
      ]
    );
  };
const handleAddNote = async () => {
  if (!newNote.trim()) return Alert.alert("Error", "Escribe algo en la nota");
  try {
    const note = await addNote(entryId, newNote.trim(), notePage ? parseInt(notePage) : null);
    setNotes((prev) => [note, ...prev]);
    setNewNote("");
    setNotePage("");
  } catch {
    Alert.alert("Error", "No se pudo guardar la nota");
  }
};

const handleDeleteNote = (id) => {
  Alert.alert("Eliminar nota", "¿Eliminar esta nota?", [
    { text: "Cancelar", style: "cancel" },
    {
      text: "Eliminar", style: "destructive",
      onPress: async () => {
        await deleteNote(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
      }
    }
  ]);
};
  return (
    <ScrollView style={styles.container}>
<View style={styles.hero}>
        {book.cover ? (
          <Image source={{ uri: book.cover }} style={styles.cover} />
        ) : (
          <View style={styles.noCover}>
            <Text style={styles.noCoverEmoji}>📚</Text>
          </View>
        )}
        <Text style={styles.title}>{String(book.title)}</Text>
        <Text style={styles.author}>{String(book.author)}</Text>
        {!!book.year && <Text style={styles.meta}>{String(book.year)}</Text>}
        {!!(book.pages || totalPages) && (
          <Text style={styles.meta}>{book.pages || totalPages} páginas</Text>
        )}
      </View>

      {alreadyInLibrary && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Total de páginas</Text>
         <Text style={styles.hint}>
  {book.pages ? `Registradas: ${book.pages} — puedes corregirlas` : "Este libro no tiene páginas registradas"}
</Text>
          <View style={styles.pageRow}>
            <TextInput
              style={styles.pageInput}
              placeholder="Ej. 647"
              placeholderTextColor="#666"
              keyboardType="numeric"
              value={totalPages}
              onChangeText={setTotalPages}
            />
            <TouchableOpacity
              style={styles.pageBtn}
              onPress={async () => {
                const p = parseInt(totalPages);
                if (isNaN(p) || p <= 0) return Alert.alert("Error", "Ingresa un número válido");
                try {
                  await updateBookPages(book.google_id ?? book.id, p);
                  Alert.alert("✅ Guardado", `${p} páginas guardadas`);
                } catch {
                  Alert.alert("Error", "No se pudo guardar");
                }
              }}
            >
              <Text style={styles.pageBtnText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
{alreadyInLibrary && (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>Fechas</Text>
    <TouchableOpacity style={styles.dateRow} onPress={() => setShowStartPicker(true)}>
      <Text style={styles.dateLabel}>📅 Inicio</Text>
      <Text style={styles.dateValue}>
        {startedAt ? startedAt.toISOString().split("T")[0] : "Toca para agregar"}
      </Text>
    </TouchableOpacity>
    {selectedStatus === "completed" && (
  <TouchableOpacity style={styles.dateRow} onPress={() => setShowEndPicker(true)}>
    <Text style={styles.dateLabel}>🏁 Fin</Text>
    <Text style={styles.dateValue}>
      {finishedAt ? finishedAt.toISOString().split("T")[0] : "Toca para agregar"}
    </Text>
  </TouchableOpacity>
)}
{showEndPicker && (
  <DateTimePicker
    value={finishedAt ?? new Date()}
    mode="date"
    onChange={(e, date) => { setShowEndPicker(false); handleDateChange("finished_at", date); }}
  />
)}
  
  </View>
)}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {alreadyInLibrary ? "Cambiar estado" : "Agregar a biblioteca"}
        </Text>
        {loading ? (
          <ActivityIndicator color="#cba6f7" />
        ) : (
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.statusBtn, selectedStatus === opt.key && styles.statusBtnActive]}
                onPress={() => alreadyInLibrary
                  ? handleUpdate(entryId, opt.key)
                  : handleAdd(opt.key)}
              >
                <Text style={[styles.statusBtnText, selectedStatus === opt.key && styles.statusBtnTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {selectedStatus === "reading" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Página actual</Text>
          <View style={styles.pageRow}>
            <TextInput
              style={styles.pageInput}
              placeholder="¿En qué página vas?"
              placeholderTextColor="#666"
              keyboardType="numeric"
              value={currentPage}
              onChangeText={setCurrentPage}
            />
            <TouchableOpacity style={styles.pageBtn} onPress={handleSavePage}>
              <Text style={styles.pageBtnText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    {showStartPicker && (
      <DateTimePicker
        value={startedAt ?? new Date()}
        mode="date"
        onChange={(e, date) => { setShowStartPicker(false); handleDateChange("started_at", date); }}
      />
    )}
      {selectedStatus === "completed" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tu valoración</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => handleRating(star)}>
                <Text style={styles.star}>{star <= rating ? "⭐" : "☆"}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

{alreadyInLibrary && (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>Notas</Text>
    <View style={styles.noteInputRow}>
      <TextInput
        style={styles.noteInput}
        placeholder="Escribe una nota..."
        placeholderTextColor="#666"
        value={newNote}
        onChangeText={setNewNote}
        multiline
      />
    </View>
    <View style={styles.pageRow}>
      <TextInput
        style={[styles.pageInput, { flex: 1 }]}
        placeholder="Página (opcional)"
        placeholderTextColor="#666"
        keyboardType="numeric"
        value={notePage}
        onChangeText={setNotePage}
      />
      <TouchableOpacity style={styles.pageBtn} onPress={handleAddNote}>
        <Text style={styles.pageBtnText}>Agregar</Text>
      </TouchableOpacity>
    </View>
    {notes.map((note) => (
      <TouchableOpacity key={note.id} style={styles.noteCard} onLongPress={() => handleDeleteNote(note.id)}>
        {note.page && <Text style={styles.notePage}>Página {note.page}</Text>}
        <Text style={styles.noteContent}>{note.content}</Text>
      </TouchableOpacity>
    ))}
  </View>
)}
      {alreadyInLibrary && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteBtnText}>🗑 Quitar de biblioteca</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#13131f" },
  hero: { alignItems: "center", paddingTop: 60, paddingBottom: 30, paddingHorizontal: 20 },
  cover: { width: 120, height: 180, borderRadius: 10, marginBottom: 16 },
  noCover: { width: 120, height: 180, borderRadius: 10, backgroundColor: "#2a2a3e", justifyContent: "center", alignItems: "center", marginBottom: 16 },
  noCoverEmoji: { fontSize: 48 },
  title: { fontSize: 20, fontWeight: "bold", color: "#fff", textAlign: "center", marginBottom: 6 },
  author: { fontSize: 15, color: "#aaa", marginBottom: 4 },
  meta: { fontSize: 13, color: "#666" },
  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#fff", marginBottom: 12 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusBtn: { backgroundColor: "#1e1e2e", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  statusBtnActive: { backgroundColor: "#cba6f7" },
  statusBtnText: { color: "#cba6f7", fontSize: 13 },
  statusBtnTextActive: { color: "#13131f", fontWeight: "bold" },
  pageRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  pageInput: { flex: 1, backgroundColor: "#1e1e2e", color: "#fff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  pageBtn: { backgroundColor: "#cba6f7", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  pageBtnText: { color: "#1e1e2e", fontWeight: "bold" },
  starsRow: { flexDirection: "row", gap: 8 },
  star: { fontSize: 32 , color: "#cba6f7" },
  deleteBtn: { backgroundColor: "#20221b", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 40 },
  deleteBtnText: { color: "#f38ba8", fontWeight: "bold", fontSize: 15 },
noteInputRow: { marginBottom: 8 },
noteInput: { backgroundColor: "#1e1e2e", color: "#fff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: "top" },
noteCard: { backgroundColor: "#1e1e2e", borderRadius: 10, padding: 12, marginTop: 8 },
notePage: { fontSize: 11, color: "#cba6f7", marginBottom: 4 },
noteContent: { fontSize: 14, color: "#cdd6f4" },
hint: { fontSize: 12, color: "#666", marginBottom: 8 },
dateText: { fontSize: 13, color: "#aaa", marginBottom: 4 },
dateRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#1e1e2e", borderRadius: 10, padding: 12, marginBottom: 8 },
dateLabel: { color: "#aaa", fontSize: 14 },
dateValue: { color: "#cba6f7", fontSize: 14 },
});