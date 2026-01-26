/**
 * Implicit Feedback Collector for ML Model Improvement
 *
 * Collects user feedback on stroke predictions without requiring explicit input.
 * - Accepted: User doesn't undo the prediction within timeout
 * - Rejected: User undoes/redoes the prediction
 *
 * Data is stored in Firebase Firestore for later model retraining.
 */

// ============================================================================
// Configuration
// ============================================================================

const FEEDBACK_CONFIG = {
    // Time to wait before considering a prediction "accepted" (ms)
    acceptanceTimeout: 5000,

    // Batch size before uploading to Firestore
    batchSize: 2,

    // Local storage key for pending feedback
    storageKey: 'onepen_feedback_queue',

    // Firestore collection name
    collectionName: 'stroke_feedback',

    // Enable/disable feedback collection (respects user privacy setting)
    enabled: true,

    // Only collect feedback for predictions with confidence below this threshold
    // (helps focus on uncertain predictions that need more training data)
    uncertaintyThreshold: 0.85,

    // Maximum stroke points to store (for data size management)
    maxStrokePoints: 200,
};

// ============================================================================
// Feedback Queue Management
// ============================================================================

// In-memory queue of pending feedback
let feedbackQueue = [];

// Map of pending predictions (waiting for acceptance timeout)
const pendingPredictions = new Map();

// Session ID for grouping feedback from same session
const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);

/**
 * Initialize the feedback collector
 * Loads any pending feedback from local storage
 */
function initFeedbackCollector() {
    // Check if user has opted in to data collection
    const optedIn = localStorage.getItem('onepen_data_collection_opt_in');
    if (optedIn === 'false') {
        FEEDBACK_CONFIG.enabled = false;
        console.log('[Feedback] Data collection disabled by user');
        return;
    }

    // Load pending feedback from local storage
    try {
        const stored = localStorage.getItem(FEEDBACK_CONFIG.storageKey);
        if (stored) {
            feedbackQueue = JSON.parse(stored);
            console.log(`[Feedback] Loaded ${feedbackQueue.length} pending feedback items`);
        }
    } catch (e) {
        console.warn('[Feedback] Failed to load stored feedback:', e);
        feedbackQueue = [];
    }

    // Try to upload any pending feedback
    if (feedbackQueue.length > 0) {
        uploadFeedbackBatch();
    }

    console.log('[Feedback] Collector initialized, session:', sessionId);
}

/**
 * Save feedback queue to local storage (backup)
 */
function saveFeedbackQueue() {
    try {
        localStorage.setItem(FEEDBACK_CONFIG.storageKey, JSON.stringify(feedbackQueue));
    } catch (e) {
        console.warn('[Feedback] Failed to save feedback queue:', e);
    }
}

// ============================================================================
// Feedback Recording
// ============================================================================

/**
 * Record a prediction for potential feedback collection
 * Called when classifyStroke makes a prediction
 *
 * @param {Object} params - Prediction parameters
 * @param {Array} params.stroke - The raw stroke points
 * @param {number} params.predictedLabel - The predicted class index
 * @param {number} params.confidence - Prediction confidence (0-1)
 * @param {Array} params.probabilities - All class probabilities
 * @param {Object} params.modifier - The modifier group created
 * @param {ImageData} params.imageData - The extracted image data (optional)
 */
function recordPrediction({
    stroke,
    predictedLabel,
    confidence,
    probabilities,
    modifier,
    imageData
}) {
    if (!FEEDBACK_CONFIG.enabled) return;

    // Skip if confidence is too high (model is already confident)
    // if (confidence > FEEDBACK_CONFIG.uncertaintyThreshold) {
    //     console.log('[Feedback] Skipping high-confidence prediction:', confidence);
    //     return;
    // }

    // Skip non-prediction strokes
    if (predictedLabel === undefined || predictedLabel === null) return;

    const predictionId = modifier?.id || Date.now().toString();

    // Downsample stroke if too long
    const sampledStroke = downsampleStroke(stroke, FEEDBACK_CONFIG.maxStrokePoints);

    const predictionData = {
        id: predictionId,
        timestamp: Date.now(),
        sessionId: sessionId,
        stroke: sampledStroke,
        predictedLabel: predictedLabel,
        confidence: confidence,
        probabilities: probabilities,
        // Will be set when feedback is finalized
        accepted: null,
        correctedLabel: null,
    };

    // Store pending prediction
    pendingPredictions.set(predictionId, predictionData);

    // Set timeout for implicit acceptance
    setTimeout(() => {
        finalizePrediction(predictionId, true);
    }, FEEDBACK_CONFIG.acceptanceTimeout);
}

