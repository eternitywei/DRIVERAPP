// Function to convert degrees to radians
function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

// Function to calculate the haversine distance between two points
function haversineDistance(coords1, coords2) {
  // Earth's radius in meters
  var R = 6371e3;
  
  // Destructure latitude and longitude for each coordinate pair
  var lat1 = coords1[0], lon1 = coords1[1];
  var lat2 = coords2[0], lon2 = coords2[1];
  
  // Convert latitudes and longitudes from degrees to radians
  var lat1Rad = toRadians(lat1);
  var lat2Rad = toRadians(lat2);
  var deltaLat = toRadians(lat2 - lat1);
  var deltaLon = toRadians(lon2 - lon1);
  
  // Haversine formula
  var a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
          Math.cos(lat1Rad) * Math.cos(lat2Rad) *
          Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  // Distance in meters
  return R * c;
}

// Example GPS coordinates (latitude, longitude)
var coord1 = [15.3736225, 119.948539];
var coord2 = [14.5332444341148, 121.05012422511685];

var distanceMeters = haversineDistance(coord1, coord2);
var distanceKilometers = distanceMeters / 1000;

console.log("Distance: " + distanceMeters.toFixed(2) + " meters");
console.log("Distance: " + distanceKilometers.toFixed(2) + " kilometers");
