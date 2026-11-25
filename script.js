import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_DATABASE_URL,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Fixed: uses 'db' instead of undefined 'database'
const roofRef = ref(db, "roofMonitor");

const $ = id => document.getElementById(id);

let lastUpdate = null;

function classifyDistance(distance) {
  if (distance < 1.70) {
    return {
      status: "danger",
      title: "DANGER — EVACUATE IMMEDIATELY",
      message:
        "Distance is below 1.70 m. Evacuate the affected area according to the mine's emergency procedures."
    };
  }

  if (distance < 1.80) {
    return {
      status: "unsafe",
      title: "NOT SAFE",
      message:
        "Distance is below 1.80 m. The configured unsafe threshold has been reached."
    };
  }

  if (distance < 2.00) {
    return {
      status: "warning",
      title: "WARNING",
      message:
        "Distance is below 2.00 m. Investigate the condition and follow site safety procedures."
    };
  }

  return {
    status: "safe",
    title: "SAFE THRESHOLD MET",
    message:
      "Reading meets the configured 2.00 m threshold. This does not independently establish structural safety."
  };
}

function setConnection(connected) {
  $("connectionDot").className =
    "dot " + (connected ? "connected" : "disconnected");

  $("connectionText").textContent =
    connected ? "Firebase connected" : "Connection lost";
}

function showUnavailable(message) {
  $("alertBanner").className = "alert-banner status-unknown";
  $("alertSymbol").textContent = "!";
  $("statusTitle").textContent = "SENSOR DATA UNAVAILABLE";
  $("statusMessage").textContent = message;

  $("statusIcon").className = "status-icon unknown";
  $("statusIcon").textContent = "?";
  $("statusLabel").textContent = "Unknown";
  $("statusDescription").textContent =
    "Do not assume the mine is safe without valid, fresh sensor data.";

  $("distanceValue").textContent = "--.--";
  $("meterFill").style.width = "0%";
  $("meterFill").className = "meter-fill unknown";
  $("sensorHealth").textContent = "Unavailable";
  $("readingAge").textContent = "Unavailable";
}

function displayReading(data) {
  const distance = Number(data.distance_m);
  const valid = data.valid === true;

  if (!valid) {
    lastUpdate = null;
    setConnection(false);
    showUnavailable("The sensor reading is marked invalid in Firebase.");
    return;
  }

  if (
    data.distance_m === null ||
    data.distance_m === undefined ||
    data.distance_m === "" ||
    !Number.isFinite(distance) ||
    distance < 0
  ) {
    throw new Error("Invalid distance_m value.");
  }

  const result = classifyDistance(distance);
  lastUpdate = Date.now();

  // Distance display
  $("distanceValue").textContent = distance.toFixed(2);

  // Firebase timestamp is in milliseconds since Unix epoch.
  const timestamp = Number(data.timestamp);
  const timestampDate = Number.isFinite(timestamp)
    ? new Date(timestamp)
    : null;

  $("lastUpdated").textContent =
    timestampDate && Number.isFinite(timestampDate.getTime())
      ? timestampDate.toLocaleString()
      : new Date().toLocaleString();

  $("readingAge").textContent = "Just received";
  $("sensorHealth").textContent = "Online";

  // Main alert
  $("alertBanner").className =
    "alert-banner status-" + result.status;

  $("alertSymbol").textContent =
    result.status === "safe" ? "✓" :
    result.status === "warning" ? "!" : "⚠";

  $("statusTitle").textContent = result.title;
  $("statusMessage").textContent = result.message;

  // Status card
  $("statusIcon").className =
    "status-icon " + result.status;

  $("statusIcon").textContent =
    result.status === "safe" ? "✓" :
    result.status === "warning" ? "!" : "⚠";

  $("statusLabel").textContent =
    result.status === "safe" ? "Safe Threshold Met" :
    result.status === "warning" ? "Warning" :
    result.status === "unsafe" ? "Not Safe" : "Danger";

  $("statusDescription").textContent = result.message;

  // Distance meter (visual scale from 0 to 3 m)
  const percentage = Math.max(
    0,
    Math.min(100, (distance / 3) * 100)
  );

  $("meterFill").style.width = percentage + "%";
  $("meterFill").className =
    "meter-fill " + result.status;

  // Status comes from Firebase, not an assumption about hardware.
  $("ledState").textContent =
    "Not reported by Firebase";

  $("buzzerState").textContent =
    "Not reported by Firebase";

  setConnection(true);
}

// Listen for real-time updates
onValue(
  roofRef,
  snapshot => {
    try {
      if (!snapshot.exists()) {
        lastUpdate = null;
        setConnection(false);
        showUnavailable("No data found under roofMonitor.");
        return;
      }

      const data = snapshot.val();
      displayReading(data);

    } catch (error) {
      console.error("Invalid roof sensor data:", error);
      lastUpdate = null;
      setConnection(false);
      showUnavailable("Firebase contains invalid sensor data.");
    }
  },
  error => {
    console.error("Firebase read error:", error.code, error.message);
    lastUpdate = null;
    setConnection(false);
    showUnavailable(
      "Unable to read Firebase. Check your internet connection and database permissions."
    );
  }
);

// Detect missing updates
setInterval(() => {
  if (
    lastUpdate === null ||
    Date.now() - lastUpdate > 10000
  ) {
    setConnection(false);
    showUnavailable("No fresh valid reading received for 10 seconds.");
  } else {
    $("readingAge").textContent =
      Math.floor((Date.now() - lastUpdate) / 1000) +
      " seconds ago";
  }
}, 1000);
