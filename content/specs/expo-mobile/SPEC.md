---
name: expo-mobile
description: "Cross-platform mobile app scaffold with Expo Router, auth flows, and offline support."
---

## What's included

A typed **Expo SDK 52** scaffold targeting iOS and Android from a single codebase. **Expo Router v3** provides file-system-based navigation with typed routes, deep linking pre-configured, and shared-element transitions. Auth flows — sign-up, sign-in, email verification, and password reset — are wired to a configurable backend via an **Axios** client with automatic JWT access-token refresh (interceptor pattern, queued retry on 401, exponential back-off on network failure).

**Zustand** manages global client state with immer middleware for immutable updates. **TanStack Query v5** handles server state: data fetching, background revalidation, and optimistic updates. An offline mutation queue replays in-order when connectivity is restored, using `@react-native-netinfo` for network observation and a combination of `expo-secure-store` (for tokens) and `@react-native-async-storage` (for query cache persistence).

UI is built with **NativeWind v4** (Tailwind CSS syntax on React Native) over a small set of base primitives in `components/ui/`. **React Native Reanimated v3** and **Gesture Handler** are installed and pre-configured; animations use the `useSharedValue` + `useAnimatedStyle` pattern and stay within the 60fps budget by default.

## Architecture

**File-system routing is the navigation contract.** Screens live under `app/(auth)/` for unauthenticated flows and `app/(tabs)/` for the post-login experience. A root `_layout.tsx` guards the tabs group with an auth check — unauthenticated users are redirected to `(auth)/sign-in` before the tab bar ever renders.

```tsx
// app/(tabs)/_layout.tsx
export default function TabsLayout() {
  const { session } = useSession();
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#0066FF' }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
```

**API layer is separated from React.** `api/` exports typed client functions that return plain data — no Axios instances scattered through components. TanStack Query hooks in `lib/queries/` and `lib/mutations/` wrap those functions. Components import only hooks; they never touch the Axios client directly.

```ts
// api/posts.ts
export const fetchPost = (id: string): Promise<Post> =>
  client.get<Post>(`/posts/${id}`).then(r => r.data);

// lib/queries/posts.ts
export const usePost = (id: string) =>
  useQuery({ queryKey: ['posts', id], queryFn: () => fetchPost(id) });
```

**Offline queue is explicit, not magic.** A persisted Zustand slice stores queued mutations as serialisable objects `{ id, endpoint, payload, createdAt }`. When the device comes online, the sync hook drains the queue sequentially, replaying each mutation. Server conflicts (409) are surfaced to the user rather than silently dropped.

## File structure

```
app/
├── _layout.tsx              Root layout: query client, gesture handler, fonts
├── (auth)/
│   ├── _layout.tsx
│   ├── sign-in.tsx
│   ├── sign-up.tsx
│   ├── verify-email.tsx
│   └── reset-password.tsx
└── (tabs)/
    ├── _layout.tsx          Auth guard + tab bar
    ├── index.tsx            Home screen
    └── profile.tsx

api/
├── client.ts                Axios instance, token refresh interceptor
├── auth.ts                  sign-in, sign-up, refresh, verify endpoints
└── posts.ts                 Typed API functions (one file per resource)

lib/
├── queries/                 TanStack Query read hooks
├── mutations/               TanStack Query mutation hooks + offline queue
├── store/                   Zustand slices (session, offline queue, UI state)
└── sync.ts                  Offline queue drain logic

components/
├── ui/                      Base primitives: Button, Input, Card, Text, Avatar
└── [feature]/               Feature-specific components

hooks/
├── useSession.ts            Auth session from expo-secure-store
└── useNetworkSync.ts        Online/offline event handling + queue drain

constants/
└── routes.ts                Typed route constants matching app/ structure

assets/                      Images, fonts (loaded via expo-font), icons
app.config.ts                Expo config (slug, bundleId, EAS project ID)
eas.json                     EAS Build profiles: development, preview, production
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec expo-mobile

# 2. Install dependencies
npx expo install

# 3. Configure
cp app.config.example.ts app.config.ts
# Set: API_BASE_URL, EXPO_PROJECT_ID, iOS bundle ID, Android package name

# 4. Start the development server
npx expo start       # press i for iOS simulator, a for Android, scan QR for device

# 5. Run tests
pnpm test            # Vitest + React Native Testing Library
pnpm test:e2e        # Maestro E2E (requires a running simulator)
```