/**
 * Record when user undoes a prediction (implicit rejection)
 * Called from the undo() function
 *
 * @param {Object} action - The undo action
 */
function recordUndo(action) {
    if (!FEEDBACK_CONFIG.enabled) return;

    // Only care about styling changes (box, curly, etc.) and delete
    if (action.change !== 'styling' && action.change !== 'delete') return;

    // Get the modifier that was undone
    const modifierId = action.groupToRemove?.id;

    if (modifierId && pendingPredictions.has(modifierId)) {
        finalizePrediction(modifierId, false);
    }
}

/**
 * Record when user redoes a prediction (they wanted it after all)
 * Called from the redo() function
 *
 * @param {Object} action - The redo action
 */
function recordRedo(action) {
    if (!FEEDBACK_CONFIG.enabled) return;

    // If they redo a styling change, they actually wanted it
    if (action.change === 'styling' && action.groupToAdd?.id) {
        const modifierId = action.groupToAdd.id;

        // If we have a pending rejection, convert it to acceptance
        const pending = pendingPredictions.get(modifierId);
        if (pending && pending.accepted === false) {
            pending.accepted = true;
            addToFeedbackQueue(pending);
            pendingPredictions.delete(modifierId);
        }
    }
}

/**
 * Finalize a prediction (either accepted or rejected)
 *
 * @param {string} predictionId - The prediction ID
 * @param {boolean} accepted - Whether the prediction was accepted
 */
function finalizePrediction(predictionId, accepted) {
    const prediction = pendingPredictions.get(predictionId);

    if (!prediction) return;
    if (prediction.accepted !== null) return; // Already finalized

    prediction.accepted = accepted;
    prediction.finalizedAt = Date.now();

    addToFeedbackQueue(prediction);
    pendingPredictions.delete(predictionId);

    console.log(`[Feedback] Prediction ${predictionId} ${accepted ? 'accepted' : 'rejected'}`);
}

/**
 * Add feedback to the queue and trigger upload if batch is ready
 *
 * @param {Object} feedback - The feedback data
 */
function addToFeedbackQueue(feedback) {
    // Clean up data for storage
    const cleanFeedback = {
        sessionId: feedback.sessionId,
        timestamp: feedback.timestamp,
        finalizedAt: feedback.finalizedAt,
        stroke: feedback.stroke,
        predictedLabel: feedback.predictedLabel,
        confidence: feedback.confidence,
        accepted: feedback.accepted,
        // Include device info for analysis
        deviceInfo: {
            userAgent: navigator.userAgent.substring(0, 100),
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight,
            touchSupport: 'ontouchstart' in window,
        }
    };

    feedbackQueue.push(cleanFeedback);
    saveFeedbackQueue();

    // Upload if batch is ready
    if (feedbackQueue.length >= FEEDBACK_CONFIG.batchSize) {
        console.log('[Feedback] Batch size reached, uploading feedback');
        uploadFeedbackBatch();
    }
}

// ============================================================================
// Firebase Upload
// ============================================================================

/**
 * Upload feedback batch to Firestore
 */
