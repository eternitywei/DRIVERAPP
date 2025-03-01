// app.js - v0.8 - With background processing support

// ✅ Check if Supabase is available in global scope
if (typeof supabase === 'undefined') {
  console.error("❌ Supabase library not loaded. Make sure supabase-js is loaded before this script.");
} else {
  console.log("✅ Supabase library loaded successfully as global 'supabase' object.");
  initializeApp();
}

// Main application initialization
function initializeApp() {
  console.log("🚀 Initializing application...");
  
  // Initialize Supabase client
  const supabaseUrl = 'https://jeszxshbzmnxdoqjltuk.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Implc3p4c2hiem1ueGRvcWpsdHVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4MzM0NjIsImV4cCI6MjA1NjQwOTQ2Mn0.FgZmXxDX00_9OLyLgFM_dyrPpb1eISeIte9s1edLPcE';
  
  // Create Supabase client using the global supabase object
  const client = supabase.createClient(supabaseUrl, supabaseKey);
  console.log("✅ Supabase client initialized:", client);
  
  // Create a valid UUID for user ID (RFC4122 compliant)
  // This is a simple UUID v4 generation function
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, 
            v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  // Get stored user ID or generate a new one if not found
  let userId = localStorage.getItem('userId');
  if (!userId) {
    userId = generateUUID();
    localStorage.setItem('userId', userId);
  }
  console.log("User ID:", userId);
  
  let rowCounter = 1; // Local counter for display
  let wakeLock = null; // Store the wake lock reference
  
  // Register service worker and set up background sync
  setupServiceWorker();
  
  // Fetch data and set up row addition
  fetchStoredData();
  scheduleRowAddition();
  setupBackgroundProcessing();
  
  // ✅ Set up service worker and background sync
  function setupServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js')
        .then(registration => {
          console.log('✅ Service Worker registered with scope:', registration.scope);
          
          // Send userId to service worker
          if (navigator.serviceWorker.controller) {
            sendUserIdToServiceWorker();
          } else {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              sendUserIdToServiceWorker();
            });
          }
          
          // Register for periodic sync if supported
          if ('periodicSync' in registration) {
            registerPeriodicSync(registration);
          } else {
            console.log('⚠️ Periodic Background Sync not supported');
          }
          
          // Register for background sync
          if ('sync' in registration) {
            navigator.serviceWorker.ready.then(swRegistration => {
              return swRegistration.sync.register('sync-locations');
            }).catch(err => {
              console.error('⚠️ Background Sync registration failed:', err);
            });
          } else {
            console.log('⚠️ Background Sync not supported');
          }
        })
        .catch(error => {
          console.error('❌ Service Worker registration failed:', error);
        });
      
      // Setup message handler for service worker communication
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data.type === 'NEW_LOCATION_RECORDED') {
          console.log('📍 New location recorded in background:', event.data.location);
          appendRow(
            event.data.location.latitude.toFixed(4),
            event.data.location.longitude.toFixed(4),
            event.data.location.elevation ? event.data.location.elevation.toFixed(2) : null,
            new Date(event.data.location.timestamp).toLocaleString(),
            event.data.location.userid
          );
        }
      });
    } else {
      console.error('❌ Service Workers not supported in this browser');
    }
  }
  
  // Send user ID to service worker
  function sendUserIdToServiceWorker() {
    if (!navigator.serviceWorker.controller) return;
    
    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = event => {
      if (event.data.success) {
        console.log('✅ User ID successfully sent to Service Worker');
      }
    };
    
    navigator.serviceWorker.controller.postMessage({
      type: 'STORE_USER_ID',
      userId: userId
    }, [messageChannel.port2]);
  }
  
  // Register for periodic background sync
  async function registerPeriodicSync(registration) {
    try {
      if ('periodicSync' in registration) {
        // Check permission
        const status = await navigator.permissions.query({
          name: 'periodic-background-sync',
        });
        
        if (status.state === 'granted') {
          // Register for periodic sync every 15 minutes (minimum allowed)
          await registration.periodicSync.register('location-update', {
            minInterval: 15 * 60 * 1000, // 15 minutes in milliseconds
          });
          console.log('✅ Periodic Background Sync registered');
        } else {
          console.log('⚠️ Periodic Background Sync permission not granted');
        }
      }
    } catch (error) {
      console.error('❌ Error registering Periodic Background Sync:', error);
    }
  }
  
  // Setup background processing and wake locks
  async function setupBackgroundProcessing() {
    // If wake lock is available, try to use it
    if ('wakeLock' in navigator) {
      try {
        // Request a screen wake lock
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('✅ Wake Lock acquired');
        
        wakeLock.addEventListener('release', () => {
          console.log('💤 Wake Lock released');
        });
      } catch (err) {
        console.error('❌ Error acquiring Wake Lock:', err);
      }
    } else {
      console.log('⚠️ Wake Lock API not supported in this browser');
    }
    
    // Add event listeners for page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Add event listener for online/offline status
    window.addEventListener('online', () => {
      console.log('🌐 App is online');
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(registration => {
          registration.sync.register('sync-locations');
        });
      }
    });
    
    window.addEventListener('offline', () => {
      console.log('📴 App is offline');
    });
  }
  
  // Handle page visibility changes
  async function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      console.log('📱 Page is now hidden');
      
      // If the wake lock is active, release it to save battery
      if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
      
      // Force a location record before going to background
      if (navigator.serviceWorker.controller) {
        const messageChannel = new MessageChannel();
        navigator.serviceWorker.controller.postMessage({
          type: 'RECORD_LOCATION_NOW'
        }, [messageChannel.port2]);
      }
      
      // Register background sync
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          registration.sync.register('sync-locations');
        });
      }
    } else if (document.visibilityState === 'visible') {
      console.log('📱 Page is now visible');
      
      // Re-acquire the wake lock
      if (!wakeLock && 'wakeLock' in navigator) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('✅ Wake Lock re-acquired');
        } catch (err) {
          console.error('❌ Error re-acquiring Wake Lock:', err);
        }
      }
      
      // Refresh the data
      fetchStoredData();
    }
  }
  
  // ✅ Retrieve stored data from Supabase and populate the table
  async function fetchStoredData() {
    try {
      console.log("📥 Fetching stored location data...");
      const { data, error } = await client
        .from('locations')
        .select('*')
        .order('timestamp', { ascending: true });

      if (error) {
        throw error;
      }
      
      console.log(`✅ Retrieved ${data.length} records from database`);
      
      // Clear existing rows
      const tbody = document.querySelector('table tbody');
      tbody.innerHTML = '';
      
      data.forEach(row => {
        appendRow(row.latitude, row.longitude, row.elevation, row.timestamp, row.userid, row.locationid);
      });
      
      rowCounter = data.length + 1; // Adjust row counter
    } catch (error) {
      console.error("❌ Error retrieving data from Supabase:", error);
    }
  }

  // ✅ Append a row to the table with six columns
  function appendRow(latitude, longitude, altitude, timestamp, userid, locationid) {
    const tbody = document.querySelector('table tbody');
    const tr = document.createElement('tr');

    const cellLocationId = document.createElement('td');
    cellLocationId.textContent = locationid || rowCounter;

    const cellUserId = document.createElement('td');
    cellUserId.textContent = userid || userId;

    const cellTimestamp = document.createElement('td');
    cellTimestamp.textContent = timestamp;

    const cellLongitude = document.createElement('td');
    cellLongitude.textContent = longitude;

    const cellLatitude = document.createElement('td');
    cellLatitude.textContent = latitude;

    const cellElevation = document.createElement('td');
    cellElevation.textContent = (altitude !== null && altitude !== undefined) ? altitude + " m" : "N/A";

    tr.appendChild(cellLocationId);
    tr.appendChild(cellUserId);
    tr.appendChild(cellTimestamp);
    tr.appendChild(cellLongitude);
    tr.appendChild(cellLatitude);
    tr.appendChild(cellElevation);
    tbody.appendChild(tr);

    console.log("✅ Row Added:", { locationid, userid, timestamp, longitude, latitude, elevation: altitude });

    if (!locationid) {
      rowCounter++;
    }
  }

  // ✅ Store a new row in Supabase
  async function storeRowData(timestamp, userid, latitude, longitude, altitude) {
    try {
      // Handle invalid values - Convert "N/A" to null before inserting
      const validLatitude = latitude === "N/A" ? null : latitude;
      const validLongitude = longitude === "N/A" ? null : longitude;
      const validElevation = altitude === "N/A" ? null : altitude;
      
      // Ensure data types match what Supabase expects
      const dataToInsert = { 
        userid: userid, // uuid type in Supabase (should be a valid UUID)
        timestamp: timestamp, // timestamptz type in Supabase
        latitude: validLatitude, // numeric type in Supabase 
        longitude: validLongitude, // numeric type in Supabase
        elevation: validElevation // numeric type in Supabase
      };
      
      // Log the data we're trying to insert for debugging
      console.log("Attempting to insert data:", dataToInsert);
      
      // Insert data with proper error handling
      const { data, error } = await client
        .from('locations')
        .insert([dataToInsert]);

      if (error) {
        console.error("❌ Insert error details:", error);
        throw error;
      }
      
      console.log("✅ Data stored in Supabase successfully");
    } catch (error) {
      console.error("❌ Error storing data to Supabase:", error.message);
      // If there's a more detailed error object, log it
      if (error.details || error.hint || error.code) {
        console.error("Error details:", {
          details: error.details,
          hint: error.hint,
          code: error.code
        });
      }
      
      // If online but failed to store, it might be a temporary error
      // Try to queue for background sync
      if (navigator.onLine && 'serviceWorker' in navigator) {
        const locationData = {
          timestamp: timestamp,
          userid: userid,
          latitude: latitude,
          longitude: longitude,
          elevation: altitude
        };
        
        // Send to service worker for storage
        if (navigator.serviceWorker.controller) {
          const messageChannel = new MessageChannel();
          navigator.serviceWorker.controller.postMessage({
            type: 'STORE_LOCATION',
            location: locationData
          }, [messageChannel.port2]);
        }
      }
    }
  }

  // ✅ Schedule adding a new row at the start of the next minute
  function scheduleRowAddition() {
    const now = new Date();
    const seconds = now.getSeconds();
    const delay = (60 - seconds) * 1000;
    
    console.log(`⏱️ Scheduling first row addition in ${delay/1000} seconds`);
    
    setTimeout(() => {
      addRow();
      setInterval(addRow, 60000); // Then every minute
    }, delay);
  }

  // ✅ Add a new row using the device's location data
  function addRow() {
    const now = new Date();
    // Use ISO format for PostgreSQL timestamptz compatibility
    const timestamp = now.toISOString();
    const displayTimestamp = now.toLocaleString(); // For display only

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function (position) {
          // Convert to numbers for numeric column types
          const latitude = parseFloat(position.coords.latitude);
          const longitude = parseFloat(position.coords.longitude);
          const altitude = position.coords.altitude ? parseFloat(position.coords.altitude) : null;
          
          // Use formatted values for display
          const displayLatitude = latitude.toFixed(4);
          const displayLongitude = longitude.toFixed(4);
          const displayAltitude = altitude !== null ? altitude.toFixed(2) : null;
          
          appendRow(displayLatitude, displayLongitude, displayAltitude, displayTimestamp, userId);
          storeRowData(timestamp, userId, latitude, longitude, altitude);
        },
        function (error) {
          console.error("❌ Error obtaining location:", error);
          appendRow("N/A", "N/A", "N/A", displayTimestamp, userId);
          // Don't try to store invalid data
          console.error("❌ Skipping data storage due to geolocation error");
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      console.error("❌ Geolocation is not supported by this browser");
      appendRow("N/A", "N/A", "N/A", displayTimestamp, userId);
      console.error("❌ Skipping data storage due to lack of geolocation support");
    }
  }
}