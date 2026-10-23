import { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { getStats, getReadingBreakdown, getStatsActivity, getLibrary, logUnexpectedError } from "../services/api";
import { getPending } from "../services/offline";
import { activityWithLocal } from "../utils/offlineCompute";
import { filterCompletedBooksForBreakdown } from "../utils/breakdownBooks";
import { getLongestCompletedBooks, groupCompletedBooksByMonth, getUndatedCompletedBooks } from "../utils/readingHistory";
import { todayString } from "../utils/dates";
import ActivityChart from "../components/ActivityChart";
import ProgressRing from "../components/ProgressRing";
import BookCard from "../components/BookCard";

const STAT_ITEMS = [
  { key: "completed", label: "Leídos", icon: "checkmark-circle" },
  { key: "reading", label: "Leyendo", icon: "book" },
  { key: "paused", label: "Pausados", icon: "pause-circle" },
  { key: "pending", label: "Pendientes", icon: "time" },
  { key: "wishlist", label: "Lista de deseos", icon: "star" },
  { key: "abandoned", label: "Abandonados", icon: "close-circle" },
];

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const isoWeekStart = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d.getTime() - dow * 86400000);
  return monday.toISOString().slice(0, 10);
};

const todayIso = (diffDays = 0, base = todayString()) => {
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + diffDays);
  return d.toISOString().slice(0, 10);
};

const formatHoursNum = (minutes) => {
  const h = (Number(minutes) || 0) / 60;
  return h.toFixed(1).replace(".", ",").replace(",0", "");
};

const formatHours = (minutes) => `${formatHoursNum(minutes)} h`;

const formatMinutes = (minutes) => String(Math.round(Number(minutes) || 0));

