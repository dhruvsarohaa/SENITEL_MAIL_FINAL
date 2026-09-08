import { GoogleAuthProvider, signInWithCredential, signOut } from "firebase/auth";
import { firebaseAuth } from "./firebase";

export type GoogleProfile = {
  id?: string;
  email: string;
  name: string;
  picture?: string;
  role?: string;
};

type GoogleCredentialResponse = { credential: string };

type GoogleIdentityApi = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: {
          type: "standard";
          theme: "outline";
          size: "large";
          text: "continue_with";
          shape: "pill";
          logo_alignment: "left";
          width: number;
        },
      ) => void;
      disableAutoSelect: () => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

const GOOGLE_SCRIPT_ID = "google-identity-services";

export const GOOGLE_CLIENT_ID = import.meta.env["VITE_GOOGLE_CLIENT_ID"] as string | undefined;

export function hasGoogleAuthConfig() {
  return Boolean(GOOGLE_CLIENT_ID);
}

function loadGoogleIdentity(): Promise<GoogleIdentityApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google sign-in is only available in a browser."));
  }

  if (window.google) {
    return Promise.resolve(window.google);
  }

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener(
        "load",
        () =>
          window.google
            ? resolve(window.google)
            : reject(new Error("Google sign-in did not load.")),
        { once: true },
      );

      existing.addEventListener(
        "error",
        () => reject(new Error("Google sign-in could not load.")),
        { once: true },
      );

      return;
    }

    const script = document.createElement("script");

    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;

    script.onload = () =>
      window.google ? resolve(window.google) : reject(new Error("Google sign-in did not load."));

    script.onerror = () => reject(new Error("Google sign-in could not load."));

    document.head.appendChild(script);
  });
}

export async function renderGoogleButton(
  element: HTMLElement,
  onSuccess: (profile: GoogleProfile) => void,
  onError: (message: string) => void,
) {
  if (!GOOGLE_CLIENT_ID) {
    onError("Google sign-in has not been configured yet.");
    return;
  }

  try {
    const google = await loadGoogleIdentity();

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      auto_select: false,
      cancel_on_tap_outside: true,

      callback: async ({ credential }) => {
        try {
          /*
           * Google Identity Services gives us a Google ID token.
           *
           * We exchange that credential with Firebase Authentication.
           * Firebase then creates the actual authenticated Firebase user
           * session.
           */
          const googleCredential = GoogleAuthProvider.credential(credential);

          const result = await signInWithCredential(firebaseAuth, googleCredential);

          const firebaseUser = result.user;

          if (!firebaseUser.email) {
            throw new Error("Firebase did not provide an email address.");
          }

          /*
           * This is the important part:
           * Firebase now owns the authenticated session.
           *
           * The API layer will later call:
           * firebaseAuth.currentUser.getIdToken()
           *
           * and send that Firebase ID token to our Express backend.
           */
          await firebaseUser.getIdToken();

          onSuccess({
            id: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName || firebaseUser.email,
            ...(firebaseUser.photoURL ? { picture: firebaseUser.photoURL } : {}),
          });
        } catch (error) {
          console.error("Firebase Google sign-in failed:", error);

          onError(error instanceof Error ? error.message : "Could not complete Google sign-in.");
        }
      },
    });

    element.replaceChildren();

    google.accounts.id.renderButton(element, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
      logo_alignment: "left",
      width: 360,
    });
  } catch (error) {
    onError(error instanceof Error ? error.message : "Google sign-in could not load.");
  }
}

export async function clearGoogleSession() {
  try {
    await signOut(firebaseAuth);
  } finally {
    window.google?.accounts.id.disableAutoSelect();
  }
}

// export type GoogleProfile = {
//   id?: string;
//   email: string;
//   name: string;
//   picture?: string;
//   role?: string;
// };

// type GoogleCredentialResponse = { credential: string };

