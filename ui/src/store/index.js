import { create } from "zustand";
import toast from "react-hot-toast";
import {
  getUsers,
  setUserWebAuthnCred,
  setUserPinHash,
  getHoldingsForUser,
  getFamilyHoldings,
  getFamily,
  updateFamilyConfig,
  addHolding,
  updateHolding,
  deleteHolding,
  getPortfolioHistory,
  getSyncStatus,
  getSyncLogs,
  getCronStatus,
} from "../data/userManager";

// ── Helpers ────────────────────────────────────────────────────────────────────
async function sha256(msg) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(msg),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
function b64ToBuf(b64) {
  const b64std = b64.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64std), (c) => c.charCodeAt(0)).buffer;
}

async function platformAuthAvailable() {
  if (window.require) {
    try {
      const { ipcRenderer } = window.require("electron");
      return await ipcRenderer.invoke("check-touch-id");
    } catch {
      return false;
    }
  }
  // Fallback to webauthn for browser testing
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// initUserManager is gone, we will fetch data from API

// ── Store ──────────────────────────────────────────────────────────────────────
export const useStore = create((set, get) => ({
  // ── Auth state ────────────────────────────────────────────────────────────
  isAuthenticated: false,
  activeUser: null, // the user object
  users: [], // list of all family members loaded from API
  authMode: "picker", // 'picker' | 'loading' | 'touchid' | 'pin'
  isFirstRun: false,
  touchIdAvailable: false,
  authError: null,

  // Initialize app state from Postgres
  async initApp() {
    try {
      const [
        users,
        family,
        history,
        syncStatus,
        syncLogs,
        cronStatus,
        earningsRes,
        allHoldings,
      ] = await Promise.all([
        getUsers(),
        getFamily(),
        getPortfolioHistory(),
        getSyncStatus(),
        getSyncLogs(),
        getCronStatus(),
        fetch("http://localhost:5005/api/market/earnings").catch(() => ({
          ok: false,
        })),
        getFamilyHoldings().catch(() => []),
      ]);
      const baseCurrency = family?.config?.baseCurrency || "INR";

      let earnings = [];
      if (earningsRes.ok) {
        earnings = await earningsRes.json();
      }

      const totalDayGain = allHoldings.reduce(
        (sum, h) => sum + (h.dayChange || 0),
        0,
      );

      set({
        users,
        family,
        currency: baseCurrency,
        history,
        syncStatus,
        syncLogs,
        cronStatus,
        earnings,
        totalDayGain,
      });

      const fetchUsdRate = async () => {
        try {
          const res = await fetch(
            "https://api.exchangerate-api.com/v4/latest/USD",
          );
          if (res.ok) {
            const data = await res.json();
            if (data?.rates?.INR) {
              set({ usdInr: data.rates.INR });
            }
          }
        } catch {
          console.warn("Failed to fetch live USD/INR rate, using fallback.");
        }
      };

      await fetchUsdRate();

      // Start 30-minute polling if not already running
      if (!get().rateIntervalId) {
        const id = setInterval(fetchUsdRate, 30 * 60 * 1000);
        set({ rateIntervalId: id });
      }

      const state = get();
      if (state.isAuthenticated && state.activeUser) {
        await state.loadUserHoldings();
      }
    } catch (err) {
      console.error("Failed to fetch initial data:", err);
      toast.error(
        "Database Connection Failed. Please ensure Postgres is running.",
      );
    }
  },

  // Called when a user is selected from the picker
  async selectUser(userId) {
    const { users } = get();
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    set({ activeUser: user, authMode: "loading", authError: null });

    const hasTouchId = await platformAuthAvailable();
    const hasWebAuthn = !!window.PublicKeyCredential;
    const hasCredStored = !!user.webauthn_cred_id;
    const hasPinStored = !!user.pin_hash;

    const touchIdReady = hasTouchId && hasWebAuthn;

    if (touchIdReady) {
      set({
        touchIdAvailable: true,
        authMode: "touchid",
        isFirstRun: !hasCredStored,
      });
    } else {
      set({
        touchIdAvailable: false,
        authMode: "pin",
        isFirstRun: !hasPinStored,
      });
    }
  },

  deselectUser() {
    set({ activeUser: null, authMode: "picker", authError: null });
  },

  // ── Touch ID: Register (first run) ────────────────────────────────────────
  async registerTouchId() {
    set({ authError: null });
    const { activeUser } = get();
    if (!activeUser) return { success: false };

    if (window.require) {
      try {
        const { ipcRenderer } = window.require("electron");
        await ipcRenderer.invoke(
          "prompt-touch-id",
          "Enroll Touch ID for Gordan Belfort",
        );

        // If it didn't throw, authentication was successful
        await setUserWebAuthnCred(activeUser.id, "electron-native-touch-id");
        const { users } = get();
        const updatedUsers = users.map((u) =>
          u.id === activeUser.id
            ? { ...u, webauthn_cred_id: "electron-native-touch-id" }
            : u,
        );
        const updatedUser = updatedUsers.find((u) => u.id === activeUser.id);

        set({
          users: updatedUsers,
          activeUser: updatedUser,
          isAuthenticated: true,
          isFirstRun: false,
          authError: null,
        });
        get().loadUserHoldings();
        return { success: true };
      } catch (err) {
        let msg = err.message || "Touch ID cancelled.";
        if (
          msg.toLowerCase().includes("canceled") ||
          msg.toLowerCase().includes("cancelled")
        ) {
          msg = "Touch ID cancelled";
        } else if (msg.toLowerCase().includes("failed")) {
          msg = "Fingerprint not recognized";
        }
        set({ authError: msg });
        return { success: false, error: msg };
      }
    }

    // Fallback for browser WebAuthn
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userIdBuf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(activeUser.id),
      );

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Gordan Belfort", id: window.location.hostname },
          user: {
            id: userIdBuf.slice(0, 16),
            name: activeUser.name,
            displayName: activeUser.name,
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60000,
        },
      });

      const credId = bufToB64(credential.rawId);
      await setUserWebAuthnCred(activeUser.id, credId);

      const { users } = get();
      const updatedUsers = users.map((u) =>
        u.id === activeUser.id ? { ...u, webauthn_cred_id: credId } : u,
      );
      const updatedUser = updatedUsers.find((u) => u.id === activeUser.id);

      set({
        users: updatedUsers,
        activeUser: updatedUser,
        isAuthenticated: true,
        isFirstRun: false,
        authError: null,
      });
      get().loadUserHoldings();
      return { success: true };
    } catch (err) {
      const msg =
        err.name === "NotAllowedError"
          ? "Touch ID was cancelled."
          : err.message;
      set({ authError: msg });
      toast.error(msg);
      return { success: false, error: msg };
    }
  },

  // ── Touch ID: Authenticate (subsequent runs) ──────────────────────────────
  async verifyTouchId() {
    set({ authError: null });
    const { activeUser } = get();
    if (!activeUser?.webauthn_cred_id) {
      set({ isFirstRun: true });
      return { success: false, error: "No credential enrolled." };
    }

    if (
      window.require &&
      activeUser.webauthn_cred_id === "electron-native-touch-id"
    ) {
      try {
        const { ipcRenderer } = window.require("electron");
        await ipcRenderer.invoke(
          "prompt-touch-id",
          "Authenticate to Gordan Belfort",
        );

        // If it didn't throw, authentication was successful
        set({ isAuthenticated: true, authError: null });
        get().loadUserHoldings();
        return { success: true };
      } catch (err) {
        let msg = err.message || "Touch ID cancelled.";
        if (
          msg.toLowerCase().includes("canceled") ||
          msg.toLowerCase().includes("cancelled")
        ) {
          msg = "Touch ID cancelled";
        } else if (msg.toLowerCase().includes("failed")) {
          msg = "Fingerprint not recognized";
        }
        set({ authError: msg });
        return { success: false, error: msg };
      }
    }

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: [
            {
              id: b64ToBuf(activeUser.webauthn_cred_id),
              type: "public-key",
            },
          ],
          userVerification: "required",
          timeout: 60000,
        },
      });

      set({ isAuthenticated: true, authError: null });
      get().loadUserHoldings();
      return { success: true };
    } catch (err) {
      const msg =
        err.name === "NotAllowedError"
          ? "Touch ID was cancelled."
          : err.message;
      set({ authError: msg });
      toast.error(msg);
      return { success: false, error: msg };
    }
  },

  // ── PIN fallback ──────────────────────────────────────────────────────────
  async verifyPin(pin) {
    const { activeUser } = get();
    if (!activeUser) return false;

    const hash = await sha256(pin);
    if (hash === activeUser.pin_hash) {
      set({ isAuthenticated: true, authError: null });
      get().loadUserHoldings();
      return true;
    }
    set({ authError: "Incorrect PIN" });
    return false;
  },

  async setPin(pin) {
    const { activeUser, users } = get();
    if (!activeUser) return;

    const hash = await sha256(pin);
    await setUserPinHash(activeUser.id, hash);

    // Update local cache so logout doesn't reset it
    const updatedUsers = users.map((u) =>
      u.id === activeUser.id ? { ...u, pin_hash: hash } : u,
    );
    const updatedUser = updatedUsers.find((u) => u.id === activeUser.id);

    set({
      users: updatedUsers,
      activeUser: updatedUser,
      isAuthenticated: true,
      isFirstRun: false,
      authError: null,
    });
    get().loadUserHoldings();
  },

  setAuthMode(mode) {
    set({ authMode: mode, authError: null });
  },
  logout() {
    set({
      isAuthenticated: false,
      authMode: "picker",
      activeUser: null,
      authError: null,
    });
  },

  // ── Currency ──────────────────────────────────────────────────────────────
  currency: "INR",
  usdInr: 83.5, // Hardcoded or future reliable API
  setCurrency(c) {
    set({ currency: c });
  },

  // ── Portfolio & Family ────────────────────────────────────────────────────
  family: null,
  holdings: [],
  isFamilyMode: false,

  async updateConfig(configPatch) {
    const updatedFamily = await updateFamilyConfig(configPatch);
    set({ family: updatedFamily });
    if (configPatch.baseCurrency) {
      set({ currency: configPatch.baseCurrency });
    }
  },

  async addHolding(holding) {
    const { activeUser } = get();
    if (!activeUser) return;
    await addHolding(activeUser.id, holding);
    get().loadUserHoldings();
  },

  async updateHolding(holdingId, patch) {
    const { activeUser } = get();
    if (!activeUser) return;
    await updateHolding(activeUser.id, holdingId, patch);
    get().loadUserHoldings();
  },

  async deleteHolding(holdingId) {
    const { activeUser } = get();
    if (!activeUser) return;
    await deleteHolding(activeUser.id, holdingId);
    get().loadUserHoldings();
  },

  async toggleFamilyMode() {
    const { isFamilyMode, activeUser, users } = get();
    if (activeUser?.role !== "admin") return;

    const nextMode = !isFamilyMode;
    let holdings = nextMode
      ? await getFamilyHoldings()
      : await getHoldingsForUser(activeUser.id);

    holdings = holdings.map((h) => ({
      ...h,
      _user: users.find((u) => u.id === h.user_id) || {
        name: "Unknown",
        color: "#ccc",
        initials: "?",
      },
    }));

    set({ isFamilyMode: nextMode, holdings });
  },

  async loadUserHoldings() {
    const { activeUser, users } = get();
    if (activeUser) {
      let holdings = await getHoldingsForUser(activeUser.id);
      holdings = holdings.map((h) => ({
        ...h,
        _user: users.find((u) => u.id === h.user_id) || {
          name: "Unknown",
          color: "#ccc",
          initials: "?",
        },
      }));
      set({ holdings, isFamilyMode: false });
    }
  },
}));
