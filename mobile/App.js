import { useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View, AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { ThemeProvider, useTheme } from "./src/contexts/ThemeContext";
import HomeScreen from "./src/screens/HomeScreen";
import SearchScreen from "./src/screens/SearchScreen";
import ManualAddBookScreen from "./src/screens/ManualAddBookScreen";
import BookDetailScreen from "./src/screens/BookDetailScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import { Ionicons } from "@expo/vector-icons";
import StatsScreen from "./src/screens/StatsScreen";
import ReadingScreen from "./src/screens/ReadingScreen";
import ActiveSessionScreen from "./src/screens/ActiveSessionScreen";
import ReadingModeScreen from "./src/screens/ReadingModeScreen";
import SessionSummaryScreen from "./src/screens/SessionSummaryScreen";
import GoalsScreen from "./src/screens/GoalsScreen";
import CalendarScreen from "./src/screens/CalendarScreen";
import ThemePickerScreen from "./src/screens/ThemePickerScreen";
import ImportScreen from "./src/screens/ImportScreen";
import NotesScreen from "./src/screens/NotesScreen";
import WhatsNewScreen from "./src/screens/WhatsNewScreen";
import WhatsNewPopup from "./src/components/WhatsNewPopup";
import GoalSetupScreen from "./src/screens/GoalSetupScreen";
import { shouldShowWhatsNewPopup } from "./src/utils/whatsNew";
import { warmup } from "./src/services/api";
import { configureNotifications } from "./src/services/notifications";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

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
          else if (route.name === "Search") iconName = focused ? "search" : "search-outline";
          else if (route.name === "Notes") iconName = focused ? "document-text" : "document-text-outline";
          else if (route.name === "Profile") iconName = focused ? "person" : "person-outline";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: "Biblioteca" }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ tabBarLabel: "Buscar" }} />
      <Tab.Screen name="Reading" component={ReadingScreen} options={{ tabBarLabel: "Leyendo" }} />
      <Tab.Screen name="Notes" component={NotesScreen} options={{ tabBarLabel: "Notas" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: "Perfil" }} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={HomeTabs} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} />
      <Stack.Screen name="ManualAdd" component={ManualAddBookScreen} />
      <Stack.Screen name="Stats" component={StatsScreen} />
      <Stack.Screen name="ReadingMode" component={ReadingModeScreen} />
      <Stack.Screen name="ActiveSession" component={ActiveSessionScreen} />
      <Stack.Screen name="SessionSummary" component={SessionSummaryScreen} />
      <Stack.Screen name="Import" component={ImportScreen} />
      <Stack.Screen name="Goals" component={GoalsScreen} />
      <Stack.Screen name="Calendar" component={CalendarScreen} />
      <Stack.Screen name="WhatsNew" component={WhatsNewScreen} />
    </Stack.Navigator>
  );
}

function AppShell() {
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  useEffect(() => {
    shouldShowWhatsNewPopup().then(setShowWhatsNew);
  }, []);

  return (
    <>
      <AppStack />
      <WhatsNewPopup visible={showWhatsNew} onClose={() => setShowWhatsNew(false)} />
    </>
  );
}

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
    <NavigationContainer theme={navigationTheme}>
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
    return () => sub.remove();
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider>
        <Navigation />
      </ThemeProvider>
    </AuthProvider>
  );
}