// type GoogleIdentityApi = {
//   accounts: {
//     id: {
//       initialize: (config: {
//         client_id: string;
//         callback: (response: GoogleCredentialResponse) => void;
//         auto_select?: boolean;
//         cancel_on_tap_outside?: boolean;
//       }) => void;
//       renderButton: (
//         parent: HTMLElement,
//         options: {
//           type: "standard";
//           theme: "outline";
//           size: "large";
//           text: "continue_with";
//           shape: "pill";
//           logo_alignment: "left";
//           width: number;
//         },
//       ) => void;
//       disableAutoSelect: () => void;
//     };
//   };
// };

// declare global {
//   interface Window {
//     google?: GoogleIdentityApi;
//   }
// }

// const GOOGLE_SCRIPT_ID = "google-identity-services";
// export const GOOGLE_CLIENT_ID = import.meta.env["VITE_GOOGLE_CLIENT_ID"] as string | undefined;

// export function hasGoogleAuthConfig() {
//   return Boolean(GOOGLE_CLIENT_ID);
// }

// function loadGoogleIdentity(): Promise<GoogleIdentityApi> {
//   if (typeof window === "undefined")
//     return Promise.reject(new Error("Google sign-in is only available in a browser."));
//   if (window.google) return Promise.resolve(window.google);

//   return new Promise((resolve, reject) => {
//     const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
//     if (existing) {
//       existing.addEventListener(
//         "load",
//         () =>
//           window.google
//             ? resolve(window.google)
//             : reject(new Error("Google sign-in did not load.")),
//         { once: true },
//       );
//       existing.addEventListener(
//         "error",
//         () => reject(new Error("Google sign-in could not load.")),
//         { once: true },
//       );
//       return;
//     }

//     const script = document.createElement("script");
//     script.id = GOOGLE_SCRIPT_ID;
//     script.src = "https://accounts.google.com/gsi/client";
//     script.async = true;
//     script.defer = true;
//     script.onload = () =>
//       window.google ? resolve(window.google) : reject(new Error("Google sign-in did not load."));
//     script.onerror = () => reject(new Error("Google sign-in could not load."));
//     document.head.appendChild(script);
//   });
// }

// function profileFromCredential(credential: string): GoogleProfile {
//   const payload = credential.split(".")[1];
//   if (!payload) throw new Error("Google returned an invalid identity token.");
//   const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
//   const decoded = JSON.parse(atob(normalized)) as Partial<GoogleProfile>;
//   if (!decoded.email || !decoded.name)
//     throw new Error("Google did not provide an email address and name.");
//   return {
//     email: decoded.email,
//     name: decoded.name,
//     ...(decoded.picture ? { picture: decoded.picture } : {}),
//   };
// }

// export async function renderGoogleButton(
//   element: HTMLElement,
//   onSuccess: (profile: GoogleProfile) => void,
//   onError: (message: string) => void,
// ) {
//   if (!GOOGLE_CLIENT_ID) {
//     onError("Google sign-in has not been configured yet.");
//     return;
//   }

//   try {
//     const google = await loadGoogleIdentity();
//     google.accounts.id.initialize({
//       client_id: GOOGLE_CLIENT_ID,
//       auto_select: false,
//       cancel_on_tap_outside: true,
//       callback: ({ credential }) => {
//         try {
//           onSuccess(profileFromCredential(credential));
//         } catch (error) {
//           onError(error instanceof Error ? error.message : "Could not complete Google sign-in.");
//         }
//       },
//     });
//     element.replaceChildren();
//     google.accounts.id.renderButton(element, {
//       type: "standard",
//       theme: "outline",
//       size: "large",
//       text: "continue_with",
//       shape: "pill",
//       logo_alignment: "left",
//       width: 360,
//     });
//   } catch (error) {
//     onError(error instanceof Error ? error.message : "Google sign-in could not load.");
//   }
// }

// export function clearGoogleSession() {
//   window.google?.accounts.id.disableAutoSelect();
// }
