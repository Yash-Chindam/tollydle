// ============================================================
// TOLLYDLE — Firebase Database Integration
// ============================================================

(function () {
  "use strict";

  // Global object to interact with the game logic
  window.TollydleFirebase = {
    // Callbacks to be set by game.js
    onSyncComplete: null,
    onAuthStatusChanged: null,

    // Methods to be called by game.js
    saveStats: saveStatsToFirestore,
    saveDayState: saveDayStateToFirestore,
    updateDisplayName: updateDisplayName,
    linkGoogle: linkGoogleAccount,
    signOut: signOutGoogle,
    getLeaderboard: getLeaderboard,
    
    // Status flags
    isInitialized: false,
    authStatus: {
      loading: true,
      signedIn: false,
      isAnonymous: true,
      displayName: "",
      email: "",
      uid: ""
    }
  };

  let db = null;
  let auth = null;
  let analytics = null;
  let currentUser = null;

  // Initialize Firebase if configured
  if (window.isFirebaseConfigured) {
    try {
      firebase.initializeApp(window.firebaseConfig);
      db = firebase.firestore();
      auth = firebase.auth();
      
      // Initialize Analytics if supported and setup
      if (firebase.analytics) {
        analytics = firebase.analytics();
      }
      
      window.TollydleFirebase.isInitialized = true;
      setupAuthListener();
    } catch (error) {
      console.error("🎬 Tollydle Firebase: Initialization failed", error);
    }
  }

  // Toast utility inside firebase-db to show notifications
  let toastTimer;
  function showToast(msg, ms = 2200) {
    const elToast = document.getElementById("toast");
    if (!elToast) return;
    elToast.textContent = msg;
    elToast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elToast.classList.remove("show"), ms);
  }

  // Setup Firebase Auth state listener
  function setupAuthListener() {
    auth.onAuthStateChanged(async (user) => {
      window.TollydleFirebase.authStatus.loading = true;
      triggerAuthCallback();

      if (!user) {
        // Not signed in, attempt anonymous sign in
        currentUser = null;
        try {
          await auth.signInAnonymously();
        } catch (error) {
          console.error("🎬 Tollydle Firebase: Anonymous sign-in failed", error);
          window.TollydleFirebase.authStatus.loading = false;
          triggerAuthCallback();
        }
        return;
      }

      currentUser = user;
      
      // Update status flags
      window.TollydleFirebase.authStatus = {
        loading: false,
        signedIn: !user.isAnonymous,
        isAnonymous: user.isAnonymous,
        displayName: user.displayName || localStorage.getItem("tollydle_username") || "",
        email: user.email || "",
        uid: user.uid
      };

      try {
        await syncUserData(user);
      } catch (error) {
        console.error("🎬 Tollydle Firebase: Sync failed", error);
      }

      triggerAuthCallback();
    });
  }

  // Trigger UI update in game.js regarding auth state
  function triggerAuthCallback() {
    if (window.TollydleFirebase.onAuthStatusChanged) {
      window.TollydleFirebase.onAuthStatusChanged(window.TollydleFirebase.authStatus);
    }
  }

  // Sync Local Storage with Firestore
  async function syncUserData(user) {
    const userDocRef = db.collection("users").doc(user.uid);
    let doc = await userDocRef.get();

    // Get current local states & stats
    const localStats = JSON.parse(localStorage.getItem("tollydle_v4_stats") || "{}");
    const localDayStates = JSON.parse(localStorage.getItem("tollydle_v4") || "{}");
    let currentLocalUsername = localStorage.getItem("tollydle_username");

    if (!doc.exists) {
      // Create user profile in Firestore
      const defaultUsername = currentLocalUsername || "TollywoodFan_" + Math.floor(1000 + Math.random() * 9000);
      currentLocalUsername = defaultUsername;
      localStorage.setItem("tollydle_username", defaultUsername);

      const profileData = {
        uid: user.uid,
        displayName: defaultUsername,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        stats: localStats,
        dayStates: localDayStates,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      };

      await userDocRef.set(profileData);
      window.TollydleFirebase.authStatus.displayName = defaultUsername;
    } else {
      // Remote doc exists, merge local and remote progress
      const remoteData = doc.data();
      const remoteStats = remoteData.stats || {};
      const remoteDayStates = remoteData.dayStates || {};
      const remoteDisplayName = remoteData.displayName || "";

      // Determine display name to use
      let finalDisplayName = remoteDisplayName || currentLocalUsername || "TollywoodFan_" + Math.floor(1000 + Math.random() * 9000);
      if (finalDisplayName !== currentLocalUsername) {
        localStorage.setItem("tollydle_username", finalDisplayName);
      }
      window.TollydleFirebase.authStatus.displayName = finalDisplayName;

      // Merge stats & day states
      const mergedStats = mergeStats(localStats, remoteStats);
      const mergedDayStates = mergeDayStates(localDayStates, remoteDayStates);

      // Save merged results locally
      localStorage.setItem("tollydle_v4_stats", JSON.stringify(mergedStats));
      localStorage.setItem("tollydle_v4", JSON.stringify(mergedDayStates));

      // Update merged results to Firestore
      await userDocRef.update({
        displayName: finalDisplayName,
        stats: mergedStats,
        dayStates: mergedDayStates,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Notify game.js to update UI
      if (window.TollydleFirebase.onSyncComplete) {
        window.TollydleFirebase.onSyncComplete(mergedStats, mergedDayStates);
      }
    }
  }

  // Merge stats helpers (take union / max progress)
  function mergeStats(local, remote) {
    const merged = {
      played: Math.max(local.played || 0, remote.played || 0),
      wins: Math.max(local.wins || 0, remote.wins || 0),
      streak: Math.max(local.streak || 0, remote.streak || 0),
      maxStreak: Math.max(local.maxStreak || 0, remote.maxStreak || 0),
      lastPlayedKey: local.lastPlayedKey || remote.lastPlayedKey || "",
      distribution: {},
      weeklyStats: {
        weekStart: local.weeklyStats?.weekStart || remote.weeklyStats?.weekStart || "",
        played: Math.max(local.weeklyStats?.played || 0, remote.weeklyStats?.played || 0),
        wins: Math.max(local.weeklyStats?.wins || 0, remote.weeklyStats?.wins || 0),
        perfectRound: Math.max(local.weeklyStats?.perfectRound || 0, remote.weeklyStats?.perfectRound || 0),
      }
    };

    // Merge distribution (1 to 15 attempts)
    for (let i = 1; i <= 15; i++) {
      const lVal = local.distribution ? (local.distribution[i] || 0) : 0;
      const rVal = remote.distribution ? (remote.distribution[i] || 0) : 0;
      merged.distribution[i] = Math.max(lVal, rVal);
    }

    return merged;
  }

  // Merge dayStates helpers
  function mergeDayStates(local, remote) {
    const merged = { ...local };

    for (const key in remote) {
      if (!local[key]) {
        merged[key] = remote[key];
      } else {
        const lState = local[key];
        const rState = remote[key];
        // Score completed puzzles higher than incomplete ones, and higher guess counts higher
        const lScore = (lState.gameOver ? 100 : 0) + (lState.guesses ? lState.guesses.length : 0);
        const rScore = (rState.gameOver ? 100 : 0) + (rState.guesses ? rState.guesses.length : 0);

        if (rScore > lScore) {
          merged[key] = rState;
        }
      }
    }
    return merged;
  }

  // Save Stats to Firestore
  async function saveStatsToFirestore(stats) {
    if (!db || !currentUser) return;
    try {
      await db.collection("users").doc(currentUser.uid).update({
        stats: stats,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      });
      // Log custom event to analytics
      if (analytics) {
        analytics.logEvent("save_stats", { played: stats.played, wins: stats.wins });
      }
    } catch (e) {
      console.error("🎬 Tollydle Firebase: Error saving stats", e);
    }
  }

  // Save Single Day State to Firestore
  async function saveDayStateToFirestore(key, state) {
    if (!db || !currentUser) return;
    try {
      await db.collection("users").doc(currentUser.uid).update({
        [`dayStates.${key}`]: state,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Log game completion
      if (state.gameOver && analytics) {
        analytics.logEvent("game_complete", {
          won: state.won,
          guesses: state.guesses ? state.guesses.length : 0,
          dayKey: key
        });
      }
    } catch (e) {
      console.error("🎬 Tollydle Firebase: Error saving day state", e);
    }
  }

  // Update Display Name
  async function updateDisplayName(name) {
    const cleanName = name.trim().substring(0, 20);
    if (!cleanName) return;

    localStorage.setItem("tollydle_username", cleanName);
    window.TollydleFirebase.authStatus.displayName = cleanName;

    if (db && currentUser) {
      try {
        await db.collection("users").doc(currentUser.uid).update({
          displayName: cleanName,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast("Display name updated! 👤");
        triggerAuthCallback();
      } catch (e) {
        console.error("🎬 Tollydle Firebase: Error updating display name", e);
      }
    } else {
      showToast("Display name updated locally!");
      triggerAuthCallback();
    }
  }

  // Link Anonymous user with Google credential
  async function linkGoogleAccount() {
    if (!auth || !auth.currentUser) {
      showToast("Firebase not connected.");
      return;
    }

    const user = auth.currentUser;
    const provider = new firebase.auth.GoogleAuthProvider();

    try {
      const result = await user.linkWithPopup(provider);
      showToast("Linked to Google successfully! ☁️");
      return result.user;
    } catch (error) {
      if (error.code === "auth/credential-already-in-use") {
        if (confirm("This Google account is already linked to another Tollydle profile. Would you like to switch to it? (Your current local progress will be merged into that account.)")) {
          const credential = error.credential;
          
          // Store local before log in
          const localStats = JSON.parse(localStorage.getItem("tollydle_v4_stats") || "{}");
          const localDayStates = JSON.parse(localStorage.getItem("tollydle_v4") || "{}");

          // Login with credential
          const userCredential = await auth.signInWithCredential(credential);
          const signedInUser = userCredential.user;

          // Merge local stats into Google account on Firestore
          const userDocRef = db.collection("users").doc(signedInUser.uid);
          const remoteDoc = await userDocRef.get();

          let mergedStats = localStats;
          let mergedDayStates = localDayStates;
          let displayName = localStorage.getItem("tollydle_username") || signedInUser.displayName || "TollywoodFan_" + Math.floor(1000 + Math.random() * 9000);

          if (remoteDoc.exists) {
            const remoteData = remoteDoc.data();
            mergedStats = mergeStats(localStats, remoteData.stats || {});
            mergedDayStates = mergeDayStates(localDayStates, remoteData.dayStates || {});
            displayName = remoteData.displayName || displayName;
          }

          // Update local storage
          localStorage.setItem("tollydle_v4_stats", JSON.stringify(mergedStats));
          localStorage.setItem("tollydle_v4", JSON.stringify(mergedDayStates));
          localStorage.setItem("tollydle_username", displayName);

          // Update Firestore
          await userDocRef.set({
            uid: signedInUser.uid,
            displayName: displayName,
            stats: mergedStats,
            dayStates: mergedDayStates,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          // Notify game logic
          if (window.TollydleFirebase.onSyncComplete) {
            window.TollydleFirebase.onSyncComplete(mergedStats, mergedDayStates);
          }

          showToast("Switched to Google profile! ☁️");
        }
      } else {
        console.error("🎬 Tollydle Firebase: Google link error", error);
        showToast("Linking failed: " + error.message);
      }
    }
  }

  // Sign out Google Account
  async function signOutGoogle() {
    if (!auth) return;
    try {
      await auth.signOut();
      // local Storage is NOT cleared so local anonymous player keeps stats.
      showToast("Signed out. Switched to local profile.");
    } catch (e) {
      console.error("🎬 Tollydle Firebase: Sign-out failed", e);
    }
  }

  // Get Top 10 users ordered by wins
  async function getLeaderboard() {
    if (!db) {
      return [];
    }

    try {
      const snapshot = await db.collection("users")
        .orderBy("stats.wins", "desc")
        .limit(10)
        .get();

      const leaderboard = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        leaderboard.push({
          uid: doc.id,
          displayName: data.displayName || "Anonymous Player",
          wins: data.stats ? (data.stats.wins || 0) : 0,
          streak: data.stats ? (data.stats.streak || 0) : 0,
          maxStreak: data.stats ? (data.stats.maxStreak || 0) : 0
        });
      });
      return leaderboard;
    } catch (e) {
      console.error("🎬 Tollydle Firebase: Error fetching leaderboard", e);
      return [];
    }
  }
})();
