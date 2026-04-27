<?php
function getDB(): PDO {
    $dbPath = __DIR__ . '/ark_rapid.db';
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $db->exec("PRAGMA journal_mode=WAL");
    $db->exec("PRAGMA foreign_keys=ON");

    $db->exec("CREATE TABLE IF NOT EXISTS comments (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id    TEXT    NOT NULL,
        user_name   TEXT    NOT NULL DEFAULT 'Anonymous',
        comment_type TEXT   NOT NULL DEFAULT 'note'
                            CHECK(comment_type IN ('support','challenge','question','note')),
        comment_text TEXT   NOT NULL,
        ip_address  TEXT,
        is_approved INTEGER NOT NULL DEFAULT 1,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    $db->exec("CREATE INDEX IF NOT EXISTS idx_comments_event ON comments(event_id, is_approved)");

    return $db;
}
