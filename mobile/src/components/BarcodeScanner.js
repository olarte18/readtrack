import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

export default function BarcodeScanner({ visible, onScan, onClose }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible) setScanned(false);
  }, [visible]);

const handleScan = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setTimeout(() => onScan(data), 2000);
  };

  if (!permission) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {!permission.granted ? (
          <View style={styles.centered}>
            <Text style={styles.text}>Se necesita acceso a la cámara</Text>
            <TouchableOpacity style={styles.btn} onPress={requestPermission}>
              <Text style={styles.btnText}>Dar permiso</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              facing="back"
              onBarcodeScanned={scanned ? undefined : handleScan}
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
              }}
            />
            <View style={styles.overlay}>
              <View style={styles.topOverlay} />
              <View style={styles.middleRow}>
                <View style={styles.sideOverlay} />
                <View style={styles.scanArea} />
                <View style={styles.sideOverlay} />
              </View>
              <View style={styles.bottomOverlay}>
                <Text style={styles.hint}>Apunta al código de barras del libro</Text>
              </View>
            </View>
          </View>
        )}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕ Cancelar</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  cameraContainer: { flex: 1, position: "relative" },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject },
  topOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  middleRow: { flexDirection: "row", height: 150 },
  sideOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  scanArea: { width: 250, borderWidth: 2, borderColor: "#cba6f7", borderRadius: 12 },
  bottomOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", paddingTop: 20 },
  hint: { color: "#fff", fontSize: 14 },
  text: { color: "#fff", fontSize: 16 },
  btn: { backgroundColor: "#cba6f7", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  btnText: { color: "#13131f", fontWeight: "bold" },
  closeBtn: { backgroundColor: "#1e1e2e", padding: 16, alignItems: "center" },
  closeBtnText: { color: "#f38ba8", fontSize: 16, fontWeight: "bold" },
});
