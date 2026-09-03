import { Stack } from "expo-router";

export default function StackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="user/[id]" options={{ presentation: "card" }} />
      {/* gestureEnabled:false — el mapa de la ficha (MapDetails) es interactivo
          (scroll/zoom) y llega hasta los bordes; panearlo cerca del borde
          izquierdo disparaba el gesto nativo de "volver" de iOS y cerraba la
          ficha. Se cierra con el botón Atrás del header. */}
      <Stack.Screen
        name="property/[id]"
        options={{
          presentation: "card",
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
        }}
      />
      <Stack.Screen name="messages" options={{ presentation: "card" }} />
      <Stack.Screen name="settings" options={{ presentation: "card" }} />
      <Stack.Screen name="post/[id]" options={{ presentation: "card" }} />
      <Stack.Screen
        name="reel/[id]"
        options={{ presentation: "fullScreenModal" }}
      />
      <Stack.Screen name="easy-broker" options={{ presentation: "card" }} />
      <Stack.Screen name="tokko-broker" options={{ presentation: "card" }} />
      {/* gestureEnabled:false — al panear el mapa a pantalla completa (cerca del
          borde) el gesto nativo de "volver" de iOS cerraba la pantalla sin
          querer. Mismo blindaje que las rutas de creación en app/_layout.tsx. */}
      <Stack.Screen
        name="map"
        options={{
          presentation: "card",
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="map-results"
        options={{
          presentation: "card",
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
        }}
      />
      <Stack.Screen name="matches" options={{ presentation: "card" }} />
      <Stack.Screen
        name="NotificationHistoryScreen"
        options={{ presentation: "card" }}
      />
    </Stack>
  );
}
