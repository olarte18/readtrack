import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { RELEASE_NOTES } from "../data/whatsNew";

export default function WhatsNewScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Novedades</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Ionicons name="sparkles" size={28} color={colors.star} />
            <Text style={styles.cardTitle}>{RELEASE_NOTES.title}</Text>
          </View>
          {RELEASE_NOTES.items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <View style={styles.iconWrap}>
                <Ionicons name={item.icon} size={18} color={colors.accent} />
              </View>
              <Text style={styles.itemText}>{item.text}</Text>
            </View>
          ))}
          <Text style={styles.footer}>Esta sección desaparecerá en unos días</Text>
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Listo</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: 60 },
    title: { fontSize: 24, fontWeight: "bold", color: colors.text, padding: 20 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      marginHorizontal: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.star + "44",
    },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
    cardTitle: { fontSize: 18, fontWeight: "bold", color: colors.text, flex: 1 },
    itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: colors.accent + "22",
      justifyContent: "center",
      alignItems: "center",
    },
    itemText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
    footer: { fontSize: 11, color: colors.textDim, marginTop: 6, fontStyle: "italic" },
    backBtn: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 14,
      marginHorizontal: 20,
      marginTop: 10,
      alignItems: "center",
    },
    backBtnText: { color: colors.onAccent, fontSize: 15, fontWeight: "bold" },
  });