async function uploadFeedbackBatch() {
    if (feedbackQueue.length === 0) return;

    console.log('[Feedback] Uploading feedback batch to Firestore');

    // Check if Firebase is available
    if (typeof firebase === 'undefined' || !firebase.firestore) {
        console.warn('[Feedback] Firebase not available, keeping feedback in local storage');
        return;
    }

    const db = firebase.firestore();
    const batch = db.batch();
    const collectionRef = db.collection(FEEDBACK_CONFIG.collectionName);

    // Take items to upload
    const toUpload = feedbackQueue.splice(0, FEEDBACK_CONFIG.batchSize);

    try {
        // Add each feedback item to the batch
        for (const feedback of toUpload) {
            const docRef = collectionRef.doc();
            batch.set(docRef, {
                ...feedback,
                uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
        }

        await batch.commit();
        console.log(`[Feedback] Uploaded ${toUpload.length} feedback items`);

        // Save remaining queue
        saveFeedbackQueue();

    } catch (error) {
        console.error('[Feedback] Upload failed:', error);

        // Put items back in queue for retry
        feedbackQueue.unshift(...toUpload);
        saveFeedbackQueue();
    }
}

/**
 * Force upload all pending feedback (call on page unload)
 */
function flushFeedback() {
    // Finalize all pending predictions as accepted
    for (const [id, prediction] of pendingPredictions) {
        if (prediction.accepted === null) {
            finalizePrediction(id, true);
        }
    }

    // Try to upload (may not complete if page is closing)
    if (feedbackQueue.length > 0) {
        uploadFeedbackBatch();
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Downsample a stroke to reduce data size
 * Uses Ramer-Douglas-Peucker algorithm simplified version
 *
 * @param {Array} stroke - Original stroke points
 * @param {number} maxPoints - Maximum number of points
 * @returns {Array} Downsampled stroke
 */
function downsampleStroke(stroke, maxPoints) {
    if (!stroke || stroke.length <= maxPoints) {
        return stroke;
    }

    // Simple uniform sampling
    const step = stroke.length / maxPoints;
    const sampled = [];

    for (let i = 0; i < maxPoints; i++) {
        const idx = Math.min(Math.floor(i * step), stroke.length - 1);
        const point = stroke[idx];
        // Only keep x, y coordinates (remove pressure, timestamp, etc.)
        sampled.push({
            x: Math.round(point.x * 100) / 100,
            y: Math.round(point.y * 100) / 100,
        });
    }

    return sampled;
}

/**
 * Toggle data collection opt-in
 *
 * @param {boolean} optIn - Whether to opt in
 */
function setDataCollectionOptIn(optIn) {
    localStorage.setItem('onepen_data_collection_opt_in', optIn ? 'true' : 'false');
    FEEDBACK_CONFIG.enabled = optIn;

    if (!optIn) {
        // Clear any pending data
        feedbackQueue = [];
        pendingPredictions.clear();
        localStorage.removeItem(FEEDBACK_CONFIG.storageKey);
        console.log('[Feedback] Data collection disabled and data cleared');
    } else {
        console.log('[Feedback] Data collection enabled');
    }
}

/**
 * Check if data collection is enabled
 *
 * @returns {boolean} Whether data collection is enabled
 */
function isDataCollectionEnabled() {
    return FEEDBACK_CONFIG.enabled;
}

/**
 * Get feedback statistics for display
 *
 * @returns {Object} Statistics object
 */
function getFeedbackStats() {
    return {
        queueSize: feedbackQueue.length,
        pendingCount: pendingPredictions.size,
        enabled: FEEDBACK_CONFIG.enabled,
        sessionId: sessionId,
    };
}

// ============================================================================
// UI Integration
// ============================================================================

/**
 * Show the opt-in modal if user hasn't made a choice yet
 */
function showOptInModalIfNeeded() {
    const hasChoice = localStorage.getItem('onepen_data_collection_opt_in');

    if (hasChoice === null) {
        const modal = document.getElementById('dataOptInModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }
}

/**
 * Initialize UI elements (modal and settings toggle)
 */
function initFeedbackUI() {
    // Opt-in modal buttons
    const yesBtn = document.getElementById('dataOptInYes');
    const noBtn = document.getElementById('dataOptInNo');
    const modal = document.getElementById('dataOptInModal');

    if (yesBtn) {
        yesBtn.addEventListener('click', () => {
            setDataCollectionOptIn(true);
            if (modal) modal.style.display = 'none';
            updateSettingsToggle(true);
        });
    }

    if (noBtn) {
        noBtn.addEventListener('click', () => {
            setDataCollectionOptIn(false);
            if (modal) modal.style.display = 'none';
            updateSettingsToggle(false);
        });
    }

    // Settings toggle
    const toggle = document.getElementById('dataCollectionToggle');
    if (toggle) {
        // Set initial state
        const optedIn = localStorage.getItem('onepen_data_collection_opt_in');
        toggle.checked = optedIn === 'true';

        // Handle changes
        toggle.addEventListener('change', (e) => {
            setDataCollectionOptIn(e.target.checked);
        });
    }

    // Show modal after a short delay if needed
    setTimeout(showOptInModalIfNeeded, 2000);
}

/**
 * Update the settings toggle to match current state
 */
function updateSettingsToggle(enabled) {
    const toggle = document.getElementById('dataCollectionToggle');
    if (toggle) {
        toggle.checked = enabled;
    }
}

// ============================================================================
// Event Listeners
// ============================================================================

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initFeedbackCollector();
        initFeedbackUI();
    });
} else {
    initFeedbackCollector();
    initFeedbackUI();
}

// Flush feedback on page unload
window.addEventListener('beforeunload', flushFeedback);

// Periodic upload attempt (every 30 seconds)
setInterval(() => {
    if (feedbackQueue.length > 0) {
        uploadFeedbackBatch();
    }
}, 30000);

// Export functions for use in main.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        recordPrediction,
        recordUndo,
        recordRedo,
        setDataCollectionOptIn,
        isDataCollectionEnabled,
        getFeedbackStats,
        flushFeedback,
    };
}
