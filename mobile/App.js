import { useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View, AppState, Text, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { ThemeProvider, useTheme } from "./src/contexts/ThemeContext";
import HomeScreen from "./src/screens/HomeScreen";
import SearchScreen from "./src/screens/SearchScreen";
import ManualAddBookScreen from "./src/screens/ManualAddBookScreen";
import BookDetailScreen from "./src/screens/BookDetailScreen";
import EditBookScreen from "./src/screens/EditBookScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import { Ionicons } from "@expo/vector-icons";
import StatsScreen from "./src/screens/StatsScreen";
import ReadingScreen from "./src/screens/ReadingScreen";
import ActiveSessionScreen from "./src/screens/ActiveSessionScreen";
import ReadingModeScreen from "./src/screens/ReadingModeScreen";
import SessionSummaryScreen from "./src/screens/SessionSummaryScreen";
import GoalsScreen from "./src/screens/GoalsScreen";
import GoalDetailScreen from "./src/screens/GoalDetailScreen";
import BookSessionsScreen from "./src/screens/BookSessionsScreen";
import CalendarScreen from "./src/screens/CalendarScreen";
import ThemePickerScreen from "./src/screens/ThemePickerScreen";
import ImportScreen from "./src/screens/ImportScreen";
import NotesScreen from "./src/screens/NotesScreen";
import AchievementsScreen from "./src/screens/AchievementsScreen";
import WhatsNewScreen from "./src/screens/WhatsNewScreen";
import AlarmDeepLinkScreen from "./src/screens/AlarmDeepLinkScreen";
import WhatsNewPopup from "./src/components/WhatsNewPopup";
import { AppAlertHost } from "./src/components/AppAlert";
import { CelebrationModal } from "./src/components/AchievementCelebration";
import { onAchievements } from "./src/services/achievementsBus";
import GoalSetupScreen from "./src/screens/GoalSetupScreen";
import { shouldShowWhatsNewPopup } from "./src/utils/whatsNew";
import { warmup, getStreak } from "./src/services/api";
import { initOfflineSync } from "./src/services/offlineSync";
import { getConnectivity, subscribe } from "./src/services/connectivity";
import { configureNotifications } from "./src/services/notifications";
import StreakReminderModal from "./src/components/StreakReminderModal";
import { shouldShowStreakPrompt, reconcileStreakReminder } from "./src/services/streakReminder";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const linking = {
  prefixes: ["readtrack://"],
  config: {
    screens: {
      AlarmLink: "session",
    },
  },
};

function HomeTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      initialRouteName="Reading"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === "Reading") iconName = focused ? "book" : "book-outline";
          else if (route.name === "Home") iconName = focused ? "library" : "library-outline";
          else if (route.name === "Stats") iconName = focused ? "stats-chart" : "stats-chart-outline";
          else if (route.name === "Calendar") iconName = focused ? "calendar" : "calendar-outline";
          else if (route.name === "Profile") iconName = focused ? "person" : "person-outline";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: "Biblioteca" }} />
      <Tab.Screen name="Stats" component={StatsScreen} options={{ tabBarLabel: "Estadísticas" }} />
      <Tab.Screen name="Reading" component={ReadingScreen} options={{ tabBarLabel: "Leyendo" }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ tabBarLabel: "Calendario" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: "Perfil" }} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={HomeTabs} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="ManualAdd" component={ManualAddBookScreen} />
      <Stack.Screen name="EditBook" component={EditBookScreen} />
      <Stack.Screen name="ReadingMode" component={ReadingModeScreen} />
      <Stack.Screen name="ActiveSession" component={ActiveSessionScreen} />
      <Stack.Screen name="SessionSummary" component={SessionSummaryScreen} />
      <Stack.Screen name="Import" component={ImportScreen} />
      <Stack.Screen name="Goals" component={GoalsScreen} />
      <Stack.Screen name="GoalDetail" component={GoalDetailScreen} />
      <Stack.Screen name="BookSessions" component={BookSessionsScreen} />
      <Stack.Screen name="Notes" component={NotesScreen} />
      <Stack.Screen name="Achievements" component={AchievementsScreen} />
      <Stack.Screen name="WhatsNew" component={WhatsNewScreen} />
      <Stack.Screen name="AlarmLink" component={AlarmDeepLinkScreen} />
    </Stack.Navigator>
  );
}

