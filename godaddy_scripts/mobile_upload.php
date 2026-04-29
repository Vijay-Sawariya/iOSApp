<?php
/**
 * Mobile App File Upload Script for Sagar Home LMS
 * 
 * INSTALLATION:
 * 1. Upload this file to your GoDaddy server root (same folder as lead_details.php)
 * 2. Ensure the 'uploads/leads/' directory exists and is writable
 * 3. Set proper permissions: chmod 755 for directories, chmod 644 for files
 * 
 * USAGE:
 * POST /mobile_upload.php
 * Content-Type: multipart/form-data
 * 
 * Parameters:
 * - file: The file to upload
 * - lead_id: The lead ID (required)
 * - type: 'image' or 'floorplan' (default: 'image')
 * - api_key: Security key (configure below)
 */

// ===========================================
// CONFIGURATION - CHANGE THESE VALUES
// ===========================================
$API_KEY = 'SagarHome_Upload_2024_Secret'; // Change this to a secure key
$ALLOWED_ORIGINS = [
    'https://property-audit-suite.preview.emergentagent.com',
    'http://localhost:3000',
    'http://localhost:8081',
    '*' // Allow all for development - remove in production
];

// ===========================================
// CORS HEADERS
// ===========================================
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '*';
header("Access-Control-Allow-Origin: $origin");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=UTF-8");

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================
function respond($success, $message, $data = null, $code = 200) {
    http_response_code($code);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ]);
    exit();
}

function validateApiKey($key) {
    global $API_KEY;
    return $key === $API_KEY;
}

function sanitizeFilename($filename) {
    // Remove any path components
    $filename = basename($filename);
    // Replace spaces with underscores
    $filename = str_replace(' ', '_', $filename);
    // Remove any non-alphanumeric characters except dots, underscores, and hyphens
    $filename = preg_replace('/[^a-zA-Z0-9._-]/', '', $filename);
    return $filename;
}

function getUniqueFilename($dir, $filename) {
    $pathInfo = pathinfo($filename);
    $baseName = $pathInfo['filename'];
    $extension = isset($pathInfo['extension']) ? '.' . $pathInfo['extension'] : '';
    
    $newFilename = $filename;
    $counter = 1;
    
    while (file_exists($dir . '/' . $newFilename)) {
        $newFilename = $baseName . '_' . $counter . $extension;
        $counter++;
    }
    
    return $newFilename;
}

// ===========================================
// MAIN LOGIC
// ===========================================

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, 'Only POST requests are allowed', null, 405);
}

// Validate API key
$apiKey = isset($_SERVER['HTTP_X_API_KEY']) ? $_SERVER['HTTP_X_API_KEY'] : 
          (isset($_POST['api_key']) ? $_POST['api_key'] : '');

if (!validateApiKey($apiKey)) {
    respond(false, 'Invalid API key', null, 401);
}

// Validate lead_id
if (!isset($_POST['lead_id']) || !is_numeric($_POST['lead_id'])) {
    respond(false, 'lead_id is required and must be numeric', null, 400);
}
$leadId = intval($_POST['lead_id']);

// Validate file
if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    $errorMessages = [
        UPLOAD_ERR_INI_SIZE => 'File exceeds upload_max_filesize',
        UPLOAD_ERR_FORM_SIZE => 'File exceeds MAX_FILE_SIZE',
        UPLOAD_ERR_PARTIAL => 'File was only partially uploaded',
        UPLOAD_ERR_NO_FILE => 'No file was uploaded',
        UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder',
        UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
        UPLOAD_ERR_EXTENSION => 'A PHP extension stopped the upload',
    ];
    $errorCode = isset($_FILES['file']) ? $_FILES['file']['error'] : UPLOAD_ERR_NO_FILE;
    $errorMsg = isset($errorMessages[$errorCode]) ? $errorMessages[$errorCode] : 'Unknown upload error';
    respond(false, $errorMsg, null, 400);
}

$file = $_FILES['file'];
$type = isset($_POST['type']) ? $_POST['type'] : 'image';

// Validate file type
$allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$allowedImageExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
$allowedPdfTypes = ['application/pdf'];
$allowedPdfExt = ['pdf'];

$fileExt = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$fileMime = mime_content_type($file['tmp_name']);

if ($type === 'floorplan' || $type === 'pdf') {
    if (!in_array($fileMime, $allowedPdfTypes) || !in_array($fileExt, $allowedPdfExt)) {
        respond(false, 'Only PDF files are allowed for floorplans', null, 400);
    }
    $uploadDir = "uploads/leads/{$leadId}/floorplans";
} else {
    if (!in_array($fileMime, $allowedImageTypes) || !in_array($fileExt, $allowedImageExt)) {
        respond(false, 'Only image files (JPG, PNG, GIF, WebP) are allowed', null, 400);
    }
    $uploadDir = "uploads/leads/{$leadId}";
}

// File size limit (10MB)
$maxSize = 10 * 1024 * 1024;
if ($file['size'] > $maxSize) {
    respond(false, 'File size exceeds 10MB limit', null, 400);
}

// Create directory if it doesn't exist
if (!is_dir($uploadDir)) {
    if (!mkdir($uploadDir, 0755, true)) {
        respond(false, 'Failed to create upload directory', null, 500);
    }
}

// Generate unique filename
$safeFilename = sanitizeFilename($file['name']);
$uniqueFilename = getUniqueFilename($uploadDir, $safeFilename);
$targetPath = $uploadDir . '/' . $uniqueFilename;

// Move uploaded file
if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    respond(false, 'Failed to save uploaded file', null, 500);
}

// Generate public URL
$baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http');
$baseUrl .= '://' . $_SERVER['HTTP_HOST'];
$fileUrl = $baseUrl . '/' . $targetPath;

// Success response
respond(true, 'File uploaded successfully', [
    'filename' => $uniqueFilename,
    'path' => $targetPath,
    'url' => $fileUrl,
    'size' => $file['size'],
    'type' => $type,
    'lead_id' => $leadId
]);
?>