export default function StatsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const now = useMemo(() => {
    const t = todayString().split("-");
    return { year: Number(t[0]), month: Number(t[1]), iso: todayString() };
  }, []);

  const [view, setView] = useState("year");
  const [yearMetric, setYearMetric] = useState("hours");
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [weekDate, setWeekDate] = useState(now.iso);
  const [activity, setActivity] = useState(null);
  const [stats, setStats] = useState(null);
  const [genreStats, setGenreStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBreakdown, setSelectedBreakdown] = useState(null);
  const [breakdownBooks, setBreakdownBooks] = useState([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState(false);
  const [library, setLibrary] = useState(null);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState(false);

  const loadBreakdownBooks = async (selection) => {
    setBreakdownLoading(true);
    setBreakdownError(false);
    setBreakdownBooks([]);
    try {
      const library = await getLibrary();
      setBreakdownBooks(filterCompletedBooksForBreakdown(library, selection));
    } catch (error) {
      setBreakdownError(true);
      logUnexpectedError(error);
    } finally {
      setBreakdownLoading(false);
    }
  };

  const openBreakdownBooks = (kind, item) => {
    const selection = { kind, name: item.name };
    setSelectedBreakdown(selection);
    loadBreakdownBooks(selection);
  };

  const closeBreakdownBooks = () => setSelectedBreakdown(null);

  const fetchLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError(false);
    try {
      setLibrary(await getLibrary());
    } catch (error) {
      setLibraryError(true);
      logUnexpectedError(error);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await getStats(year);
      setStats(res);
    } catch (e) {
      logUnexpectedError(e);
    }
  }, [year]);

  const fetchActivity = useCallback(async () => {
    const params = { view };
    if (view === "year") params.year = year;
    else if (view === "month") { params.year = year; params.month = month; }
    else params.date = weekDate;
    const res = await getStatsActivity(params);
    setActivity(res?.fromCache ? activityWithLocal(res, await getPending()) : res);
  }, [view, year, month, weekDate]);

  useEffect(() => {
    let cancelled = false;
    getStats(year)
      .then((res) => { if (!cancelled) setStats(res); })
      .catch(logUnexpectedError);
    return () => { cancelled = true; };
  }, [year]);

  useEffect(() => {
    let cancelled = false;
    getReadingBreakdown()
      .then((res) => { if (!cancelled) setGenreStats(res); })
      .catch(logUnexpectedError);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { view };
    if (view === "year") params.year = year;
    else if (view === "month") { params.year = year; params.month = month; }
    else params.date = weekDate;
    getStatsActivity(params)
      .then(async (res) => { if (!cancelled) setActivity(res?.fromCache ? activityWithLocal(res, await getPending()) : res); })
      .catch(logUnexpectedError)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [view, year, month, weekDate]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const [, , breakdown] = await Promise.all([fetchStats(), fetchActivity(), getReadingBreakdown(), fetchLibrary()]);
      setGenreStats(breakdown);
    } catch (e) {
      logUnexpectedError(e);
    } finally {
      setRefreshing(false);
    }
  };

  const selectView = (v) => {
    setView(v);
    if (v === "week" && Number(String(weekDate).slice(0, 4)) !== year) {
      setWeekDate(year === now.year ? now.iso : `${year}-12-31`);
    }
    if (v === "month") {
      const m = year === now.year ? now.month : 12;
      setMonth(m);
    }
  };

  const canGoNextYear = year < now.year;
  const goYear = (delta) => {
    const ny = year + delta;
    if (delta > 0 && !canGoNextYear) return;
    if (ny < 1970) return;
    setYear(ny);
    if (view === "week") setWeekDate(ny === now.year ? now.iso : `${ny}-12-31`);
    if (view === "month") setMonth(ny === now.year ? now.month : 12);
  };

  const atCurrentMonth = year === now.year && month === now.month;
  const atCurrentWeek = isoWeekStart(weekDate) >= isoWeekStart(now.iso);

  const goPeriod = (delta) => {
    if (view === "month") {
      if (delta > 0 && atCurrentMonth) return;
      let ny = year;
      let nm = month + delta;
      if (nm < 1) { nm = 12; ny -= 1; }
      if (nm > 12) { nm = 1; ny += 1; }
      if (ny > now.year || (ny === now.year && nm > now.month)) return;
      setYear(ny);
      setMonth(nm);
    } else {
      if (delta > 0 && atCurrentWeek) return;
      const iso = todayIso(delta * 7, weekDate);
      const ny = Number(iso.slice(0, 4));
      if (ny > now.year) return;
      setWeekDate(iso);
      if (ny !== year) setYear(ny);
    }
  };

  const chartData = useMemo(() => {
    if (!activity) return [];
    const buckets = activity.buckets || [];
    if (view === "month") {
      const daily = activity.daily_goal_minutes;
      const goal = daily != null ? daily * 7 : null;
      const groups = new Map();
      for (const b of buckets) {
        const day = Number(b.label);
        if (!day) continue;
        const key = isoWeekStart(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
        groups.set(key, (groups.get(key) || 0) + b.minutes);
      }
      const keys = [...groups.keys()].sort();
      return keys.map((key, i) => {
        const value = groups.get(key);
        return {
          label: `S${i + 1}`,
          value,
          met: goal != null && value >= goal && value > 0,
        };
      });
    }
    if (view === "week") {
      const goal = activity.daily_goal_minutes;
      return buckets.map((b) => ({
        label: b.label,
        value: b.minutes,
        met: goal != null && b.minutes >= goal && b.minutes > 0,
      }));
    }
    const usesBooks = yearMetric === "books";
    const goal = usesBooks ? activity.monthly_goal_books : activity.monthly_goal_minutes;
    return buckets.map((b) => {
      const value = usesBooks ? b.books ?? 0 : b.minutes;
      return {
        label: b.label,
        value,
        met: goal != null && value >= goal && value > 0,
      };
    });
  }, [activity, view, year, month, yearMetric]);

  const weekLabel = useMemo(() => {
    if (!activity?.week_start) return "";
    const d = new Date(`${activity.week_start}T12:00:00Z`);
    return `Semana del ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)}`;
  }, [activity]);

  const completed = stats?.completed_this_year ?? 0;
  const goal = stats?.goal_this_year;
  const ringPct = goal > 0 ? Math.round((completed / goal) * 100) : 0;
  const booksByPages = useMemo(
    () => getLongestCompletedBooks(library, year),
    [library, year]
  );
  const booksByMonth = useMemo(
    () => groupCompletedBooksByMonth(library, year),
    [library, year]
  );
  const undatedBooksCount = useMemo(
    () => getUndatedCompletedBooks(library).length,
    [library]
  );

  const renderReadingBook = (book) => {
    const type = {
      physical: "Físico",
      ebook: "eBook",
      audio: "Audiolibro",
    }[book.book_type] ?? "Tipo no indicado";
    const pages = Number(book.pages);
    const pagesLabel = Number.isFinite(pages) && pages > 0 ? `${pages} páginas` : "Páginas no registradas";
    return (
      <TouchableOpacity
        key={book.db_id ?? book.id}
        style={styles.readingBookRow}
        accessibilityRole="button"
        accessibilityLabel={`${book.title}, ${book.author || "autor desconocido"}, ${pagesLabel}, ${type}`}
        accessibilityHint="Abre los detalles del libro"
        onPress={() => navigation.navigate("BookDetail", { book, onGoBack: refresh })}
      >
        {book.cover ? (
          <Image
            source={{ uri: book.cover }}
            style={styles.readingBookCover}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          />
        ) : (
          <View
            style={styles.readingBookNoCover}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="book-outline" size={22} color={colors.textDim} accessible={false} />
          </View>
        )}
        <View style={styles.readingBookInfo}>
          <Text style={styles.readingBookTitle} numberOfLines={2}>{book.title}</Text>
          {!!book.author && <Text style={styles.readingBookAuthor} numberOfLines={1}>{book.author}</Text>}
        </View>
        <View style={styles.readingBookMeta}>
          <Text style={styles.readingBookPages}>{pagesLabel}</Text>
          <Text style={styles.readingBookType}>{type}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !activity) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Estadísticas</Text>
        <View style={styles.yearControl}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Año anterior: ${year - 1}`} onPress={() => goYear(-1)} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={colors.accent} accessible={false} />
          </TouchableOpacity>
          <Text style={styles.yearText}>{year}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Siguiente año: ${year + 1}`} onPress={() => goYear(1)} disabled={!canGoNextYear} hitSlop={8}>
            <Ionicons name="chevron-forward" size={18} color={canGoNextYear ? colors.accent : colors.textDim} accessible={false} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.segment}>
        {[["week", "Semana"], ["month", "Mes"], ["year", "Año"]].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.segBtn, view === key && styles.segBtnActive]}
            accessibilityRole="button"
            accessibilityLabel={`Ver por ${label}`}
            onPress={() => selectView(key)}
          >
            <Text style={[styles.segText, view === key && styles.segTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {(view === "week" || view === "month") && (
        <View style={styles.periodRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Periodo anterior" onPress={() => goPeriod(-1)} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.accent} accessible={false} />
          </TouchableOpacity>
          <Text style={styles.periodLabel}>
            {view === "month" ? `${MONTH_NAMES[month - 1]} ${year}` : weekLabel}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Periodo siguiente"
            onPress={() => goPeriod(1)}
            disabled={view === "month" ? atCurrentMonth : atCurrentWeek}
            hitSlop={8}
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={view === "month" ? (atCurrentMonth ? colors.textDim : colors.accent) : (atCurrentWeek ? colors.textDim : colors.accent)}
              accessible={false}
            />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {view === "year" && yearMetric === "books"
              ? "Libros leídos"
              : view === "week"
                ? "Minutos leídos"
                : "Horas leídas"}
          </Text>
          {view === "year" && (
            <View style={styles.unitSeg}>
              {[["books", "Libros"], ["hours", "Horas"]].map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.unitBtn, yearMetric === key && styles.unitBtnActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Medir en ${label}`}
                  onPress={() => setYearMetric(key)}
                >
                  <Text style={[styles.unitText, yearMetric === key && styles.unitTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <ActivityChart
          data={chartData}
          colors={colors}
          formatValue={
            view === "year"
              ? yearMetric === "books"
                ? undefined
                : formatHoursNum
              : view === "week"
                ? formatMinutes
                : formatHours
          }
        />
      </View>

      <View style={styles.totalsRow}>
        {[
          { label: "Horas", value: formatHours(activity?.totals?.minutes) },
          { label: "Páginas", value: activity?.totals?.pages ?? 0 },
          { label: "Sesiones", value: activity?.totals?.sessions ?? 0 },
          { label: "Días", value: activity?.totals?.active_days ?? 0 },
        ].map((t) => (
          <View key={t.label} style={styles.totalTile}>
            <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{t.value}</Text>
            <Text style={styles.totalLabel}>{t.label}</Text>
          </View>
        ))}
      </View>

      {goal ? (
        <TouchableOpacity style={styles.goalCard} accessibilityRole="button" accessibilityLabel={`Meta anual ${year}: ${completed} de ${goal} libros`} onPress={() => navigation.navigate("GoalDetail", { type: "annual", metric: "books", year })}>
          <ProgressRing
            percent={ringPct}
            radius={30}
            borderWidth={8}
            color={colors.accent}
            trackColor={colors.surfaceAlt}
            bgColor={colors.surface}
            completedColor={colors.calendarComplete}
          >
            <Text style={styles.ringNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{Math.round(ringPct)}%</Text>
          </ProgressRing>
          <View style={styles.goalInfo}>
            <Text style={styles.goalTitle}>Meta anual {year}</Text>
            <Text style={styles.goalText}>
              {completed} de {goal} libros
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ) : (
        <View style={styles.noGoalRow}>
          <Text style={styles.noGoalText}>
            Libros terminados en {year}: <Text style={styles.noGoalBold}>{completed}</Text>
          </Text>
        </View>
      )}

      <Text style={styles.breakdownHint}>Toca un género, autor o editorial para ver sus libros.</Text>
      {[
        ["genre", "Géneros que has leído", genreStats?.genres, "Cuando termines libros con género registrado, verás aquí tus patrones de lectura."],
        ["author", "Autores que más has leído", genreStats?.authors, "Cuando termines libros con autor registrado, verás aquí tus autores más leídos."],
        ["publisher", "Editoriales", genreStats?.publishers, "Cuando termines libros con editorial registrada, verás aquí tus editoriales más frecuentes."],
      ].map(([kind, title, items, emptyText]) => (
        <View key={title}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <View style={styles.genreCard}>
            {items?.length ? (
              items.slice(0, 5).map((item) => {
                const maxBooks = items[0].books;
                return (
                  <TouchableOpacity
                    key={item.name}
                    style={styles.genreRow}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver ${item.books} ${item.books === 1 ? "libro" : "libros"} terminados de ${kind === "genre" ? "género" : kind === "author" ? "autor" : "editorial"} ${item.name}`}
                    onPress={() => openBreakdownBooks(kind, item)}
                  >
                    <View style={styles.genreHeading}>
                      <Text style={styles.genreName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.genreCount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{item.books}</Text>
                    </View>
                    <View style={styles.genreTrack} accessible={false}>
                      <View style={[styles.genreFill, { width: `${Math.max(8, (item.books / maxBooks) * 100)}%` }]} />
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={styles.genreEmpty}>
                {genreStats ? emptyText : "Cargando tus estadísticas…"}
              </Text>
            )}
          </View>
        </View>
      ))}
      <Text style={styles.sectionTitle}>Tu biblioteca</Text>
      <View style={styles.grid}>
        {STAT_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.statCard}
            accessibilityRole="button"
            accessibilityLabel={`Ver libros ${item.label}`}
            onPress={() => navigation.navigate("Home", { filterStatus: item.key })}
          >
            <Ionicons name={item.icon} size={24} color={colors.textMuted} style={styles.icon} />
            <Text style={styles.statNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{stats?.[item.key] ?? 0}</Text>
            <Text style={styles.statLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.bigStatsRow}>
        <View style={styles.bigStat}>
          <Text style={styles.bigStatNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{stats?.total_pages ?? 0}</Text>
          <Text style={styles.bigStatLabel}>Páginas leídas</Text>
        </View>
        <View style={styles.bigStat}>
          <View style={styles.bigStatTop}>
            <Ionicons name="star" size={18} color={colors.star} />
            <Text style={styles.bigStatNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {stats?.avg_rating > 0 ? stats.avg_rating : "—"}
            </Text>
          </View>
          <Text style={styles.bigStatLabel}>Rating promedio</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Libros con más páginas · {year}</Text>
      <View style={styles.readingHistoryCard}>
        {libraryLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : libraryError ? (
          <View style={styles.historyEmptyState}>
            <Text style={styles.historyEmpty}>No se pudo cargar tu biblioteca.</Text>
            <TouchableOpacity style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Volver a cargar tu biblioteca" onPress={fetchLibrary}>
              <Text style={styles.retryText}>Intentar de nuevo</Text>
            </TouchableOpacity>
          </View>
        ) : booksByPages.length ? (
          booksByPages.map(renderReadingBook)
        ) : (
          <Text style={styles.historyEmpty}>No hay libros terminados con páginas registradas en {year}.</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Libros terminados por mes · {year}</Text>
      {libraryLoading ? (
        <View style={styles.readingHistoryCard}><ActivityIndicator color={colors.accent} /></View>
      ) : libraryError ? (
        <View style={styles.readingHistoryCard}>
          <Text style={styles.historyEmpty}>No se pudo cargar el historial de lectura.</Text>
        </View>
      ) : booksByMonth.length ? (
        booksByMonth.map((group) => {
          const monthNumber = Number(group.key.slice(5, 7));
          return (
            <View key={group.key} style={styles.readingHistoryCard}>
              <View style={styles.historyMonthHeader}>
                <Text style={styles.historyMonthTitle}>{MONTH_NAMES[monthNumber - 1]} {year}</Text>
                <Text style={styles.historyMonthCount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{group.books.length} {group.books.length === 1 ? "libro" : "libros"}</Text>
              </View>
              {group.books.map(renderReadingBook)}
            </View>
          );
        })
      ) : (
        <View style={styles.readingHistoryCard}>
          <Text style={styles.historyEmpty}>No hay libros terminados registrados en {year}.</Text>
        </View>
      )}
      {!libraryLoading && !libraryError && undatedBooksCount > 0 && (
        <Text style={styles.undatedNote}>
          {undatedBooksCount} {undatedBooksCount === 1 ? "libro terminado no tiene" : "libros terminados no tienen"} fecha de finalización registrada y no aparece en los meses.
        </Text>
      )}
      </ScrollView>

      <Modal visible={!!selectedBreakdown} transparent animationType="slide" onRequestClose={closeBreakdownBooks}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeBreakdownBooks} accessible={false} />
          <View style={styles.modalSheet} accessibilityViewIsModal>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeading}>
                <Text style={styles.modalTitle} numberOfLines={2}>
                  Libros de {selectedBreakdown?.kind === "genre" ? "género" : selectedBreakdown?.kind === "author" ? "autor" : "editorial"}: {selectedBreakdown?.name}
                </Text>
                {!breakdownLoading && !breakdownError && (
                  <Text style={styles.modalSubtitle}>
                    {breakdownBooks.length} {breakdownBooks.length === 1 ? "libro terminado" : "libros terminados"}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Cerrar lista de libros"
                onPress={closeBreakdownBooks}
              >
                <Ionicons name="close" size={22} color={colors.textMuted} accessible={false} />
              </TouchableOpacity>
            </View>
            {breakdownLoading ? (
              <View style={styles.modalState}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : breakdownError ? (
              <View style={styles.modalState}>
                <Text style={styles.modalMessage}>No se pudo cargar la lista de libros.</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Volver a cargar los libros"
                  onPress={() => loadBreakdownBooks(selectedBreakdown)}
                >
                  <Text style={styles.retryText}>Intentar de nuevo</Text>
                </TouchableOpacity>
              </View>
            ) : breakdownBooks.length ? (
              <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                {breakdownBooks.map((book) => (
                  <BookCard
                    key={book.db_id ?? book.id}
                    book={book}
                    onPress={() => {
                      closeBreakdownBooks();
                      navigation.navigate("BookDetail", { book, onGoBack: refresh });
                    }}
                  />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.modalState}>
                <Text style={styles.modalMessage}>No encontramos libros terminados en esta estadística.</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
    container: { flexGrow: 1, backgroundColor: colors.background, paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    title: { fontSize: 24, fontWeight: "bold", color: colors.text },
    yearControl: { flexDirection: "row", alignItems: "center", gap: 10 },
    yearText: { fontSize: 18, fontWeight: "bold", color: colors.text, minWidth: 56, textAlign: "center" },
    segment: { flexDirection: "row", backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 3, marginBottom: 14 },
    segBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
    segBtnActive: { backgroundColor: colors.accent },
    segText: { fontSize: 14, color: colors.textMuted, fontWeight: "600" },
    segTextActive: { color: colors.surface, fontWeight: "bold" },
    periodRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, marginBottom: 12 },
    periodLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
    card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    cardTitle: { fontSize: 14, fontWeight: "bold", color: colors.text },
    unitSeg: { flexDirection: "row", backgroundColor: colors.surfaceAlt, borderRadius: 8, padding: 2 },
    unitBtn: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
    unitBtnActive: { backgroundColor: colors.accent },
    unitText: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
    unitTextActive: { color: colors.surface, fontWeight: "bold" },
    totalsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    totalTile: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 4, paddingVertical: 12, alignItems: "center" },
    totalValue: { width: "100%", textAlign: "center", flexShrink: 1, fontSize: 18, fontWeight: "bold", color: colors.accent },
    totalLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
    goalCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, gap: 14 },
    goalInfo: { flex: 1 },
    goalTitle: { fontSize: 14, fontWeight: "bold", color: colors.text },
    goalText: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    ringNumber: { fontSize: 13, fontWeight: "bold", color: colors.accent },
    noGoalRow: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    noGoalText: { fontSize: 13, color: colors.textMuted },
    noGoalBold: { color: colors.accent, fontWeight: "bold" },
    sectionTitle: { fontSize: 16, fontWeight: "bold", color: colors.text, marginBottom: 8, marginTop: 4 },
    breakdownHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 10 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    statCard: { backgroundColor: colors.surface, borderRadius: 10, padding: 10, alignItems: "center", minWidth: "30%", flexGrow: 1 },
    icon: { marginBottom: 4 },
    statNumber: { width: "100%", textAlign: "center", flexShrink: 1, fontSize: 20, fontWeight: "bold", color: colors.accent },
    statLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2, textAlign: "center" },
    bigStatsRow: { flexDirection: "row", gap: 8 },
    bigStat: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: 10, padding: 14, alignItems: "center" },
    bigStatTop: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, width: "100%" },
    bigStatNumber: { flexShrink: 1, fontSize: 20, fontWeight: "bold", color: colors.accent },
    bigStatLabel: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
    readingHistoryCard: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 12 },
    readingBookRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    readingBookCover: { width: 48, height: 72, borderRadius: 6, backgroundColor: colors.surfaceAlt },
    readingBookNoCover: { width: 48, height: 72, borderRadius: 6, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
    readingBookInfo: { flex: 1 },
    readingBookTitle: { color: colors.text, fontSize: 14, fontWeight: "600", lineHeight: 19 },
    readingBookAuthor: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
    readingBookMeta: { alignItems: "flex-end", gap: 5 },
    readingBookPages: { maxWidth: 110, color: colors.accent, fontSize: 12, fontWeight: "bold", textAlign: "right" },
    readingBookType: { color: colors.textMuted, backgroundColor: colors.surfaceAlt, fontSize: 10, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, overflow: "hidden" },
    historyMonthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    historyMonthTitle: { color: colors.text, fontSize: 16, fontWeight: "bold" },
    historyMonthCount: { maxWidth: 110, color: colors.textMuted, fontSize: 12, textAlign: "right" },
    historyEmptyState: { alignItems: "center", paddingVertical: 14 },
    historyEmpty: { color: colors.textMuted, fontSize: 13, lineHeight: 19, paddingVertical: 14, textAlign: "center" },
    undatedNote: { color: colors.textDim, fontSize: 12, lineHeight: 17, marginBottom: 12, paddingHorizontal: 4 },
    genreCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, gap: 14 },
    genreRow: { gap: 6 },
    genreHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
    genreName: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "600" },
    genreCount: { flexShrink: 1, maxWidth: 56, color: colors.textMuted, fontSize: 12, fontWeight: "600", textAlign: "right" },
    genreTrack: { height: 7, backgroundColor: colors.surfaceAlt, borderRadius: 5, overflow: "hidden" },
    genreFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 5 },
    genreEmpty: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
    modalOverlay: { flex: 1, justifyContent: "flex-end" },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.48)" },
    modalSheet: { maxHeight: "82%", minHeight: 220, backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingBottom: 24 },
    modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalHeading: { flex: 1, marginRight: 12 },
    modalTitle: { color: colors.text, fontSize: 18, fontWeight: "bold" },
    modalSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
    closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
    modalList: { flexGrow: 0 },
    modalListContent: { paddingTop: 8, paddingBottom: 16 },
    modalState: { minHeight: 180, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
    modalMessage: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
    retryButton: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: colors.accent, borderRadius: 10 },
    retryText: { color: colors.onAccent, fontWeight: "bold" },
  });
