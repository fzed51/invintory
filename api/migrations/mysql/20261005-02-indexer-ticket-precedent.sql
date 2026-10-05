ALTER TABLE user_sessions ADD UNIQUE KEY uq_sessions_previous_hash (previous_refresh_session_hash);
