import { useEffect, useRef } from "react";
import { Keyboard } from "react-native";

// Manejo de teclado para formularios largos: cuando un campo recibe foco, el
// ScrollView se desplaza para dejarlo visible (Android no lo hace solo). Las
// secciones que envuelven a los campos registran su `y` relativo al contenido
// con `onSectionLayout`; los inputs avisan con `onFieldFocus`.
export function useKeyboardFormScroll() {
  const scrollRef = useRef(null);
  const ys = useRef({});
  const lastFocused = useRef(null);

  const scrollToKey = (key) => {
    const y = ys.current[key];
    if (y == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 140), animated: true });
  };

  useEffect(() => {
    // Al terminar de abrirse el teclado, re-desplaza al último campo: cubre el
    // caso en que el layout se movió después del foco (KeyboardAvoidingView).
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      if (lastFocused.current) scrollToKey(lastFocused.current);
    });
    return () => sub.remove();
  }, []);

  const onSectionLayout = (key) => (e) => {
    ys.current[key] = e.nativeEvent.layout.y;
  };

  const onFieldFocus = (key) => () => {
    lastFocused.current = key;
    scrollToKey(key);
  };

  return { scrollRef, onSectionLayout, onFieldFocus };
}
