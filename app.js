// CivicSnap — Frontend Application
// All AI requests are proxied through a secure Cloudflare Worker backend.
// No API keys are stored or used in this file.

const BACKEND_URL = 'https://civicsnap-backend.sabarish230708.workers.dev';

/**
 * Sends a base64-encoded image to the CivicSnap backend for AI categorization.
 * The backend holds the Gemini API key securely as an encrypted secret.
 * Returns a Promise that resolves to { issue: "...", department: "..." }.
 */
async function categorizeImage(imageBase64, mimeType) {
  const response = await fetch(BACKEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ image: imageBase64, mimeType: mimeType || "image/jpeg" })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI processing failed (${response.status}): ${errText}`);
  }
  return await response.json();
}


// Global State
let currentStream = null;
let capturedImageBase64 = null;
let currentLocation = null;

// --- Navigation ---
window.navigateTo = function(viewId) {
    // Update active nav button
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${viewId}`).classList.add('active');

    // Update active view
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');

    // Special view logic
    if (viewId === 'pending') {
        renderPendingQueries();
    }
};

// --- Camera Logic ---
const video = document.getElementById('camera-feed');
const canvas = document.getElementById('photo-canvas');
const photoPreview = document.getElementById('photo-preview');
const startCameraBtn = document.getElementById('start-camera-btn');
const takePhotoBtn = document.getElementById('take-photo-btn');
const retakePhotoBtn = document.getElementById('retake-photo-btn');
const submitBtn = document.getElementById('submit-query-btn');

startCameraBtn.addEventListener('click', async () => {
    try {
        currentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = currentStream;
        video.style.display = 'block';
        photoPreview.style.display = 'none';
        
        startCameraBtn.style.display = 'none';
        takePhotoBtn.style.display = 'inline-flex';
        retakePhotoBtn.style.display = 'none';
    } catch (err) {
        alert('Error accessing camera: ' + err.message);
    }
});

takePhotoBtn.addEventListener('click', () => {
    if (!currentStream) return;
    
    // Set canvas dimensions to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to Base64
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    capturedImageBase64 = dataUrl.split(',')[1]; // Remove data URI prefix
    
    // Stop stream
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
    
    // Update UI
    video.style.display = 'none';
    photoPreview.src = dataUrl;
    photoPreview.style.display = 'block';
    
    takePhotoBtn.style.display = 'none';
    retakePhotoBtn.style.display = 'inline-flex';
    
    checkSubmitReadiness();
});

retakePhotoBtn.addEventListener('click', () => {
    capturedImageBase64 = null;
    document.getElementById('ai-result').style.display = 'none';
    startCameraBtn.click();
});

// --- Location Logic ---
const getLocationBtn = document.getElementById('get-location-btn');
const locationText = document.getElementById('location-text');

getLocationBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser");
        return;
    }
    
    locationText.textContent = "Fetching location...";
    navigator.geolocation.getCurrentPosition(
        (position) => {
            currentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            locationText.textContent = `Location: ${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}`;
            checkSubmitReadiness();
        },
        (error) => {
            locationText.textContent = "Error: " + error.message;
        }
    );
});

// --- Submit & AI Logic ---
function checkSubmitReadiness() {
    if (capturedImageBase64 && currentLocation) {
        submitBtn.disabled = false;
    } else {
        submitBtn.disabled = true;
    }
}

submitBtn.addEventListener('click', async () => {
    if (!capturedImageBase64 || !currentLocation) return;
    
    submitBtn.disabled = true;
    document.getElementById('ai-processing').style.display = 'block';
    document.getElementById('ai-result').style.display = 'none';
    
    try {
        // Send image to backend worker for AI categorization
        // The prompt and API key are handled entirely server-side
        const resultJson = await categorizeImage(capturedImageBase64, 'image/jpeg');
        
        // Show result
        document.getElementById('res-issue').textContent = resultJson.issue;
        document.getElementById('res-dept').textContent = resultJson.department;
        document.getElementById('ai-processing').style.display = 'none';
        document.getElementById('ai-result').style.display = 'block';
        
        // Save to local storage
        saveQuery(resultJson.issue, resultJson.department, capturedImageBase64, currentLocation);
        
    } catch (err) {
        console.error(err);
        alert('AI processing failed. Please try again.');
        submitBtn.disabled = false;
        document.getElementById('ai-processing').style.display = 'none';
    }
});

// --- Pending Queries (Local Storage) ---
function saveQuery(issue, department, imageBase64, location) {
    const queries = JSON.parse(localStorage.getItem('civicQueries') || '[]');
    queries.unshift({
        id: Date.now(),
        issue,
        department,
        image: 'data:image/jpeg;base64,' + imageBase64,
        location,
        date: new Date().toLocaleDateString()
    });
    localStorage.setItem('civicQueries', JSON.stringify(queries));
}

function renderPendingQueries() {
    const list = document.getElementById('queries-list');
    const queries = JSON.parse(localStorage.getItem('civicQueries') || '[]');
    
    if (queries.length === 0) {
        list.innerHTML = '<p class="empty-state">No pending queries found.</p>';
        return;
    }
    
    list.innerHTML = queries.map(q => `
        <div class="query-card">
            <img src="${q.image}" alt="Issue Image" />
            <div class="query-details">
                <span class="query-tag">${q.department}</span>
                <h3>${q.issue}</h3>
                <p class="query-loc">📍 ${q.location.lat.toFixed(4)}, ${q.location.lng.toFixed(4)}</p>
                <p class="query-loc">📅 ${q.date}</p>
            </div>
        </div>
    `).join('');
}
