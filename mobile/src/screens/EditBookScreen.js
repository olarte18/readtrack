import { useState } from "react";
import { View, Text, TextInput, Image, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDebouncedCallback } from "use-debounce";
import { useTheme } from "../contexts/ThemeContext";
import { AppAlert } from "../components/AppAlert";
import { updateBookFicha, updateBook, addBook } from "../services/api";
import { formatDateEs } from "../utils/dates";
import DateTimePicker from "@react-native-community/datetimepicker";

const BOOK_TYPES = [
  { key: "physical", label: "Físico" },
  { key: "ebook", label: "eBook" },
  { key: "audio", label: "Audiolibro" },
];

const READING_MODES = [
  { key: "page", label: "Página" },
  { key: "chapter", label: "Capítulo" },
  { key: "percentage", label: "Porcentaje" },
];

const STATUS_OPTIONS = [
  { key: "pending", label: "Pendiente" },
  { key: "reading", label: "Leyendo" },
  { key: "paused", label: "Pausado" },
  { key: "completed", label: "Completado" },
  { key: "wishlist", label: "Deseos" },
  { key: "abandoned", label: "Abandonado" },
];

export default function EditBookScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { book, dbId, mode } = route.params;
  const isCreate = mode === "create";
  const ubId = route.params?.ubId ?? book.id;

  const [title, setTitle] = useState(book.title ?? "");
  const [pages, setPages] = useState(book.pages ? String(book.pages) : "");
  const [chapters, setChapters] = useState(book.chapters ? String(book.chapters) : "");
  const [author, setAuthor] = useState(book.author ?? "");
  const [cover, setCover] = useState(book.cover ?? "");
  const [publisher, setPublisher] = useState(book.publisher ?? "");
  const [bookType, setBookType] = useState(book.book_type ?? null);
  const [readingMode, setReadingMode] = useState(book.reading_mode ?? "page");
  const [status, setStatus] = useState(book.status ?? "pending");
  const [currentPage, setCurrentPage] = useState(book.current_page ? String(book.current_page) : "");
  const [rating, setRating] = useState(book.rating ?? 0);
  const [startedAt, setStartedAt] = useState(book.started_at ? String(book.started_at).slice(0, 10) : "");
  const [finishedAt, setFinishedAt] = useState(book.finished_at ? String(book.finished_at).slice(0, 10) : "");
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [year, setYear] = useState(book.year ? String(book.year) : "");
  const [isbn, setIsbn] = useState(book.isbn ?? "");
  const [genre, setGenre] = useState(book.genre ?? "");
  const [description, setDescription] = useState(book.description ?? "");
  const [saving, setSaving] = useState(false);
  const [previewCover, setPreviewCover] = useState(book.cover ?? "");
  const [coverError, setCoverError] = useState(false);

  const debouncedPreview = useDebouncedCallback((url) => {
    setCoverError(false);
    setPreviewCover(url);
  }, 400);

  const handleCoverChange = (text) => {
    setCover(text);
    debouncedPreview(text);
  };

  const handleSave = async () => {
    if (!title.trim()) return AppAlert.alert("Error", "El título no puede quedar vacío");
    let pageCount = null;
    if (pages.trim()) {
      pageCount = parseInt(pages, 10);
      if (isNaN(pageCount) || pageCount <= 0) {
        return AppAlert.alert("Error", "Ingresa un número de páginas válido");
      }
    }
    let chapterCount = null;
    if (chapters.trim()) {
      chapterCount = parseInt(chapters, 10);
      if (isNaN(chapterCount) || chapterCount <= 0) {
        return AppAlert.alert("Error", "Ingresa un número de capítulos válido");
      }
    }
    let pageCountVal = null;
    if (currentPage.trim()) {
      pageCountVal = parseInt(currentPage, 10);
      if (isNaN(pageCountVal) || pageCountVal < 0) {
        return AppAlert.alert("Error", "Ingresa una página actual válida");
      }
      if (readingMode === "percentage" && pageCountVal > 100) {
        return AppAlert.alert("Error", "El porcentaje no puede superar 100");
      }
    }

    setSaving(true);
    try {
      const ficha = {
        title: title.trim(),
        author: author.trim(),
        cover: cover.trim(),
        pages: pageCount,
        chapters: chapterCount,
        year: year.trim(),
        isbn: isbn.trim(),
        description: description.trim(),
        genre: genre.trim(),
        publisher: publisher.trim(),
        book_type: bookType,
      };

      let result;
      if (isCreate) {
        result = await addBook(
          { ...ficha, google_id: book.google_id ?? book.id, reading_mode: readingMode },
          status
        );
      } else {
        result = await updateBookFicha(dbId, ficha);
        const ubUpdates = { status, reading_mode: readingMode };
        if (pageCountVal !== null) ubUpdates.current_page = pageCountVal;
        if (rating > 0) ubUpdates.rating = rating;
        if (startedAt.trim()) ubUpdates.started_at = startedAt.trim();
        if (finishedAt.trim()) ubUpdates.finished_at = finishedAt.trim();
        if (ubId) await updateBook(ubId, ubUpdates);
      }

      const updatedBook = {
        ...book,
        ...ficha,
        author: author.trim() || null,
        cover: cover.trim() || null,
        pages: pageCount,
        chapters: chapterCount,
        year: year.trim() || null,
        isbn: isbn.trim() || null,
        description: description.trim() || null,
        genre: genre.trim() || null,
        reading_mode: readingMode,
        status,
        current_page: pageCountVal,
        rating: rating > 0 ? rating : book.rating ?? null,
        started_at: startedAt.trim() || null,
        finished_at: finishedAt.trim() || null,
      };
      if (isCreate) {
        updatedBook.status = status;
        updatedBook.id = result?.id;
        updatedBook.db_id = result?.book_id;
      }
      AppAlert.alert(
        isCreate ? "Agregado" : "Guardado",
        isCreate ? `"${title.trim()}" está en tu biblioteca` : "Ficha del libro actualizada",
        [
          {
            text: "OK",
            onPress: () => {
              if (isCreate) {
                navigation.navigate("Main", { screen: "Home" });
              } else {
                navigation.navigate({
                  name: "BookDetail",
                  params: { book: updatedBook, onGoBack: route.params.onGoBack },
                  merge: true,
                });
              }
            },
          },
        ]
      );
    } catch {
      AppAlert.alert("Error", "No se pudo actualizar la ficha");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.title}>{isCreate ? "Agregar libro" : "Editar ficha"}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.previewWrap}>
        {previewCover && !coverError ? (
          <Image
            source={{ uri: previewCover }}
            style={styles.previewCover}
            onError={() => setCoverError(true)}
          />
        ) : (
          <View style={styles.previewNoCover}>
            <Ionicons name="book" size={48} color={colors.textDim} />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Título *</Text>
        <TextInput
          style={styles.input}
          placeholder="Nombre del libro"
          placeholderTextColor={colors.placeholder}
          value={title}
          onChangeText={setTitle}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Páginas</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 320"
          placeholderTextColor={colors.placeholder}
          keyboardType="numeric"
          value={pages}
          onChangeText={setPages}
        />
      </View>

      {readingMode === "chapter" && (
        <View style={styles.section}>
          <Text style={styles.label}>Capítulos</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. 24"
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
            value={chapters}
            onChangeText={setChapters}
          />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Autor</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Gabriel García Márquez"
          placeholderTextColor={colors.placeholder}
          value={author}
          onChangeText={setAuthor}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Portada (URL)</Text>
        <TextInput
          style={styles.input}
          placeholder="https://..."
          placeholderTextColor={colors.placeholder}
          value={cover}
          onChangeText={handleCoverChange}
          autoCapitalize="none"
          keyboardType="url"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Editorial</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Penguin Random House"
          placeholderTextColor={colors.placeholder}
          value={publisher}
          onChangeText={setPublisher}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Tipo de libro</Text>
        <View style={styles.segRow}>
          {BOOK_TYPES.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.segBtn, bookType === opt.key && styles.segBtnActive]}
              onPress={() => setBookType(opt.key)}
            >
              <Text style={[styles.segBtnText, bookType === opt.key && styles.segBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Año</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 2020"
          placeholderTextColor={colors.placeholder}
          keyboardType="numeric"
          value={year}
          onChangeText={setYear}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>ISBN</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 978-9584292153"
          placeholderTextColor={colors.placeholder}
          value={isbn}
          onChangeText={setIsbn}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Género</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Novela, Fantasía..."
          placeholderTextColor={colors.placeholder}
          value={genre}
          onChangeText={setGenre}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Descripción</Text>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          placeholder="Sinopsis o notas del libro..."
          placeholderTextColor={colors.placeholder}
          value={description}
          onChangeText={setDescription}
          multiline
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Modo de progreso</Text>
        <View style={styles.segRow}>
          {READING_MODES.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.segBtn, readingMode === opt.key && styles.segBtnActive]}
              onPress={() => setReadingMode(opt.key)}
            >
              <Text style={[styles.segBtnText, readingMode === opt.key && styles.segBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Estado</Text>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.statusBtn, status === opt.key && styles.statusBtnActive]}
              onPress={() => setStatus(opt.key)}
            >
              <Text style={[styles.statusBtnText, status === opt.key && styles.statusBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {!isCreate && (
        <>
          <View style={styles.section}>
            <Text style={styles.label}>
              {(readingMode === "percentage" ? "Porcentaje actual" : readingMode === "chapter" ? "Capítulo actual" : "Página actual")}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={readingMode === "percentage" ? "Ej. 40" : readingMode === "chapter" ? "Ej. 12" : "Ej. 132"}
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              maxLength={readingMode === "page" ? undefined : 3}
              value={currentPage}
              onChangeText={setCurrentPage}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Fechas</Text>
            <TouchableOpacity style={styles.dateRow} onPress={() => setShowStartPicker(true)}>
              <Text style={styles.dateLabel}>Inicio</Text>
              <Text style={styles.dateValue}>
                {startedAt ? formatDateEs(startedAt) : "Sin registrar"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dateRow} onPress={() => setShowEndPicker(true)}>
              <Text style={styles.dateLabel}>Fin</Text>
              <Text style={styles.dateValue}>
                {finishedAt ? formatDateEs(finishedAt) : "Sin registrar"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Valoración</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(star)}>
                  <Ionicons
                    name={star <= rating ? "star" : "star-outline"}
                    size={32}
                    color={star <= rating ? colors.star : colors.textDim}
                  />
                </TouchableOpacity>
              ))}
              {rating > 0 && (
                <TouchableOpacity style={styles.clearRating} onPress={() => setRating(0)}>
                  <Text style={styles.clearRatingText}>Quitar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </>
      )}

      {showStartPicker && (
        <DateTimePicker
          value={startedAt ? new Date(`${startedAt}T12:00:00`) : new Date()}
          mode="date"
          onChange={(e, date) => {
            setShowStartPicker(false);
            if (date) setStartedAt(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
          }}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={finishedAt ? new Date(`${finishedAt}T12:00:00`) : new Date()}
          mode="date"
          onChange={(e, date) => {
            setShowEndPicker(false);
            if (date) setFinishedAt(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
          }}
        />
      )}

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.saveBtnText}>{isCreate ? "Agregar a mi biblioteca" : "Guardar cambios"}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: 50 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    title: { fontSize: 24, fontWeight: "bold", color: colors.text },
    backBtn: { backgroundColor: colors.surface, borderRadius: 10, padding: 8 },
    previewWrap: { alignItems: "center", marginTop: 4, marginBottom: 8 },
    previewCover: {
      width: 120,
      height: 180,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.accent + "55",
    },
    previewNoCover: {
      width: 120,
      height: 180,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 2,
      borderColor: colors.border,
      justifyContent: "center",
      alignItems: "center",
    },
    section: { paddingHorizontal: 20, marginTop: 16 },
    label: { fontSize: 13, fontWeight: "bold", color: colors.textMuted, marginBottom: 8 },
    input: {
      backgroundColor: colors.input,
      color: colors.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
    },
    descriptionInput: { minHeight: 90, textAlignVertical: "top" },
    segRow: { flexDirection: "row", gap: 8 },
    segBtn: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
    segBtnActive: { backgroundColor: colors.accent },
    segBtnText: { color: colors.accent, fontSize: 13 },
    segBtnTextActive: { color: colors.onAccent, fontWeight: "bold" },
    statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    statusBtn: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    statusBtnActive: { backgroundColor: colors.accent },
    statusBtnText: { color: colors.accent, fontSize: 13 },
    statusBtnTextActive: { color: colors.onAccent, fontWeight: "bold" },
    dateRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 8 },
    dateLabel: { color: colors.textMuted, fontSize: 14 },
    dateValue: { color: colors.accent, fontSize: 14 },
    starsRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    clearRating: { marginLeft: 8 },
    clearRatingText: { color: colors.danger, fontSize: 13 },
    saveBtn: {
      marginTop: 24,
      marginHorizontal: 20,
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    saveBtnText: { color: colors.onAccent, fontWeight: "bold", fontSize: 16 },
  });