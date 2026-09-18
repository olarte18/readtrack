import { useEffect, useState, useCallback, useMemo } from "react";

import { getLibrary, getLibraryCached } from "../services/api";
import { View, Text, FlatList, Image, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";

const SORT_KEYS = [
  { key: "date", label: "Fecha" },
  { key: "title", label: "Título" },
  { key: "author", label: "Autor" },
  { key: "rating", label: "Rating" },
  { key: "pages", label: "Páginas" },
];

const FORMATS = [
  { key: "physical", label: "Físico" },
  { key: "ebook", label: "Ebook" },
  { key: "audio", label: "Audio" },
];

const STATUSES = [
  { key: "all", label: "Todos" },
  { key: "reading", label: "Leyendo" },
  { key: "paused", label: "Pausado" },
  { key: "completed", label: "Leídos" },
  { key: "pending", label: "Pendiente" },
  { key: "wishlist", label: "Deseos" },
  { key: "abandoned", label: "Abandonado" },
];

export default function HomeScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { filterStatus } = route?.params ?? {};
  const [filter, setFilter] = useState(filterStatus ?? "all");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [ratingFilter, setRatingFilter] = useState(null);
  const [formatFilter, setFormatFilter] = useState(null);
  const [genreFilter, setGenreFilter] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState(null);

  const fetchLibrary = async () => {
    setLoading(true);
    const cached = await getLibraryCached();
    if (cached) {
      setBooks(cached);
      setLoading(false);
    }
    try {
      const data = await getLibrary();
      setBooks(data);
    } catch (error) {
      console.error("Error cargando biblioteca:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresca al volver al tab: refleja cambios de estado, imports y sesiones
  useFocusEffect(
    useCallback(() => {
      fetchLibrary();
    }, [])
  );

  const filteredBooks = useMemo(() => {
    return books.filter((b) => {
      if (filter !== "all" && b.status !== filter) return false;
      if (ratingFilter === "none" && (b.rating ?? 0) > 0) return false;
      if (typeof ratingFilter === "number" && b.rating !== ratingFilter) return false;
      if (formatFilter && b.book_type !== formatFilter) return false;
      if (genreFilter && (b.genre ?? "") !== genreFilter) return false;
      if (categoryFilter) {
        const has = (b.categories ?? []).some((c) => c.name === categoryFilter);
        if (!has) return false;
      }
      return true;
    });
  }, [books, filter, ratingFilter, formatFilter, genreFilter, categoryFilter]);

  const sortedBooks = useMemo(() => {
    const list = [...filteredBooks];
    const dir = sortDir === "asc" ? 1 : -1;
    const rawDate = (b) => {
      const raw = b.created_at ?? b.started_at ?? b.finished_at;
      if (raw == null) return null;
      if (typeof raw === "number") return raw;
      const t = Date.parse(raw);
      return Number.isFinite(t) ? t : null;
    };
    const valueFor = (b) => {
      if (sortKey === "title") return (b.title ?? "").toLowerCase();
      if (sortKey === "author") return (b.author ?? "").toLowerCase();
      if (sortKey === "rating") return (b.rating ?? 0) > 0 ? b.rating : null;
      if (sortKey === "pages") return b.pages || null;
      return rawDate(b);
    };
    const cmpId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) * dir;
    list.sort((x, y) => {
      const ax = valueFor(x);
      const ay = valueFor(y);
      if (ax == null && ay == null) return cmpId(x, y);
      if (ax == null) return 1;
      if (ay == null) return -1;
      if (ax === ay) return cmpId(x, y);
      return ax < ay ? -dir : dir;
    });
    return list;
  }, [filteredBooks, sortKey, sortDir]);

  const changeSortKey = (key) => {
    setSortKey(key);
    setSortDir(key === "title" || key === "author" ? "asc" : "desc");
    setSortOpen(false);
  };

  const sortDirLabel =
    sortKey === "title" || sortKey === "author"
      ? sortDir === "asc" ? "A→Z" : "Z→A"
      : sortDir === "asc" ? "Menor→Mayor" : "Mayor→Menor";

  const activeFilters = [ratingFilter, formatFilter, genreFilter, categoryFilter].filter((v) => v != null).length;

  const genres = useMemo(() => {
    return [...new Set(books.map((b) => b.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  }, [books]);

  const categoryNames = useMemo(() => {
    return [...new Set(books.flatMap((b) => (b.categories ?? []).map((c) => c.name)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  }, [books]);

  const ratingOptions = [
    { key: null, label: "Todas" },
    { key: "none", label: "Sin calificar" },
    ...Array.from({ length: 5 }, (_, i) => ({ key: i + 1, label: "★".repeat(i + 1) })),
  ];

  const clearFilters = () => {
    setRatingFilter(null);
    setFormatFilter(null);
    setGenreFilter(null);
    setCategoryFilter(null);
  };

  const renderPills = (options, value, setValue) =>
    options.map((opt) => {
      const active = value === opt.key;
      return (
        <TouchableOpacity
          key={String(opt.key)}
          style={[styles.filterBtn, active && styles.filterBtnActive]}
          onPress={() => setValue(opt.key)}
        >
          <Text style={[styles.filterText, active && styles.filterTextActive]}>{opt.label}</Text>
        </TouchableOpacity>
      );
    });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mi Biblioteca</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Search")}>
          <Text style={styles.addBtn}>+ Agregar</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.statusWrap}>
        <FlatList
          horizontal
          data={STATUSES}
          keyExtractor={(f) => f.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusBarRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.statusPill, filter === item.key && styles.statusPillActive]}
              onPress={() => setFilter(item.key)}
            >
              <Text style={[styles.statusPillText, filter === item.key && styles.statusPillTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
      <View style={styles.sortRow}>
        <TouchableOpacity style={styles.sortDropdown} onPress={() => setSortOpen(true)}>
          <Text style={styles.sortDropdownText}>{SORT_KEYS.find((s) => s.key === sortKey)?.label}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.accent} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.sortDirBtn} onPress={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}>
          <Text style={styles.sortDirText}>{sortDirLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filtersBtn} onPress={() => setFilterOpen(true)}>
          <Ionicons name="options-outline" size={15} color={colors.accent} />
          <Text style={styles.filtersBtnText}>Filtrar</Text>
          {activeFilters > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeFilters}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={sortedBooks}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate("BookDetail", { book: item, onGoBack: fetchLibrary })}
              onLongPress={() =>
                navigation.navigate("EditBook", { book: item, dbId: item.db_id, ubId: item.id, onGoBack: fetchLibrary })
              }
              delayLongPress={400}
            >
              {item.cover ? (
                <Image source={{ uri: item.cover }} style={styles.cover} />
              ) : (
                <View style={styles.noCover}>
                  <Ionicons name="book" size={26} color={colors.textDim} />
                </View>
              )}
              <View style={styles.info}>
                <Text style={styles.bookTitle} numberOfLines={2}>{String(item.title)}</Text>
                <Text style={styles.author} numberOfLines={1}>{String(item.author)}</Text>
                <View style={styles.statusRow}>
                  {item.status === "completed" && <Text style={styles.statusBadge}>Completado</Text>}
                  {item.status === "reading" && <Text style={styles.statusBadge}>Leyendo</Text>}
                  {item.status === "pending" && <Text style={styles.statusBadge}>Pendiente</Text>}
                  {item.status === "abandoned" && <Text style={styles.statusBadge}>Abandonado</Text>}
                  {item.status === "wishlist" && <Text style={styles.statusBadge}>Deseos</Text>}
                  {item.status === "paused" && <Text style={styles.statusBadge}>Pausado</Text>}
                </View>
                {item.status === "reading" && !!item.pages && (
                  <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: `${Math.min((item.current_page / item.pages) * 100, 100)}%` }]} />
                  </View>
                )}
                {item.status === "reading" && (
                  <Text style={styles.pageText}>
                    Página {item.current_page ?? 0}{item.pages ? ` de ${item.pages}` : ""}
                  </Text>
                )}
                {item.status === "completed" && item.rating > 0 && (
                  <View style={styles.ratingRow}>
                    {Array.from({ length: item.rating }).map((_, i) => (
                      <Ionicons key={i} name="star" size={12} color={colors.star} />
                    ))}
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {books.length === 0
                ? "No tienes libros aún\nBusca uno para empezar"
                : "Ningún libro coincide con los filtros"}
            </Text>
          }
          onRefresh={fetchLibrary}
          refreshing={loading}
        />
      )}

      <Modal visible={sortOpen} transparent animationType="slide" onRequestClose={() => setSortOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setSortOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Ordenar por</Text>
            <View style={styles.sortOptions}>
              {SORT_KEYS.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.sortOption, sortKey === s.key && styles.sortOptionActive]}
                  onPress={() => changeSortKey(s.key)}
                >
                  <Text style={[styles.sortOptionText, sortKey === s.key && styles.sortOptionTextActive]}>{s.label}</Text>
                  {sortKey === s.key && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setFilterOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Filtrar biblioteca</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitle}>Calificación</Text>
              <View style={styles.sectionWrap}>{renderPills(ratingOptions, ratingFilter, setRatingFilter)}</View>

              <Text style={styles.sectionTitle}>Formato</Text>
              <View style={styles.sectionWrap}>
                {renderPills([{ key: null, label: "Todas" }, ...FORMATS], formatFilter, setFormatFilter)}
              </View>

              <Text style={styles.sectionTitle}>Género</Text>
              <View style={styles.sectionWrap}>
                {renderPills([{ key: null, label: "Todos" }, ...genres.map((g) => ({ key: g, label: g }))], genreFilter, setGenreFilter)}
              </View>

              <Text style={styles.sectionTitle}>Categorías</Text>
              <View style={styles.sectionWrap}>
                {renderPills([{ key: null, label: "Todas" }, ...categoryNames.map((c) => ({ key: c, label: c }))], categoryFilter, setCategoryFilter)}
              </View>
            </ScrollView>
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
                <Text style={styles.clearBtnText}>Limpiar filtros</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.doneBtn} onPress={() => setFilterOpen(false)}>
                <Text style={styles.doneBtnText}>Listo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 50 },
    title: { fontSize: 24, fontWeight: "bold", color: colors.text },
    addBtn: { color: colors.accent, fontSize: 16, fontWeight: "600" },
    card: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 12, marginHorizontal: 16, marginVertical: 6, padding: 12, alignItems: "center" },
    cover: { width: 65, height: 95, borderRadius: 6 },
    noCover: { width: 65, height: 95, borderRadius: 6, backgroundColor: colors.surfaceAlt, justifyContent: "center", alignItems: "center" },
    info: { flex: 1, marginLeft: 12 },
    bookTitle: { fontSize: 15, fontWeight: "bold", color: colors.text, marginBottom: 3 },
    author: { fontSize: 12, color: colors.textMuted, marginBottom: 6 },
    statusRow: { flexDirection: "row", marginBottom: 6 },
    statusBadge: { fontSize: 12, color: colors.accent },
    progressContainer: { height: 4, backgroundColor: colors.surfaceAlt, borderRadius: 2, marginBottom: 4, overflow: "hidden" },
    progressBar: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
    pageText: { fontSize: 11, color: colors.textDim },
    ratingRow: { flexDirection: "row", gap: 2, marginTop: 2 },
    empty: { color: colors.textDim, textAlign: "center", marginTop: 60, fontSize: 16, lineHeight: 26 },
    statusWrap: { height: 30, marginBottom: 20, overflow: "hidden" },
    statusBarRow: { flexGrow: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingRight: 24 },
    statusPill: { height: 30, justifyContent: "center", alignItems: "center", backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 12, marginRight: 8, borderWidth: 1, borderColor: colors.border },
    statusPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    statusPillText: { color: colors.textDim, fontSize: 12 },
    statusPillTextActive: { color: colors.onAccent },
    filterBtn: { backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
    filterBtnActive: { backgroundColor: colors.accent },
    filterText: { color: colors.textDim, fontSize: 12 },
    filterTextActive: { color: colors.onAccent },
    sortRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
    sortDropdown: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: colors.accent },
    sortDropdownText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
    sortDirBtn: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, backgroundColor: colors.surface, borderColor: colors.accent },
    sortDirText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
    filtersBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
    filtersBtnText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
    badge: { backgroundColor: colors.accent, borderRadius: 10, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
    badgeText: { color: colors.onAccent, fontSize: 11, fontWeight: "bold" },
    sortOptions: { marginTop: 8 },
    sortOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 4 },
    sortOptionActive: {},
    sortOptionText: { fontSize: 16, color: colors.text },
    sortOptionTextActive: { color: colors.accent, fontWeight: "bold" },
    modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28, maxHeight: "75%" },
    sheetTitle: { fontSize: 18, fontWeight: "bold", color: colors.text, marginBottom: 4, textAlign: "center" },
    sectionTitle: { fontSize: 14, fontWeight: "600", color: colors.textMuted, marginTop: 18, marginBottom: 10 },
    sectionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    sheetFooter: { flexDirection: "row", gap: 12, marginTop: 24 },
    clearBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.border },
    clearBtnText: { color: colors.textMuted, fontSize: 15, fontWeight: "600" },
    doneBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", backgroundColor: colors.accent },
    doneBtnText: { color: colors.onAccent, fontSize: 15, fontWeight: "bold" },
  });