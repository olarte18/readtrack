import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { getLibrary } from "../services/api";
import { cancelAlarmSession } from "../services/notifications";
import { useTheme } from "../contexts/ThemeContext";

/**
 * Puente del deep-link `readtrack://session?bookId=…&seconds=…` (botón
 * "Ver resumen" de la alarma) y `readtrack://session?bookId=…&resume=1`
 * (tap en la notificación de sesión en curso).
 * - Con `resume=1`: busca el libro y reabre/revela la sesión activa sin
 *   cancelar el servicio nativo (la sesión sigue viva).
 * - Sin `resume`: reanuda el flujo de guardar la sesión en ActiveSession.
 * Si el libro no está (o algo falla), cae a la pestaña Leyendo.
 */
export default function AlarmDeepLinkScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { bookId, seconds } = route.params ?? {};
  const resume = route.params?.resume === "1";

  useEffect(() => {
    // Reanudar (notificación de sesión): la sesión sigue viva, no se cancela.
    // "Ver resumen" (alarma cumplida): se detiene el servicio nativo.
    if (!resume) cancelAlarmSession();
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
        if (resume) {
          navigation.replace("ActiveSession", {
            book,
            mode: route.params?.mode === "timer" ? "timer" : "stopwatch",
            resume: true,
          });
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