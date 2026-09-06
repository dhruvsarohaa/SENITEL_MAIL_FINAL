import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  clearGoogleSession,
  hasGoogleAuthConfig,
  type GoogleProfile,
} from "@/lib/google-auth";
import { firebaseAuth } from "@/lib/firebase";

type AuthContextValue = {
  user: GoogleProfile | null;
  isConfigured: boolean;
  completeSignIn: (profile: GoogleProfile) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleProfile | null>(null);

  const isConfigured = hasGoogleAuthConfig();

  /**
   * Firebase is the source of truth for authentication.
   * When the Firebase session changes, update the application's user.
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      if (!firebaseUser || !firebaseUser.email) {
        setUser(null);
        return;
      }

      setUser({
        id: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName || firebaseUser.email,
        ...(firebaseUser.photoURL
          ? { picture: firebaseUser.photoURL }
          : {}),
      });
    });

    return unsubscribe;
  }, []);

  /**
   * Called after Google/Firebase sign-in succeeds.
   * Firebase session remains the actual authentication state.
   */
  const completeSignIn = useCallback((profile: GoogleProfile) => {
    setUser(profile);
  }, []);

  const signOut = useCallback(() => {
    clearGoogleSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isConfigured,
      completeSignIn,
      signOut,
    }),
    [completeSignIn, isConfigured, signOut, user],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return value;
}




// import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
// import { clearGoogleSession, hasGoogleAuthConfig, type GoogleProfile } from "@/lib/google-auth";

// const STORAGE_KEY = "sentinelmail-user";

// type AuthContextValue = {
//   user: GoogleProfile | null;
//   isConfigured: boolean;
//   completeSignIn: (profile: GoogleProfile) => void;
//   signOut: () => void;
// };

// const AuthContext = createContext<AuthContextValue | null>(null);

// const DEFAULT_ANALYST: GoogleProfile = {
//   id: "lead-analyst",
//   email: "alex.mercer@sentinelmail.io",
//   name: "Alex Mercer (Lead Analyst)",
//   role: "admin",
// };

// function getStoredUser(): GoogleProfile | null {
//   if (typeof window === "undefined") return DEFAULT_ANALYST;
//   try {
//     const saved = window.localStorage.getItem(STORAGE_KEY);
//     return saved ? (JSON.parse(saved) as GoogleProfile) : DEFAULT_ANALYST;
//   } catch {
//     return DEFAULT_ANALYST;
//   }
// }

// export function AuthProvider({ children }: { children: ReactNode }) {
//   const [user, setUser] = useState<GoogleProfile | null>(DEFAULT_ANALYST);
//   const isConfigured = hasGoogleAuthConfig();

//   const completeSignIn = useCallback((profile: GoogleProfile) => {
//     window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
//     setUser(profile);
//   }, []);

//   const signOut = useCallback(() => {
//     window.localStorage.removeItem(STORAGE_KEY);
//     clearGoogleSession();
//     setUser(null);
//   }, []);

//   const value = useMemo(
//     () => ({ user, isConfigured, completeSignIn, signOut }),
//     [completeSignIn, isConfigured, signOut, user],
//   );

//   return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
// }

// export function useAuth() {
//   const value = useContext(AuthContext);
//   if (!value) throw new Error("useAuth must be used inside AuthProvider.");
//   return value;
// }
