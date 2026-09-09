import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { getLibrary } from "../services/api";
import { cancelAlarmSession } from "../services/notifications";
import { useTheme } from "../contexts/ThemeContext";

/**
 * Puente del deep-link `readtrack://session?bookId=…&seconds=…` (botón
 * "Ver resumen" de la alarma). Busca el libro en la biblioteca y reanuda el
 * flujo de guardar la sesión en ActiveSession; si no lo encuentra (o falla),
 * cae a la pestaña Leyendo.
 */
export default function AlarmDeepLinkScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { bookId, seconds } = route.params ?? {};

  useEffect(() => {
    cancelAlarmSession();
    (async () => {
      try {
        const library = await getLibrary();
        const book = library?.find((b) => String(b.id) === String(bookId));
        if (!book) {
          navigation.replace("Main", { screen: "Reading" });
          return;
        }
        // Si la sesión ya está montada (la app solo estaba en segundo plano),
        // no apilar otra: descarta el puente y deja arriba la sesión existente.
        const stackRoutes = navigation.getState()?.routes ?? [];
        const hasActiveSession = stackRoutes.some(
          (route) => route.name === "ActiveSession"
        );
        if (hasActiveSession) {
          navigation.goBack();
          return;
        }
        navigation.replace("ActiveSession", {
          book,
          mode: "timer",
          fromAlarm: true,
          alarmSeconds: Number(seconds) || 0,
        });
      } catch {
        navigation.replace("Main", { screen: "Reading" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}