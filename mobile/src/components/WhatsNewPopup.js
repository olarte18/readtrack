import { Modal, View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import { RELEASE_NOTES } from "../data/whatsNew";

// Cuadro pequeño de novedades al entrar tras una actualización.
// Aparece una sola vez por versión; la sección del Perfil dura 7 días.
export default function WhatsNewPopup({ visible, onClose }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const navigation = useNavigation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Ionicons name="sparkles" size={18} color={colors.star} />
            <Text style={styles.title}>{RELEASE_NOTES.title}</Text>
          </View>
          {RELEASE_NOTES.items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Ionicons name={item.icon} size={14} color={colors.accent} style={styles.itemIcon} />
              <Text style={styles.itemText}>{item.text}</Text>
            </View>
          ))}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                onClose();
                navigation.navigate("WhatsNew");
              }}
            >
              <Text style={styles.secondaryText}>Ver más</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={onClose}>
              <Text style={styles.primaryText}>Vale</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    card: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 18,
      paddingBottom: 26,
      borderWidth: 1,
      borderColor: colors.star + "44",
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    title: { fontSize: 16, fontWeight: "bold", color: colors.text },
    itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 9 },
    itemIcon: { marginTop: 2 },
    itemText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
    btnRow: { flexDirection: "row", gap: 10, marginTop: 12 },
    secondaryBtn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: "center",
      backgroundColor: colors.surfaceAlt,
    },
    secondaryText: { color: colors.textMuted, fontWeight: "bold", fontSize: 14 },
    primaryBtn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: "center",
      backgroundColor: colors.accent,
    },
    primaryText: { color: colors.onAccent, fontWeight: "bold", fontSize: 14 },
  });
