import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";

export default function ThemePickerScreen() {
  const { colors, theme, setTheme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Ionicons name="contrast" size={48} color={colors.accent} />
      <Text style={[styles.title, { color: colors.text }]}>
        Elige tu tema
      </Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Podrás cambiarlo más tarde desde tu perfil
      </Text>

      <TouchableOpacity
        style={[styles.option, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => setTheme("system")}
        activeOpacity={0.8}
      >
        <View style={[styles.swatch, { backgroundColor: "#2a2a3e", borderColor: "#444466" }]}>
          <Ionicons name="contrast" size={26} color="#cba6f7" />
        </View>
        <View style={styles.optionText}>
          <Text style={[styles.optionTitle, { color: colors.text }]}>Sistema</Text>
          <Text style={[styles.optionDesc, { color: colors.textMuted }]}>
            Usa el tema de tu teléfono
          </Text>
        </View>
        {theme === "system"
          ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
          : <Ionicons name="chevron-forward" size={20} color={colors.textDim} />}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.option, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => setTheme("light")}
        activeOpacity={0.8}
      >
        <View style={[styles.swatch, { backgroundColor: "#f2f2f7", borderColor: "#e0e0e6" }]}>
          <Ionicons name="sunny" size={26} color="#f0a500" />
        </View>
        <View style={styles.optionText}>
          <Text style={[styles.optionTitle, { color: colors.text }]}>Claro</Text>
          <Text style={[styles.optionDesc, { color: colors.textMuted }]}>
            Fondos claros y texto oscuro
          </Text>
        </View>
        {theme === "light"
          ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
          : <Ionicons name="chevron-forward" size={20} color={colors.textDim} />}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.option, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => setTheme("dark")}
        activeOpacity={0.8}
      >
        <View style={[styles.swatch, { backgroundColor: "#13131f", borderColor: "#2a2a3e" }]}>
          <Ionicons name="moon" size={26} color="#cba6f7" />
        </View>
        <View style={styles.optionText}>
          <Text style={[styles.optionTitle, { color: colors.text }]}>Oscuro</Text>
          <Text style={[styles.optionDesc, { color: colors.textMuted }]}>
            Fondos oscuros y texto claro
          </Text>
        </View>
        {theme === "dark"
          ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
          : <Ionicons name="chevron-forward" size={20} color={colors.textDim} />}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  title: { fontSize: 28, fontWeight: "bold", textAlign: "center", marginTop: 16 },
  subtitle: { fontSize: 15, textAlign: "center", marginBottom: 28 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
    gap: 16,
  },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 18, fontWeight: "bold" },
  optionDesc: { fontSize: 13, marginTop: 2 },
});