<?php
/**
 * Mobile App - Get Files for Lead
 * Returns list of uploaded images and floorplans for a specific lead
 * 
 * USAGE:
 * GET /mobile_get_files.php?lead_id=123&api_key=YOUR_KEY
 */

// ===========================================
// CONFIGURATION
// ===========================================
$API_KEY = 'sagar_home_mobile_2024_secure_key'; // Same key as upload script

// ===========================================
// CORS HEADERS
// ===========================================
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '*';
header("Access-Control-Allow-Origin: $origin");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

function respond($success, $message, $data = null, $code = 200) {
    http_response_code($code);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ]);
    exit();
}

// Validate API key
$apiKey = isset($_SERVER['HTTP_X_API_KEY']) ? $_SERVER['HTTP_X_API_KEY'] : 
          (isset($_GET['api_key']) ? $_GET['api_key'] : '');

if ($apiKey !== $API_KEY) {
    respond(false, 'Invalid API key', null, 401);
}

// Validate lead_id
if (!isset($_GET['lead_id']) || !is_numeric($_GET['lead_id'])) {
    respond(false, 'lead_id is required', null, 400);
}
$leadId = intval($_GET['lead_id']);

// Base URL for generating full URLs
$baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http');
$baseUrl .= '://' . $_SERVER['HTTP_HOST'];

// Get images
$imageDir = "uploads/leads/{$leadId}";
$images = [];
if (is_dir($imageDir)) {
    $imageFiles = glob($imageDir . "/*.{jpg,jpeg,png,gif,webp,JPG,JPEG,PNG,GIF,WEBP}", GLOB_BRACE);
    foreach ($imageFiles as $file) {
        $filename = basename($file);
        $images[] = [
            'filename' => $filename,
            'path' => $file,
            'url' => $baseUrl . '/' . $file,
            'size' => filesize($file),
            'modified' => filemtime($file)
        ];
    }
}

// Get floorplans/PDFs
$pdfDir = "uploads/leads/{$leadId}/floorplans";
$floorplans = [];
if (is_dir($pdfDir)) {
    $pdfFiles = glob($pdfDir . "/*.{pdf,PDF}", GLOB_BRACE);
    foreach ($pdfFiles as $file) {
        $filename = basename($file);
        $floorplans[] = [
            'filename' => $filename,
            'path' => $file,
            'url' => $baseUrl . '/' . $file,
            'size' => filesize($file),
            'modified' => filemtime($file)
        ];
    }
}

respond(true, 'Files retrieved successfully', [
    'lead_id' => $leadId,
    'images' => $images,
    'floorplans' => $floorplans,
    'image_count' => count($images),
    'floorplan_count' => count($floorplans)
]);
?>