EAS Build produces native binaries without local Xcode or Android Studio:

```bash
eas build --profile preview --platform all    # ad-hoc distribution build
eas build --profile production --platform all # App Store / Play Store build
eas submit --platform ios                      # submit to App Store Connect
```

## Opinionated choices, with reasons

- **Expo Router over React Navigation.** File-system routing eliminates the boilerplate of manually declaring a navigator tree. Typed routes catch broken navigation links at compile time. Deep links are inferred from the file structure rather than configured separately. Use React Navigation directly if you need a heavily custom navigation UI that Expo Router's slot/portal API cannot accommodate.
- **NativeWind over StyleSheet or styled-components.** Tailwind utility classes transfer directly from web muscle memory with no style-object management. The v4 compiler is fast enough for hot reload. Use `useAnimatedStyle` from Reanimated for animation-driven style changes — it still returns a StyleSheet object internally.
- **Zustand over Redux or Jotai.** Minimal boilerplate, no provider wrapping, immer middleware makes nested updates safe. Redux is the right choice if you need time-travel debugging or a large ecosystem of Redux-specific middleware. Jotai is leaner but lacks the slice conventions that keep large state manageable.
- **expo-secure-store for tokens only.** Backed by Keychain (iOS) and Keystore (Android). Never store JWTs in AsyncStorage — it is not encrypted. AsyncStorage is appropriate for non-sensitive cached data such as query cache and user preferences.
- **Vitest + React Native Testing Library over Jest.** Vitest is faster and shares config with web projects; RNTL provides the familiar testing-library API on native components. E2E via Maestro covers golden-path flows where unit tests are too brittle to maintain.
- **EAS Build over local native builds.** Reproducible CI builds with no Xcode/Gradle version mismatches across machines. Local builds remain available for debugging native modules; EAS handles all distribution builds.

## Testing strategy

**Unit tests** (Vitest + RNTL) cover individual screens and hooks with the API layer mocked via `msw/native`. A custom `renderWithProviders` wrapper mounts TanStack Query and Zustand in test mode with fresh stores per test.

**Integration tests** mount complete screen groups and assert on navigation events using Expo Router's test utilities. The sign-in flow test covers error states (wrong password, unverified email) and the successful redirect to `(tabs)/index`.

**E2E tests** (Maestro) drive a running simulator via YAML flow files. Flows cover: sign-up → verify email → tab bar visible; and the primary feature happy path end-to-end. Run in CI on a macOS GitHub Actions runner with an iPhone 15 simulator.

## Skills paired with this spec

- `api-designer` — aligns the mobile API contract with the Axios client's expectations (pagination, error envelopes, auth headers)
- `test-writer` — Vitest + React Native Testing Library patterns for screens, hooks, and offline queue logic

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **Web-only product.** If you never ship to iOS or Android, use `nextjs-saas` or `react-vite`. React Native adds compilation overhead and a runtime abstraction layer you do not need.
- **Heavy native module requirements.** If you need low-level Bluetooth, background audio processing, or advanced camera access that Expo's managed workflow does not support, start with the Expo bare workflow or React Native CLI from the beginning.
- **Game or graphics-intensive app.** Use Unity, Unreal, or a WebGL-based approach. React Native's rendering model is wrong for anything requiring per-frame GPU control.
- **Flutter team.** This spec is a React Native blueprint. Migrating Dart components to React Native mid-project is not worthwhile.