function AppShell() {
  const { user } = useAuth();
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showStreakPrompt, setShowStreakPrompt] = useState(false);
  const [offline, setOffline] = useState(false);
  const [achievementCelebration, setAchievementCelebration] = useState([]);

  // Logros que el server devuelve como recién desbloqueados tras una acción:
  // se muestran de inmediato, sin esperar a entrar a la pantalla de Logros.
  useEffect(
    () =>
      onAchievements((items) => {
        setAchievementCelebration((prev) => {
          const seen = new Set(prev.map((i) => `${i.code}:${i.tier}`));
          return [...prev, ...items.filter((i) => !seen.has(`${i.code}:${i.tier}`))];
        });
      }),
    []
  );

  useEffect(() => {
    setOffline(!getConnectivity().online);
    const unsub = subscribe((s) => setOffline(!s.online));
    // Arranque: si la puesta en marcha queda sin señal, que el indicador refleje
    // el estado real aunque no haya llegado ninguna respuesta todavía.
    return unsub;
  }, []);

  useEffect(() => {
    shouldShowWhatsNewPopup().then(setShowWhatsNew);
    if (user) shouldShowStreakPrompt(user.id).then(setShowStreakPrompt);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const doReconcile = () => {
      getStreak()
        .then((s) => reconcileStreakReminder(user.id, { hasSessionToday: !!s.hasSessionToday, streak: s.current ?? 0 }))
        .catch(() => {});
    };
    doReconcile();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") doReconcile();
    });
    return () => sub.remove();
  }, [user]);

  return (
    <>
      {offline && (
        <View style={[offlineBannerStyle, { top: Platform.OS === "android" ? 0 : 47 }]}>
          <Ionicons name="cloud-offline" size={14} color="#fff" />
          <Text style={offlineTextStyle}>Sin conexión — se muestran datos guardados</Text>
        </View>
      )}
      <AppStack />
      <WhatsNewPopup visible={showWhatsNew} onClose={() => setShowWhatsNew(false)} />
      <StreakReminderModal
        visible={showStreakPrompt}
        onClose={() => setShowStreakPrompt(false)}
        userId={user?.id}
        mode="invite"
      />
      <CelebrationModal
        items={achievementCelebration}
        onClose={() => setAchievementCelebration([])}
      />
    </>
  );
}

const offlineBannerStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  backgroundColor: "#e67e22",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  paddingVertical: 6,
  paddingHorizontal: 12,
  zIndex: 1000,
  elevation: 6,
};

const offlineTextStyle = {
  color: "#fff",
  fontSize: 13,
  fontWeight: "600",
};

function RootNavigator() {
  const { user, loading, setupDone, setupReady } = useAuth();
  const { ready, isPicked, colors } = useTheme();

  if (loading || !ready || (user && !setupReady)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!isPicked) return <ThemePickerScreen />;
  if (user && !setupDone) return <GoalSetupScreen />;
  return user ? <AppShell /> : <AuthStack />;
}

function Navigation() {
  const { navigationTheme, isDark } = useTheme();
  return (
    <NavigationContainer theme={navigationTheme} linking={linking}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    configureNotifications();
    warmup();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") warmup();
    });
    const unsubscribeSync = initOfflineSync();
    return () => { sub.remove(); unsubscribeSync(); };
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider>
        <Navigation />
        <AppAlertHost />
      </ThemeProvider>
    </AuthProvider>
  );
}