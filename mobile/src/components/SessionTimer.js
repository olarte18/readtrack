import { useState, useEffect } from "react";
import { Text } from "react-native";
import { formatClock } from "../utils/dates";
import { sessionSeconds } from "../utils/sessionStats";

// Reloj de la sesión de lectura. Vive en su propio componente para que el tick
// de 1s solo re-renderice este texto, no toda la pantalla. La hora es una
// proyección desde el ancla (ver `sessionSeconds`), no un contador que acumula.
export default function SessionTimer({ isTimer, anchor, running, style, label }) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    if (!running) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, anchor]);

  const text = formatClock(sessionSeconds(isTimer, anchor, running, nowMs));
  const a11y = label === undefined ? `Tiempo ${isTimer ? "restante" : "transcurrido"}: ${text}` : label;

  return (
    <Text style={style} accessibilityLabel={a11y || undefined}>
      {text}
    </Text>
  );
}
