-- ============================================================================
-- UGNAYRA — Migration 004: Isolated WebRTC Video Signaling Seam (Future-Ready)
-- Separated per Section 6.I — No fake UI controls; ready for real SDP/ICE relay
-- ============================================================================

BEGIN;

DO $$ BEGIN
    CREATE TYPE rtc_call_status AS ENUM (
        'ringing',
        'connected',
        'ended',
        'declined',
        'missed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rtc_call_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    initiator_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status            rtc_call_status NOT NULL DEFAULT 'ringing',
    started_at        TIMESTAMPTZ,
    ended_at          TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rtc_signaling_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_session_id   UUID NOT NULL REFERENCES rtc_call_sessions(id) ON DELETE CASCADE,
    sender_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    signal_type       VARCHAR(24) NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate', 'hangup')),
    payload           JSONB NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rtc_signals_session_created
    ON rtc_signaling_events (call_session_id, created_at ASC);

COMMIT;
