// service-worker.js - Enhanced for background operation
const CACHE_NAME = 'hello-pwa-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/app.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

// Database for storing location data when offline
let locationDB;

// Initialize IndexedDB for offline data storage
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('LocationDatabase', 1);
    
    request.onerror = event => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      const store = db.createObjectStore('locations', { autoIncrement: true });
      store.createIndex('timestamp', 'timestamp', { unique: false });
    };
    
    request.onsuccess = event => {
      locationDB = event.target.result;
      console.log('IndexedDB initialized successfully');
      resolve(locationDB);
    };
  });
}

// Save location to IndexedDB
async function saveLocationToIndexedDB(locationData) {
  return new Promise((resolve, reject) => {
    const transaction = locationDB.transaction(['locations'], 'readwrite');
    const store = transaction.objectStore('locations');
    const request = store.add(locationData);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = event => reject(event.target.error);
  });
}

// Get all stored locations from IndexedDB
async function getStoredLocations() {
  return new Promise((resolve, reject) => {
    const transaction = locationDB.transaction(['locations'], 'readonly');
    const store = transaction.objectStore('locations');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = event => reject(event.target.error);
  });
}

// Clear locations after successful sync
async function clearStoredLocations() {
  return new Promise((resolve, reject) => {
    const transaction = locationDB.transaction(['locations'], 'readwrite');
    const store = transaction.objectStore('locations');
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = event => reject(event.target.error);
  });
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => initDB())
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
    .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached file or fetch from network if not available
        return response || fetch(event.request);
      })
      .catch(error => {
        console.error('Fetch error:', error);
        // You might want to return a custom offline page here
      })
  );
});

// Listen for background sync events
self.addEventListener('sync', event => {
  if (event.tag === 'sync-locations') {
    event.waitUntil(syncLocations());
  }
});

// Handle periodic background sync
self.addEventListener('periodicsync', event => {
  if (event.tag === 'location-update') {
    event.waitUntil(recordLocationInBackground());
  }
});

// Periodic background location capturing
async function recordLocationInBackground() {
  try {
    // Get current position in the background
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { 
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      });
    });
    
    const now = new Date();
    const timestamp = now.toISOString();
    
    // Convert to numbers for numeric column types
    const latitude = parseFloat(position.coords.latitude);
    const longitude = parseFloat(position.coords.longitude);
    const altitude = position.coords.altitude ? parseFloat(position.coords.altitude) : null;
    
    // Create location data object
    const locationData = {
      timestamp: timestamp,
      userid: await getStoredUserId(),
      latitude: latitude,
      longitude: longitude,
      elevation: altitude
    };
    
    // Save location data to IndexedDB for later sync
    await saveLocationToIndexedDB(locationData);
    console.log('[Background] Location recorded:', locationData);
    
    // Try to sync immediately if possible
    if (navigator.onLine) {
      await syncLocations();
    }
    
    return true;
  } catch (error) {
    console.error('[Background] Error recording location:', error);
    return false;
  }
}

// Sync stored locations to the server
async function syncLocations() {
  try {
    if (!navigator.onLine) {
      console.log('Currently offline, will sync when online');
      return false;
    }
    
    console.log('Starting location sync...');
    
    // Get all stored locations
    const locations = await getStoredLocations();
    
    if (locations.length === 0) {
      console.log('No locations to sync');
      return true;
    }
    
    console.log(`Syncing ${locations.length} locations...`);
    
    // Get Supabase client info from the main thread
    const clientInfo = await getSupabaseClientInfo();
    
    // Create a new Supabase client
    // Note: In a real implementation, you'd need to load the Supabase library in the worker
    // This is simplified for demonstration purposes
    const response = await fetch('https://jeszxshbzmnxdoqjltuk.supabase.co/rest/v1/locations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': clientInfo.supabaseKey,
        'Authorization': `Bearer ${clientInfo.supabaseKey}`
      },
      body: JSON.stringify(locations)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    console.log('Locations synced successfully');
    
    // Clear synced locations
    await clearStoredLocations();
    
    return true;
  } catch (error) {
    console.error('Error syncing locations:', error);
    return false;
  }
}

// Get Supabase client info from the main thread
async function getSupabaseClientInfo() {
  const clients = await self.clients.matchAll();
  if (clients.length === 0) {
    return {
      supabaseUrl: 'https://jeszxshbzmnxdoqjltuk.supabase.co',
      supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Implc3p4c2hiem1ueGRvcWpsdHVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4MzM0NjIsImV4cCI6MjA1NjQwOTQ2Mn0.FgZmXxDX00_9OLyLgFM_dyrPpb1eISeIte9s1edLPcE'
    };
  }
  
  return new Promise((resolve, reject) => {
    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = event => resolve(event.data);
    clients[0].postMessage({ type: 'GET_CLIENT_INFO' }, [messageChannel.port2]);
    // Add timeout in case there's no response
    setTimeout(() => {
      reject(new Error('Timeout getting client info'));
    }, 3000);
  });
}

// Get stored user ID
async function getStoredUserId() {
  // Try to get user ID from clients
  try {
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      return new Promise((resolve, reject) => {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = event => resolve(event.data.userId);
        clients[0].postMessage({ type: 'GET_USER_ID' }, [messageChannel.port2]);
        // Add timeout
        setTimeout(() => {
          // Default user ID if we can't get it
          resolve(generateUUID());
        }, 1000);
      });
    }
  } catch (error) {
    console.error('Error getting user ID from client:', error);
  }
  
  // Fallback to generating a new ID
  return generateUUID();
}

// Generate UUID (same function from your app.js)
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, 
          v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// For handling messages from the main thread
self.addEventListener('message', event => {
  if (event.data.type === 'STORE_USER_ID') {
    // Store user ID in service worker scope
    self.userId = event.data.userId;
    console.log('[SW] User ID stored:', self.userId);
    event.ports[0].postMessage({ success: true });
  } else if (event.data.type === 'GET_USER_ID') {
    // Return stored user ID
    event.ports[0].postMessage({ userId: self.userId || generateUUID() });
  } else if (event.data.type === 'RECORD_LOCATION_NOW') {
    // Manually trigger location recording
    event.waitUntil(recordLocationInBackground());
    event.ports[0].postMessage({ success: true });
  }
});