import { useState, useEffect, useMemo } from "react";
import { Text, StyleSheet } from "react-native";

// Reloj de pared del modo simple (HH:MM + fecha). Tick aislado: solo este
// componente re-evalúa el minuto, sin re-renderizar la pantalla de sesión.
// Decorativo: el botón contenedor ya describe la pantalla a accesibilidad.
export default function SimpleClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => {
      setNow((prev) => {
        const next = new Date();
        return next.getHours() === prev.getHours() && next.getMinutes() === prev.getMinutes() ? prev : next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const clock = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dateLabel = useMemo(
    () => now.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }),
    [now]
  );

  return (
    <>
      <Text style={styles.clock} accessible={false}>{clock}</Text>
      <Text style={styles.date} accessible={false}>{dateLabel}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  clock: { fontSize: 92, fontWeight: "200", color: "#fff", fontVariant: ["tabular-nums"], letterSpacing: 2 },
  date: { fontSize: 14, color: "#777", marginTop: 4, textTransform: "capitalize", marginBottom: 36 },
});
