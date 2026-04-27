<?php
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/db.php';

function jsonResponse(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function sanitize(string $val, int $maxLen = 1000): string {
    return mb_substr(trim(strip_tags($val)), 0, $maxLen);
}

try {
    $db = getDB();
    $method = $_SERVER['REQUEST_METHOD'];

    /* ── GET /api/comments.php?event_id=xxx ── */
    if ($method === 'GET') {
        $eventId = sanitize($_GET['event_id'] ?? '', 100);
        if ($eventId === '') {
            jsonResponse(['error' => 'event_id is required'], 400);
        }
        $stmt = $db->prepare(
            "SELECT id, event_id, user_name, comment_type, comment_text, created_at
               FROM comments
              WHERE event_id = :eid AND is_approved = 1
              ORDER BY created_at ASC
              LIMIT 200"
        );
        $stmt->execute([':eid' => $eventId]);
        $comments = $stmt->fetchAll();
        jsonResponse(['success' => true, 'event_id' => $eventId, 'comments' => $comments]);
    }

    /* ── POST /api/comments.php ── */
    if ($method === 'POST') {
        $raw = file_get_contents('php://input');
        $body = json_decode($raw, true);

        if (!is_array($body)) {
            jsonResponse(['error' => 'Invalid JSON body'], 400);
        }

        $eventId     = sanitize($body['event_id']    ?? '', 100);
        $userName    = sanitize($body['user_name']   ?? 'Anonymous', 80);
        $commentType = sanitize($body['comment_type'] ?? 'note', 20);
        $commentText = sanitize($body['comment_text'] ?? '', 2000);

        if ($eventId === '')     jsonResponse(['error' => 'event_id is required'], 400);
        if ($commentText === '') jsonResponse(['error' => 'comment_text is required'], 400);

        $allowed = ['support', 'challenge', 'question', 'note'];
        if (!in_array($commentType, $allowed, true)) $commentType = 'note';
        if ($userName === '') $userName = 'Anonymous';

        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
        $ip = sanitize(explode(',', $ip)[0], 45);

        // Naive rate limit: max 5 comments from same IP in 10 minutes
        $checkStmt = $db->prepare(
            "SELECT COUNT(*) FROM comments
              WHERE ip_address = :ip
                AND created_at > datetime('now','-10 minutes')"
        );
        $checkStmt->execute([':ip' => $ip]);
        if ((int)$checkStmt->fetchColumn() >= 5) {
            jsonResponse(['error' => 'Too many comments. Please wait a few minutes.'], 429);
        }

        $insert = $db->prepare(
            "INSERT INTO comments (event_id, user_name, comment_type, comment_text, ip_address)
             VALUES (:eid, :name, :type, :text, :ip)"
        );
        $insert->execute([
            ':eid'  => $eventId,
            ':name' => $userName,
            ':type' => $commentType,
            ':text' => $commentText,
            ':ip'   => $ip,
        ]);

        jsonResponse(['success' => true, 'id' => (int)$db->lastInsertId()], 201);
    }

    jsonResponse(['error' => 'Method not allowed'], 405);

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
} catch (Throwable $e) {
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
