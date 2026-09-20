import { useState, useEffect } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { AppAlert } from "../components/AppAlert";
import { updateBook, checkBook, deleteBook, getNotes, addNote, deleteNote, reReadBook, getReadingHistory } from "../services/api";
import { getBookDescription } from "../services/openLibrary";
import { formatPoint } from "../utils/progress";
import { formatDateEs } from "../utils/dates";
import { useKeyboardFormScroll } from "../hooks/useKeyboardFormScroll";
import DateTimePicker from "@react-native-community/datetimepicker";

const STATUS_LABELS = {
  reading: "Leyendo",
  paused: "Pausado",
  completed: "Completado",
  pending: "Pendiente",
  wishlist: "Deseos",
  abandoned: "Abandonado",
};

function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMinutes(seconds) {
  const minutes = Math.round((seconds ?? 0) / 60);
  return `${minutes} min`;
}

export default function BookDetailScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { book, onGoBack } = route.params;
  const isInLibrary = !!book.status;

  const [loading, setLoading] = useState(false);
  const [libraryEntry, setLibraryEntry] = useState(
    isInLibrary ? { id: book.id, status: book.status, started_at: book.started_at ?? null, finished_at: book.finished_at ?? null } : null
  );
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [notePage, setNotePage] = useState("");
  const [description, setDescription] = useState(book.description ?? null);
  const [bookDbId, setBookDbId] = useState(book.db_id ?? null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showRereadPicker, setShowRereadPicker] = useState(false);
  const [history, setHistory] = useState([]);

  const { scrollRef, onSectionLayout, onFieldFocus } = useKeyboardFormScroll();

  const alreadyInLibrary = isInLibrary || !!libraryEntry;
  const entryId = libraryEntry?.id ?? book.id;
  const status = libraryEntry?.status ?? book.status;
  const statusIsReading = status === "reading";
  const statusIsCompleted = status === "completed";
  const currentReadNumber = libraryEntry?.read_number ?? book.read_number;

  useEffect(() => {
    if (!description && (book.workKey || book.description)) {
      getBookDescription(book.workKey).then(setDescription).catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (!isInLibrary && book.id) {
      checkBook(book.id).then((data) => {
        if (data.exists) {
          setLibraryEntry(data);
          if (data.book_db_id) setBookDbId(data.book_db_id);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (alreadyInLibrary && bookDbId) {
      getNotes(bookDbId).then(setNotes).catch(console.error);
      getReadingHistory(entryId).then(setHistory).catch(console.error);
    }
  }, [alreadyInLibrary, bookDbId, entryId]);

  const startReading = (entry) => navigation.navigate("ReadingMode", { book: entry });

  const handlePrimaryAction = () => {
    if (statusIsReading) return startReading(book);
    if (statusIsCompleted) return setShowRereadPicker(true);
    // No leído: si no hay fecha de inicio, pedirla antes de marcar como leyendo.
    if (!libraryEntry?.started_at && !book.started_at) return setShowStartPicker(true);
    setLoading(true);
    updateBook(entryId, { status: "reading" })
      .then(() => {
        setLibraryEntry((prev) => ({ ...prev, status: "reading" }));
        startReading({ ...book, status: "reading" });
      })
      .catch(() => AppAlert.alert("Error", "No se pudo empezar a leer"))
      .finally(() => setLoading(false));
  };

  const handleStartDate = async (date) => {
    if (!date) return setShowStartPicker(false);
    const iso = toLocalDateString(date);
    setShowStartPicker(false);
    setLoading(true);
    try {
      await updateBook(entryId, { status: "reading", started_at: iso });
      setLibraryEntry((prev) => ({ ...prev, status: "reading", started_at: iso }));
      startReading({ ...book, status: "reading", started_at: iso });
    } catch {
      AppAlert.alert("Error", "No se pudo empezar a leer");
    } finally {
      setLoading(false);
    }
  };

  const handleRereadDate = async (date) => {
    if (!date) return setShowRereadPicker(false);
    const iso = toLocalDateString(date);
    setShowRereadPicker(false);
    setLoading(true);
    try {
      const res = await reReadBook(entryId, iso);
      const newRead = {
        ...book,
        id: res.id,
        status: "reading",
        current_page: 0,
        started_at: res.started_at,
        read_number: res.read_number,
      };
      startReading(newRead);
    } catch {
      AppAlert.alert("Error", "No se pudo iniciar la relectura");
    } finally {
      setLoading(false);
    }
  };

  const openEdit = () =>
    navigation.navigate("EditBook", {
      book,
      dbId: bookDbId ?? book.db_id,
      ubId: entryId,
      onGoBack,
    });

  const handleDelete = () => {
    AppAlert.alert(
      "Quitar de biblioteca",
      `¿Quitar "${book.title}" de tu biblioteca?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Quitar",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBook(entryId);
              onGoBack?.();
              navigation.goBack();
            } catch {
              AppAlert.alert("Error", "No se pudo quitar el libro");
            }
          }
        }
      ]
    );
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return AppAlert.alert("Error", "Escribe algo en la nota");
    try {
      const note = await addNote(bookDbId, newNote.trim(), notePage ? parseInt(notePage) : null);
      setNotes((prev) => [note, ...prev]);
      setNewNote("");
      setNotePage("");
    } catch {
      AppAlert.alert("Error", "No se pudo guardar la nota");
    }
  };

  const handleDeleteNote = (id) => {
    AppAlert.alert("Eliminar nota", "¿Eliminar esta nota?", [
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

  const handleNoteLongPress = (note) => {
    AppAlert.alert("Nota", "¿Qué quieres hacer con esta nota?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Editar",
        onPress: () =>
          navigation.navigate("NoteEditor", {
            note,
            onGoBack: (updated) =>
              setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n))),
          }),
      },
      {
        text: "Eliminar", style: "destructive",
        onPress: () => handleDeleteNote(note.id),
      },
    ]);
  };

  const startedAt = libraryEntry?.started_at ?? book.started_at;
  const finishedAt = libraryEntry?.finished_at ?? book.finished_at;
  const currentPage = libraryEntry?.current_page ?? book.current_page;
  const rating = libraryEntry?.rating ?? book.rating;

  const actionLabel = statusIsReading ? "Leer" : statusIsCompleted ? "Leer de nuevo" : "Empezar a leer";
  const actionIcon = statusIsReading ? "book-outline" : statusIsCompleted ? "refresh-outline" : "play-circle-outline";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
      <View style={styles.topBar}>
        {alreadyInLibrary ? (
          <TouchableOpacity style={styles.topBtn} onPress={openEdit} disabled={loading}>
            <Ionicons name="create-outline" size={16} color={colors.accent} />
            <Text style={styles.topBtnText}>Editar ficha</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
      </View>

      <View style={styles.hero}>
        {book.cover ? (
          <Image source={{ uri: book.cover }} style={styles.cover} />
        ) : (
          <View style={styles.noCover}>
            <Ionicons name="book" size={48} color={colors.textDim} />
          </View>
        )}
        <Text style={styles.title}>{String(book.title)}</Text>
        <Text style={styles.author}>{String(book.author)}</Text>
        {!!book.year && <Text style={styles.meta}>{String(book.year)}</Text>}
        {(!!book.pages || !!book.chapters) && (
          <Text style={styles.meta}>
            {[
              book.pages ? `${book.pages} páginas` : null,
              book.chapters ? `${book.chapters} capítulos` : null,
            ].filter(Boolean).join(" · ")}
          </Text>
        )}
        {(!!book.publisher || !!book.book_type) && (
          <Text style={styles.meta}>
            {[book.publisher, { ebook: "eBook", physical: "Físico", audio: "Audiolibro" }[book.book_type]]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        )}
        {Array.isArray(book.categories) && book.categories.length > 0 && (
          <View style={styles.categoriesRow}>
            {book.categories.map((cat) => (
              <View key={String(cat.name)} style={[styles.categoryChip, cat.is_primary && styles.categoryChipPrimary]}>
                <Text style={[styles.categoryChipText, cat.is_primary && styles.categoryChipTextPrimary]}>
                  {String(cat.name)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {!!description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Descripción</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
      )}

      {alreadyInLibrary && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Resumen</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Estado</Text>
                <Text style={styles.infoValue}>{STATUS_LABELS[status] ?? "—"}</Text>
              </View>
              {!!currentReadNumber && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Lectura</Text>
                  <Text style={styles.infoValue}>{currentReadNumber}</Text>
                </View>
              )}
              {!!startedAt && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Inicio</Text>
                  <Text style={styles.infoValue}>{formatDateEs(startedAt)}</Text>
                </View>
              )}
              {statusIsCompleted && !!finishedAt && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Fin</Text>
                  <Text style={styles.infoValue}>{formatDateEs(finishedAt)}</Text>
                </View>
              )}
              {statusIsReading && !!currentPage && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Página actual</Text>
                  <Text style={styles.infoValue}>{formatPoint(book, currentPage)}</Text>
                </View>
              )}
              {!!rating && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Valoración</Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons key={s} name={s <= rating ? "star" : "star-outline"} size={15} color={s <= rating ? colors.star : colors.textDim} />
                    ))}
                  </View>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handlePrimaryAction}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <>
                  <Ionicons name={actionIcon} size={20} color={colors.onAccent} />
                  <Text style={styles.actionBtnText}>{actionLabel}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {history.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Lecturas</Text>
              {history.map((h) => (
                <View key={h.user_book_id} style={styles.historyCard}>
                  <View style={styles.historyHead}>
                    <Text style={styles.historyTitle}>Lectura {h.read_number}</Text>
                    {!!h.rating && (
                      <View style={styles.starsRow}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Ionicons key={s} name={s <= h.rating ? "star" : "star-outline"} size={13} color={s <= h.rating ? colors.star : colors.textDim} />
                        ))}
                      </View>
                    )}
                  </View>
                  <Text style={styles.historyDates}>
                    {[formatDateEs(h.started_at), formatDateEs(h.finished_at)].filter(Boolean).join(" — ")}
                  </Text>
                  <Text style={styles.historyStats}>
                    {h.sessions} {h.sessions === 1 ? "sesión" : "sesiones"} · {h.pages_read} páginas · {formatMinutes(h.duration_seconds)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {!alreadyInLibrary && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() =>
              navigation.navigate("EditBook", {
                book: { ...book, google_id: book.id },
                mode: "create",
                onGoBack,
              })
            }
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.onAccent} />
            <Text style={styles.actionBtnText}>Agregar a mi biblioteca</Text>
          </TouchableOpacity>
        </View>
      )}

      {alreadyInLibrary && (
        <View style={styles.section} onLayout={onSectionLayout("notes")}>
          <Text style={styles.sectionTitle}>Notas</Text>
          <View style={styles.noteInputRow}>
            <TextInput
              style={styles.noteInput}
              placeholder="Escribe una nota..."
              placeholderTextColor={colors.placeholder}
              value={newNote}
              onChangeText={setNewNote}
              onFocus={onFieldFocus("notes")}
              multiline
            />
          </View>
          <View style={styles.pageRow}>
            <TextInput
              style={[styles.pageInput, { flex: 1 }]}
              placeholder="Página (opcional)"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              value={notePage}
              onChangeText={setNotePage}
              onFocus={onFieldFocus("notes")}
            />
            <TouchableOpacity style={styles.pageBtn} onPress={handleAddNote}>
              <Text style={styles.pageBtnText}>Agregar</Text>
            </TouchableOpacity>
          </View>
          {notes.map((note) => (
            <TouchableOpacity key={note.id} style={styles.noteCard} onLongPress={() => handleNoteLongPress(note)}>
              {note.page && <Text style={styles.notePage}>{formatPoint(book, note.page)}</Text>}
              <Text style={styles.noteContent}>{note.content}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showStartPicker && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          maximumDate={new Date()}
          onChange={(e, date) => handleStartDate(date)}
        />
      )}
      {showRereadPicker && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          maximumDate={new Date()}
          onChange={(e, date) => handleRereadDate(date)}
        />
      )}

      {alreadyInLibrary && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={styles.deleteBtnText}>Quitar de biblioteca</Text>
          </TouchableOpacity>
        </View>
      )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    topBar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: 20,
      paddingTop: 50,
    },
    topBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accent + "22",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    topBtnText: { color: colors.accent, fontWeight: "bold", fontSize: 14 },
    hero: { alignItems: "center", paddingTop: 12, paddingBottom: 30, paddingHorizontal: 20 },
    cover: { width: 120, height: 180, borderRadius: 10, marginBottom: 16 },
    noCover: { width: 120, height: 180, borderRadius: 10, backgroundColor: colors.surfaceAlt, justifyContent: "center", alignItems: "center", marginBottom: 16 },
    title: { fontSize: 20, fontWeight: "bold", color: colors.text, textAlign: "center", marginBottom: 6 },
    author: { fontSize: 15, color: colors.textMuted, marginBottom: 4 },
    meta: { fontSize: 13, color: colors.textDim },
    categoriesRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 10 },
    categoryChip: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryChipPrimary: { backgroundColor: colors.accent + "22", borderColor: colors.accent },
    categoryChipText: { fontSize: 11, color: colors.textMuted },
    categoryChipTextPrimary: { color: colors.accent, fontWeight: "bold" },
    description: { fontSize: 14, color: colors.text, lineHeight: 21 },
    section: { paddingHorizontal: 20, marginTop: 20 },
    sectionTitle: { fontSize: 16, fontWeight: "bold", color: colors.text, marginBottom: 12 },
    infoCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 10, marginBottom: 16 },
    infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    infoLabel: { fontSize: 14, color: colors.textMuted },
    infoValue: { fontSize: 14, color: colors.text, fontWeight: "600" },
    starsRow: { flexDirection: "row", gap: 2 },
    actionBtn: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    actionBtnText: { color: colors.onAccent, fontWeight: "bold", fontSize: 15 },
    historyCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10 },
    historyHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
    historyTitle: { fontSize: 15, fontWeight: "bold", color: colors.text },
    historyDates: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
    historyStats: { fontSize: 13, color: colors.textDim },
    pageRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    pageInput: { backgroundColor: colors.input, color: colors.text, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
    pageBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
    pageBtnText: { color: colors.onAccent, fontWeight: "bold" },
    deleteBtn: {
      backgroundColor: colors.danger + "22",
      borderRadius: 10,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginBottom: 40,
    },
    deleteBtnText: { color: colors.danger, fontWeight: "bold", fontSize: 15 },
    noteInputRow: { marginBottom: 8 },
    noteInput: { backgroundColor: colors.input, color: colors.text, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: "top" },
    noteCard: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginTop: 8 },
    notePage: { fontSize: 11, color: colors.accent, marginBottom: 4 },
    noteContent: { fontSize: 14, color: colors.text },
  });